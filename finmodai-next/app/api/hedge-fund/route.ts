import { NextRequest, NextResponse } from 'next/server';
import { hasAnyAnthropicKey } from '@/lib/anthropicKey';
import { getOpenAIKey, hasAnyOpenAIKey } from '@/lib/openaiKey';
import { generateTextWithProviderFallback, type LlmMessage } from '@/lib/llm/generateText';
import { matchThemes } from '@/lib/execution/themeClassifier';
import type { UserIntent } from '@/lib/execution/userIntent';
import type { AssetMetadata } from '@/lib/execution/assetMetadata';
import {
  buildHybridScore,
  signalFromHybridScore,
} from '@/lib/pm/monitoring/hybridScore';
import type { QuantAnalystKey, QuantScoreComponents } from '@/lib/pm/monitoring/types';
import {
  buildDeterministicNewsSentiment,
  formatNewsContextForPrompt,
  type CompanyNewsHeadline,
} from '@/lib/pm/monitoring/newsSentiment';
import {
  formatResearchPacketForPrompt,
  isResearchPacket,
  type ResearchPacket,
} from '@/lib/pm/research/researchPacketContract';
import {
  memoToSignal,
  primaryRebuttalFor,
  runFunctionalDebate,
} from '@/lib/pm/debate/functionalDebate';
import type { FunctionalDebateResult } from '@/lib/pm/debate/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const AGENT_TIMEOUT_MS = 18_000;
const OPENAI_JSON_TIMEOUT_MS = 45_000;

const PERSONAS = [
  { key: 'warren_buffett',        name: 'Warren Buffett',          group: 'persona', style: 'value investing, wide moat businesses, long-term compounding, owner-operator mentality' },
  { key: 'charlie_munger',        name: 'Charlie Munger',          group: 'persona', style: 'mental models, quality businesses, invert problems, latticework of disciplines' },
  { key: 'ben_graham',            name: 'Ben Graham',              group: 'persona', style: 'deep value, margin of safety, quantitative screens, net-net stocks' },
  { key: 'peter_lynch',           name: 'Peter Lynch',             group: 'persona', style: 'GARP, invest in what you know, strong earnings growth, PEG ratio' },
  { key: 'nassim_taleb',          name: 'Nassim Taleb',            group: 'persona', style: 'tail risk, fragility vs antifragility, black swan events, convexity' },
  { key: 'michael_burry',         name: 'Michael Burry',           group: 'persona', style: 'contrarian deep value, asymmetric payoffs, against consensus, concentrated positions' },
  { key: 'cathie_wood',           name: 'Cathie Wood',             group: 'persona', style: 'disruptive innovation, 5-year price targets, exponential growth curves, platform businesses' },
  { key: 'aswath_damodaran',      name: 'Aswath Damodaran',        group: 'persona', style: 'rigorous DCF valuation, intrinsic value analysis, equity risk premium, narrative & numbers' },
  { key: 'stanley_druckenmiller', name: 'Stanley Druckenmiller',   group: 'persona', style: 'macro momentum, asymmetric bets, top-down thesis, trend following with conviction' },
  { key: 'bill_ackman',           name: 'Bill Ackman',             group: 'persona', style: 'activist investing, high-conviction concentrated, brand moat, predictable cash flows' },
  { key: 'phil_fisher',           name: 'Phil Fisher',             group: 'persona', style: 'scuttlebutt research, qualitative analysis, management quality, multi-decade growth' },
  { key: 'mohnish_pabrai',        name: 'Mohnish Pabrai',          group: 'persona', style: 'cloning great investors, heads-I-win-tails-I-don\'t-lose bets, patience, asymmetry' },
  { key: 'rakesh_jhunjhunwala',   name: 'Rakesh Jhunjhunwala',     group: 'persona', style: 'long-term structural growth, macro tailwinds, high conviction, emerging market lens' },
  { key: 'fundamentals',          name: 'Fundamentals Analyst',    group: 'quant',   style: 'revenue growth trajectory, margin expansion, balance sheet quality, free cash flow conversion' },
  { key: 'valuation',             name: 'Valuation Analyst',       group: 'quant',   style: 'P/E, EV/EBITDA, P/S, P/FCF multiples vs peers and historical range' },
  { key: 'technicals',            name: 'Technical Analyst',       group: 'quant',   style: 'price action, momentum indicators, RSI, MACD, moving averages, volume confirmation' },
  { key: 'sentiment',             name: 'Sentiment Analyst',       group: 'quant',   style: 'options flow, short interest, insider buying/selling, institutional positioning' },
  { key: 'news_sentiment',        name: 'News Sentiment Analyst',  group: 'quant',   style: 'recent news flow, analyst upgrades and downgrades, earnings revisions, catalyst pipeline' },
  { key: 'growth',                name: 'Growth Analyst',          group: 'quant',   style: 'TAM expansion, revenue acceleration, unit economics, LTV/CAC dynamics, market share gains' },
] as const;

type PersonaKey = typeof PERSONAS[number]['key'];
type HedgeFundMode = 'full' | 'monitoring' | 'committee';
type PersonaDefinition = typeof PERSONAS[number];

const MONITORING_KEYS = new Set<PersonaKey>([
  'fundamentals',
  'growth',
  'news_sentiment',
  'sentiment',
  'technicals',
  'valuation',
]);

function personasForMode(mode: HedgeFundMode): PersonaDefinition[] {
  if (mode === 'monitoring') return PERSONAS.filter(persona => MONITORING_KEYS.has(persona.key));
  if (mode === 'committee') return PERSONAS.filter(persona => persona.group === 'persona');
  return [...PERSONAS];
}

type RawSignal = {
  key:                  PersonaKey;
  name?:                string;
  score:                number;
  signal:               'bullish' | 'bearish' | 'neutral';
  confidence:           number;
  reasoning:            string;
  thesis:               string;
  risk:                 string;
  watch:                string;
  theme_fit_score:      number | null;
  theme_fit_reason:     string;
  business_consistency: boolean;
};

type MarketContext = {
  price:     number | null;
  changePct: number | null;
  marketCap: number | null;
  pe:        number | null;
  forwardPe: number | null;
  high52w:   number | null;
  low52w:    number | null;
  name:      string | null;
};

type AnalysisResult = {
  ticker:            string;
  mode:              HedgeFundMode;
  date:              string;
  decision:          { action: string; confidence: number; reasoning: string; sizing?: string } | null;
  signals:           { key: string; name: string; group: string; score: number; signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; thesis: string; risk: string; watch: string; theme_fit_score: number | null; theme_fit_reason: string; business_consistency: boolean; scoreComponents?: QuantScoreComponents }[];
  consensus:         { bullish: number; bearish: number; neutral: number };
  median_theme_fit:  number | null;
  source?:           'python_backend' | 'llm_fallback';
  degraded?:         boolean;
  degradedReason?:   string | null;
  debate?:           FunctionalDebateResult | null;
};

type PersonaPrompt = {
  messages: LlmMessage[];
  expectedKeys: string[];
};

type CompanyInfoPayload = {
  news?: CompanyNewsHeadline[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pythonBackendUrl(): string | null {
  if (process.env.ENABLE_PYTHON_AGENT_BACKEND !== 'true') return null;
  const raw = process.env.AI_AGENT_BACKEND_URL || process.env.PYTHON_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, '') : null;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

function clampConfidence(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 55;
  return Math.round(Math.max(0, Math.min(100, num)));
}

function parseSignal(value: unknown): RawSignal['signal'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'bullish' || normalized === 'bearish' || normalized === 'neutral') return normalized;
  return 'neutral';
}

function normalizePersonaSignals(raw: unknown, personas: PersonaDefinition[]): RawSignal[] {
  const payload = raw as { signals?: unknown };
  if (!Array.isArray(payload.signals)) return [];

  const byKey = new Map<string, RawSignal>();
  for (const item of payload.signals) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const persona = personas.find(p => p.key === key);
    if (!persona || byKey.has(persona.key)) continue;

    const themeFitRaw = row.theme_fit_score;
    const themeFitNum = typeof themeFitRaw === 'number' ? themeFitRaw : Number(themeFitRaw);
    const themeFit = Number.isFinite(themeFitNum)
      ? Math.max(0, Math.min(10, Math.round(themeFitNum * 10) / 10))
      : null;
    const reasoning = typeof row.reasoning === 'string' && row.reasoning.trim()
      ? row.reasoning.trim()
      : `${persona.name} gives ${persona.key === 'valuation' ? 'valuation' : 'style-specific'} context.`;
    const thesis = typeof row.thesis === 'string' && row.thesis.trim()
      ? row.thesis.trim()
      : reasoning;
    const risk = typeof row.risk === 'string' && row.risk.trim()
      ? row.risk.trim()
      : 'Risk depends on valuation, catalyst timing, and whether the core thesis keeps confirming.';
    const watch = typeof row.watch === 'string' && row.watch.trim()
      ? row.watch.trim()
      : 'Watch the next catalyst, estimate revision, or price-action confirmation.';

    byKey.set(persona.key, {
      key: persona.key,
      score: clampConfidence(row.score ?? (
        parseSignal(row.signal) === 'bullish'
          ? 50 + clampConfidence(row.confidence) / 2
          : parseSignal(row.signal) === 'bearish'
            ? 50 - clampConfidence(row.confidence) / 2
            : 50
      )),
      signal: parseSignal(row.signal),
      confidence: clampConfidence(row.confidence),
      reasoning,
      thesis,
      risk,
      watch,
      theme_fit_score: themeFit,
      theme_fit_reason: typeof row.theme_fit_reason === 'string' ? row.theme_fit_reason.trim() : '',
      business_consistency: typeof row.business_consistency === 'boolean' ? row.business_consistency : true,
    });
  }

  return personas
    .map(persona => byKey.get(persona.key))
    .filter((signal): signal is RawSignal => Boolean(signal));
}

function applyRequestThemePolicy(signals: RawSignal[], intent: UserIntent | null): RawSignal[] {
  if (intent?.themes.length) return signals;
  return signals.map(signal => ({
    ...signal,
    theme_fit_score: null,
    theme_fit_reason: '',
  }));
}

function agentModelCandidates(): string[] {
  // Return exactly ONE candidate — multiple models each add 18s to worst-case
  // wall-clock time, which would exceed the 30s Edge limit.
  const candidates = [
    process.env.ANTHROPIC_AGENT_MODEL,
    'claude-haiku-4-5-20251001',
    process.env.ANTHROPIC_MODEL,
  ].filter((model): model is string => typeof model === 'string' && model.trim().length > 0);
  return candidates.slice(0, 1);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function buildUserContextBlock(intent: UserIntent | null): string {
  if (!intent) return '';
  const themes    = intent.themes.length > 0 ? intent.themes.join(', ') : 'no specific theme';
  const capital   = intent.capital_usd != null ? `$${intent.capital_usd.toLocaleString()}` : 'not specified';
  const count     = intent.position_count ?? 'not specified';
  return `
USER CONTEXT
The user has asked for a portfolio with these characteristics:
- Themes: ${themes}
- Risk profile: ${intent.risk_profile}
- Position count requested: ${count}
- Capital: ${capital}

Original prompt: "${intent.raw_prompt}"

Your analysis must be consistent with this context. If the ticker you're evaluating
does not fit the user's stated themes, say so directly and assign a low theme_fit_score.
Do not pretend a ticker fits a theme it doesn't.`.trim();
}

function buildAssetRealityBlock(ticker: string, asset: AssetMetadata | null): string {
  if (!asset) return `WHAT THIS TICKER ACTUALLY IS\nTicker: ${ticker}\n(No business metadata available — evaluate on ticker name and market data only.)`;
  return `
WHAT THIS TICKER ACTUALLY IS
Ticker: ${asset.ticker}
Name: ${asset.name}
Sector: ${asset.sector}
Industry: ${asset.industry}
Asset class: ${asset.asset_class}
Business: ${asset.business_summary}

Your thesis must be consistent with the business above. A thesis that contradicts
the company's actual business will be rejected.`.trim();
}

async function tryPythonBackend(ticker: string): Promise<AnalysisResult | null> {
  const backend = pythonBackendUrl();
  if (!backend) return null;

  try {
    const res = await fetch(`${backend}/api/v1/hedge-fund/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json() as AnalysisResult;
    return {
      ...data,
      mode: 'full',
      median_theme_fit: null,
      source: 'python_backend',
      signals: (data.signals ?? []).map(signal => ({
        ...signal,
        score: signal.score ?? (
          signal.signal === 'bullish'
            ? 50 + signal.confidence / 2
            : signal.signal === 'bearish'
              ? 50 - signal.confidence / 2
              : 50
        ),
        theme_fit_score:      signal.theme_fit_score      ?? null,
        theme_fit_reason:     signal.theme_fit_reason     ?? '',
        business_consistency: signal.business_consistency ?? true,
        thesis:               signal.thesis               ?? signal.reasoning,
      })),
    };
  } catch {
    return null;
  }
}

function fallbackPersonaSignals(
  ticker: string,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
  ctx: MarketContext | null,
  news: CompanyNewsHeadline[],
): RawSignal[] {
  const themeMatch = intent?.themes.length
    ? matchThemes({
      ticker,
      name: asset?.name,
      sector: asset?.sector,
      industry: asset?.industry,
      business_summary: asset?.business_summary,
    }, intent.themes)
    : null;
  const offTheme = themeMatch ? !themeMatch.fits : false;
  const pricePosition =
    ctx?.price != null && ctx.high52w != null && ctx.low52w != null && ctx.high52w > ctx.low52w
      ? (ctx.price - ctx.low52w) / (ctx.high52w - ctx.low52w)
      : 0.5;

  const technicalSignal: RawSignal['signal'] =
    pricePosition > 0.65 ? 'bullish' : pricePosition < 0.35 ? 'bearish' : 'neutral';
  const growthSignal: RawSignal['signal'] = offTheme ? 'bearish' : 'neutral';
  const confidenceBase = offTheme ? 62 : 52;
  const newsFallback = buildDeterministicNewsSentiment(ticker, news, ctx?.name ?? asset?.name);

  const compactSignals: RawSignal[] = [
    {
      key: 'fundamentals',
      score: 50,
      signal: offTheme ? 'neutral' : 'neutral',
      confidence: confidenceBase,
      reasoning: 'Fast check only: fundamentals need the full agent pass before a high-conviction call.',
      thesis: `${ticker} should stay in work-up mode until revenue durability, margins, and cash-flow quality are confirmed by the full run.`,
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: full persona evidence was unavailable, so conviction should stay limited.',
      watch: 'Watch for a full agent refresh before treating this as confirmed.',
      business_consistency: !offTheme,
    },
    {
      key: 'valuation',
      score: 50,
      signal: 'neutral',
      confidence: confidenceBase - 2,
      reasoning: 'Fast check only: valuation was not fully rebuilt before the latency guardrail.',
      thesis: 'Do not treat this as a margin-of-safety verdict; use the compressed valuation signal elsewhere in the stock page.',
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: valuation sensitivity was not fully re-underwritten.',
      watch: 'Watch valuation versus growth expectations in the full agent pass.',
      business_consistency: !offTheme,
    },
    {
      key: 'technicals',
      score: Math.round(25 + pricePosition * 50),
      signal: technicalSignal,
      confidence: confidenceBase + 3,
      reasoning: `Fast check only: price is roughly ${(pricePosition * 100).toFixed(0)}% through its 52-week range.`,
      thesis: technicalSignal === 'bullish'
        ? 'Tape is not fighting the setup, but this is not a full technical confirmation.'
        : technicalSignal === 'bearish'
          ? 'Tape needs repair before this gets upgraded.'
          : 'Tape is mixed; wait for confirmation.',
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: price action can reverse before full technical confirmation.',
      watch: 'Watch whether price confirms or rejects the current trend.',
      business_consistency: !offTheme,
    },
    {
      key: 'news_sentiment',
      score: newsFallback.score,
      signal: newsFallback.signal,
      confidence: newsFallback.confidence,
      reasoning: newsFallback.reasoning,
      thesis: newsFallback.thesis,
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: newsFallback.risk,
      watch: newsFallback.watch,
      business_consistency: !offTheme,
    },
    {
      key: 'sentiment',
      score: 50,
      signal: 'neutral',
      confidence: confidenceBase - 1,
      reasoning: 'Fast check only: positioning, options flow, short interest, and insider activity were not fully refreshed.',
      thesis: 'Treat market sentiment as unconfirmed until the monitoring agent completes a live refresh.',
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: positioning can change quickly around catalysts.',
      watch: 'Watch options skew, short interest, insider activity, and institutional positioning.',
      business_consistency: !offTheme,
    },
    {
      key: 'growth',
      score: offTheme ? 35 : 50,
      signal: growthSignal,
      confidence: confidenceBase,
      reasoning: offTheme
        ? `${ticker} failed the requested theme-fit screen.`
        : 'Fast check only: growth thesis needs full agent confirmation.',
      thesis: offTheme
        ? `${ticker} may be investable elsewhere, but it should not be forced into this themed mandate.`
        : `${ticker} remains a work-up candidate, not a fully confirmed agent-backed idea.`,
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: offTheme
        ? 'Theme mismatch can make portfolio fit poor even if the standalone stock works.'
        : 'Growth expectations may already be priced into the stock.',
      watch: offTheme
        ? 'Watch for evidence that the business actually fits the requested theme.'
        : 'Watch whether growth converts into estimate revisions.',
      business_consistency: !offTheme,
    },
  ];

  return compactSignals;
}

function synthesizeDecision(
  consensus: { bullish: number; bearish: number; neutral: number },
  medianThemeFit: number | null,
): AnalysisResult['decision'] {
  if (medianThemeFit !== null && medianThemeFit < 5) {
    return {
      action: 'hold',
      confidence: 62,
      sizing: 'Avoid',
      reasoning: 'Theme fit is too weak for the requested mandate, so the PM read rejects adding it here.',
    };
  }
  if (consensus.bullish >= consensus.bearish + 5) {
    return {
      action: 'buy',
      confidence: 64,
      sizing: 'Track / Build',
      reasoning: 'The persona perspectives lean bullish, but they are correlated interpretations; sizing still needs catalyst and risk confirmation.',
    };
  }
  if (consensus.bearish >= consensus.bullish + 4) {
    return {
      action: 'sell',
      confidence: 62,
      sizing: 'Avoid',
      reasoning: 'The persona perspectives lean negative; do not add unless catalyst evidence reverses the setup.',
    };
  }
  return {
    action: 'hold',
    confidence: 58,
    sizing: 'Track',
    reasoning: 'The persona perspectives are mixed; keep this tracked until stronger evidence comes through.',
  };
}

function logHedgeFundFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = message.includes('abort') || message.includes('timeout') || message.includes('signal');
  const isParseError = message.includes('JSON') || message.includes('parse') || message.includes('Unexpected');
  const isAPIError = message.includes('400') || message.includes('401') || message.includes('429') || message.includes('500');

  console.error(`[hedge-fund] ${scope} failed`, {
    error: message,
    type: isTimeout ? 'TIMEOUT' : isParseError ? 'PARSE' : isAPIError ? 'API' : 'UNKNOWN',
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
  });
}

async function fetchMarketContext(ticker: string): Promise<MarketContext | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,forwardPE,shortName`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      quoteResponse?: {
        result?: Array<{
          regularMarketPrice?: number;
          regularMarketChangePercent?: number;
          marketCap?: number;
          trailingPE?: number;
          forwardPE?: number;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          shortName?: string;
        }>;
      };
    };
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return null;
    return {
      price:     q.regularMarketPrice          ?? null,
      changePct: q.regularMarketChangePercent  ?? null,
      marketCap: q.marketCap                   ?? null,
      pe:        q.trailingPE                  ?? null,
      forwardPe: q.forwardPE                   ?? null,
      high52w:   q.fiftyTwoWeekHigh            ?? null,
      low52w:    q.fiftyTwoWeekLow             ?? null,
      name:      q.shortName                   ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchCompanyNews(ticker: string, origin: string): Promise<CompanyNewsHeadline[]> {
  try {
    const response = await fetch(`${origin}/api/company-info?ticker=${encodeURIComponent(ticker)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as CompanyInfoPayload;
    return Array.isArray(payload.news)
      ? payload.news
        .filter(item => typeof item?.title === 'string' && item.title.trim().length > 0)
        .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

async function runPersonaSignals(
  ticker: string,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
  ctx: MarketContext | null,
  news: CompanyNewsHeadline[],
  personas: PersonaDefinition[],
  researchPacket: ResearchPacket | null,
): Promise<RawSignal[]> {
  const prompt = buildPersonaPrompt(ticker, intent, asset, ctx, news, personas, researchPacket);

  if (getOpenAIKey('user')) {
    try {
      const signals = await runPersonaSignalsOpenAIJson(ticker, prompt, personas);
      return applyRequestThemePolicy(signals, intent);
    } catch (error) {
      logHedgeFundFailure('openai persona json', error);
    }
  }

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'user',
    temperature: 0.25,
    maxTokens: 2200,
    timeoutMs: AGENT_TIMEOUT_MS,
    anthropicModels: agentModelCandidates(),
    openAiModels: [],
    messages: prompt.messages,
  });

  try {
    const parsed = extractJsonObject(result?.text ?? '{}');
    const signals = normalizePersonaSignals(parsed, personas);
    if (signals.length < personas.length) {
      throw new Error(`LLM returned ${signals.length}/${personas.length} persona signals`);
    }
    return applyRequestThemePolicy(signals, intent);
  } catch (error) {
    logHedgeFundFailure('anthropic persona parse', error);
    throw error;
  }
}

function buildPersonaPrompt(
  ticker: string,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
  ctx: MarketContext | null,
  news: CompanyNewsHeadline[],
  personas: PersonaDefinition[],
  researchPacket: ResearchPacket | null,
): PersonaPrompt {
  const hasThemes = intent && intent.themes.length > 0;

  const personaList = personas.map((p, i) =>
    `${i + 1}. ${p.name} [key: ${p.key}] — ${p.style}`,
  ).join('\n');

  const dataStr = ctx ? [
    ctx.name    ? `Company: ${ctx.name}` : '',
    ctx.price   != null ? `Price: $${ctx.price.toFixed(2)}` : '',
    ctx.changePct != null ? `Daily change: ${ctx.changePct >= 0 ? '+' : ''}${ctx.changePct.toFixed(2)}%` : '',
    ctx.marketCap != null ? `Market cap: $${(ctx.marketCap / 1e9).toFixed(1)}B` : '',
    ctx.pe      != null ? `Trailing P/E: ${ctx.pe.toFixed(1)}` : '',
    ctx.forwardPe != null ? `Forward P/E: ${ctx.forwardPe.toFixed(1)}` : '',
    ctx.high52w != null && ctx.low52w != null && ctx.price != null
      ? `52-week range: $${ctx.low52w.toFixed(2)} – $${ctx.high52w.toFixed(2)} (currently at ${(((ctx.price - ctx.low52w) / (ctx.high52w - ctx.low52w)) * 100).toFixed(0)}% of range)`
      : '',
  ].filter(Boolean).join(' | ') : '';

  const userContextBlock = buildUserContextBlock(intent);
  const assetRealityBlock = buildAssetRealityBlock(ticker, asset);
  const newsContextBlock = formatNewsContextForPrompt(ticker, news, ctx?.name);
  const researchPacketBlock = researchPacket
    ? formatResearchPacketForPrompt(researchPacket)
    : 'VERIFIED RESEARCH PACKET: unavailable. Treat unsupported domains as unknown and explicitly name missing evidence.';

  const themeFitInstruction = hasThemes
    ? `For theme_fit_score: rate 0–10 how well this ticker's actual business fits the user's themes (${intent.themes.join(', ')}). 0 = completely off-theme (e.g. bond ETF or printer company asked for AI/space stocks), 10 = perfect match. Be honest even if the ticker is otherwise a good investment. If theme_fit_score is below 5, the persona must be neutral or bearish for this portfolio request and must not invent an AI/space/robotics angle.`
    : 'For theme_fit_score: return null (no theme filter was specified).';
  const newsSentimentInstruction = [
    'NEWS SENTIMENT REQUIREMENTS',
    '- Parse the supplied news; do not merely repeat or count headlines.',
    '- Name the most material item and explain direct vs indirect relevance, the transmission into revenue/margin/EPS/multiple, direction, horizon, confidence, and the next confirming datapoint.',
    '- Shared executives, celebrity association, and adjacent private companies are not direct financial exposure. A SpaceX IPO is indirect to Tesla unless evidence shows Tesla ownership, financing, commercial transactions, or execution impact.',
    '- Ignore sensational or unrelated stories. If no item changes estimates, valuation, or risk, say the tape is immaterial and keep news_sentiment neutral.',
  ].join('\n');

  const expectedKeys = personas.map(p => p.key);
  return {
    expectedKeys,
    messages: [
      {
        role: 'system',
        content: [
          `You are a strict JSON financial analysis engine evaluating ${ticker}.`,
          `Return exactly ${personas.length} signals, one for each provided key. Do not skip keys.`,
          'No markdown. No prose outside JSON. Keep the JSON valid while giving each persona a real institutional opinion.',
          '',
          userContextBlock,
          '',
          assetRealityBlock,
          '',
          newsContextBlock,
          '',
          researchPacketBlock,
        ].filter(Boolean).join('\n'),
      },
      {
        role: 'user',
        content: `Analyze ${ticker} from each investor/analyst viewpoint.\n${dataStr ? `\nCurrent market data:\n${dataStr}` : ''}\n\n${newsSentimentInstruction}\n\n${themeFitInstruction}\n\nFor business_consistency: true only if the thesis matches the actual business.\n\nReturn valid JSON exactly in this shape:\n{"signals":[{"key":"${expectedKeys[0]}","score":55,"signal":"neutral","confidence":55,"reasoning":"Two or three concise sentences in this persona's voice.","thesis":"One clear investment view.","risk":"One sentence on what could make this persona wrong.","watch":"One concrete evidence point this persona would monitor.","theme_fit_score":null,"theme_fit_reason":"max 12 words","business_consistency":true}]}\n\nRules:\n- Include exactly these keys in this order: ${expectedKeys.join(', ')}.\n- Use each key once.\n- score must be 0-100 and represent current health/attractiveness for that analyst's domain; higher is more supportive.\n- signal must be bullish, bearish, or neutral.\n- confidence must be 0-100.\n- reasoning should be 2-3 concise sentences, max 70 words total.\n- thesis should be 1 sentence, max 34 words.\n- risk should be 1 sentence, max 28 words.\n- watch should be 1 concrete evidence point, max 24 words.\n- theme_fit_reason max 12 words.\n- Treat the verified research packet as the factual source of truth; do not use model memory for current facts.\n- If a domain lacks evidence, keep confidence at or below 40, normally stay neutral, and name the missing input.\n- Fundamentals must cite supplied growth, margins, cash generation, or leverage. Valuation must cite a supplied multiple, target, or expectations datapoint.\n- Technicals must cite supplied price-path, momentum, or volatility data. Sentiment must not invent options, flows, short interest, or ownership.\n- News must identify a verified catalyst and its estimates, multiple, positioning, or risk transmission; generic narratives are weak evidence.\n- Keep every conclusion inside the explicit decision horizon.\n- No trailing commas.\n\nPersonas:\n${personaList}`,
      },
    ],
  };
}

async function runPersonaSignalsOpenAIJson(
  ticker: string,
  prompt: PersonaPrompt,
  personas: PersonaDefinition[],
): Promise<RawSignal[]> {
  const apiKey = getOpenAIKey('user');
  if (!apiKey) {
    throw new Error('Anthropic returned malformed JSON and no OpenAI key is available for JSON-mode repair');
  }

  const model = process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_JSON_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: prompt.messages,
        temperature: 0.15,
        max_tokens: 5600,
        response_format: { type: 'json_object' },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI JSON-mode persona fallback failed (${response.status}): ${text}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const parsed = extractJsonObject(payload.choices?.[0]?.message?.content ?? '{}');
    const signals = normalizePersonaSignals(parsed, personas);
    if (signals.length < personas.length) {
      throw new Error(`OpenAI JSON-mode fallback returned ${signals.length}/${personas.length} persona signals`);
    }
    console.info('[hedge-fund] recovered full persona signals with OpenAI JSON mode', {
      ticker,
      model,
      count: signals.length,
    });
    return signals;
  } finally {
    clearTimeout(timer);
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const b = body as Record<string, unknown>;

  const ticker = (typeof b.ticker === 'string' ? b.ticker : '').toUpperCase().trim();
  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }
  const mode: HedgeFundMode =
    b.mode === 'monitoring' || b.mode === 'committee' || b.mode === 'full'
      ? b.mode
      : 'full';
  const selectedPersonas = personasForMode(mode);

  const requestStart = Date.now();
  console.log('[hedge-fund] POST started', { ticker, mode, model: agentModelCandidates()[0] });

  // Optional: intent and assetMetadata from portfolio-chat (backward compatible)
  const intent:        UserIntent    | null = (b.intent        ?? null) as UserIntent | null;
  const assetMetadata: AssetMetadata | null = (b.assetMetadata ?? null) as AssetMetadata | null;
  const researchPacket = isResearchPacket(b.researchPacket) && b.researchPacket.ticker === ticker
    ? b.researchPacket
    : null;

  try {
    const pythonResult = mode !== 'full' || intent?.themes.length ? null : await tryPythonBackend(ticker);
    if (pythonResult) {
      return NextResponse.json({ ...pythonResult, mode }, {
        headers: {
          'Cache-Control':               'no-store',
          'X-CapitalBase-Agent-Source':  'python_backend',
        },
      });
    }

    if (!hasAnyAnthropicKey() && !hasAnyOpenAIKey()) {
      return NextResponse.json({
        error: 'Agent backend unavailable and no LLM key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      }, { status: 503 });
    }

    const origin = new URL(req.url).origin;
    const [ctx, news] = await Promise.all([
      fetchMarketContext(ticker),
      fetchCompanyNews(ticker, origin),
    ]);
    let rawSignals: RawSignal[];
    let functionalDebate: FunctionalDebateResult | null = null;
    let degraded = false;
    let degradedReason: string | null = null;
    try {
      if (researchPacket && (mode === 'monitoring' || mode === 'committee')) {
        functionalDebate = await runFunctionalDebate({
          packet: researchPacket,
          depth: mode === 'committee' ? 'committee' : 'scan',
        });
        rawSignals = functionalDebate.memos.map(memo => memoToSignal(
          memo,
          primaryRebuttalFor(functionalDebate?.rebuttals ?? [], memo.key),
        ));
        degraded = functionalDebate.degraded;
        degradedReason = functionalDebate.degradedReasons.join(', ') || null;
      } else {
        rawSignals = await runPersonaSignals(
          ticker,
          intent,
          assetMetadata,
          ctx,
          news,
          selectedPersonas,
          researchPacket,
        );
      }
      console.log('[hedge-fund] signals completed', {
        count: rawSignals.length,
        elapsed: `${Date.now() - requestStart}ms`,
      });
    } catch (error) {
      logHedgeFundFailure('persona signals', error);
      console.warn('[hedge-fund] returning fast deterministic read', {
        ticker,
        elapsed: `${Date.now() - requestStart}ms`,
      });
      degraded = true;
      degradedReason = mode === 'monitoring'
        ? 'Quant monitoring refresh hit the latency guardrail, so compact monitoring scores were recorded.'
        : 'Senior investment committee review did not complete inside the latency guardrail.';
      rawSignals = mode === 'committee'
        ? []
        : fallbackPersonaSignals(ticker, intent, assetMetadata, ctx, news);
      console.log('[hedge-fund] signals completed', {
        count: rawSignals.length,
        degraded: true,
        elapsed: `${Date.now() - requestStart}ms`,
      });
    }

    const scoreAsOf = new Date().toISOString();
    const signals = rawSignals.map(s => {
      const meta = PERSONAS.find(p => p.key === s.key);
      const deterministicNews = s.key === 'news_sentiment'
        ? buildDeterministicNewsSentiment(ticker, news, ctx?.name ?? assetMetadata?.name)
        : null;
      const scoreComponents = meta?.group === 'quant'
        ? buildHybridScore({
            analystKey: s.key as QuantAnalystKey,
            llmScore: s.score,
            market: {
              price: ctx?.price ?? researchPacket?.market.price.value ?? null,
              changePct: ctx?.changePct ?? null,
              pe: ctx?.pe ?? null,
              forwardPe: ctx?.forwardPe ?? null,
              high52w: ctx?.high52w ?? null,
              low52w: ctx?.low52w ?? null,
              revenueGrowthPct: researchPacket?.fundamentals.historicalRevenueGrowthPct.value,
              ebitdaMarginPct: researchPacket?.fundamentals.ebitdaMarginPct.value,
              netMarginPct: researchPacket?.fundamentals.netMarginPct.value,
              netDebtToEbitda: researchPacket?.fundamentals.netDebtToEbitda.value,
              forecastReturnPct: researchPacket?.pricePath.expectedReturnPct.value,
              momentum20dPct: researchPacket?.pricePath.momentum20dPct.value,
              annualizedVolatilityPct: researchPacket?.pricePath.annualizedVolatilityPct.value,
              analystTargetUpsidePct: researchPacket?.consensus.targetUpsidePct.value,
              newsScore: deterministicNews?.score,
            },
            asOf: scoreAsOf,
          })
        : undefined;
      const score = scoreComponents?.score
        ?? Math.round(Math.max(0, Math.min(100, s.score)));
      return {
        key:                  s.key,
        name:                 s.name ?? meta?.name        ?? s.key,
        group:                meta?.group                 ?? 'quant',
        score,
        signal:               scoreComponents ? signalFromHybridScore(score) : s.signal,
        confidence:           Math.round(Math.max(0, Math.min(100, s.confidence))),
        reasoning:            s.reasoning,
        thesis:               s.thesis ?? s.reasoning,
        risk:                 s.risk ?? 'Risk depends on valuation, catalyst timing, and whether the core thesis keeps confirming.',
        watch:                s.key === 'news_sentiment' && ticker === 'TSLA' && /spacex/i.test(s.reasoning)
          ? 'Watch for a disclosed Tesla-SpaceX transaction, ownership or financing link, or evidence that Musk attention affects Tesla execution.'
          : deterministicNews && /musk|adjacent|indirect/i.test(`${s.reasoning} ${deterministicNews.reasoning}`)
            ? deterministicNews.watch
          : s.watch ?? 'Watch the next catalyst, estimate revision, or price-action confirmation.',
        theme_fit_score:      s.theme_fit_score      ?? null,
        theme_fit_reason:     s.theme_fit_reason     ?? '',
        business_consistency: s.business_consistency ?? true,
        scoreComponents,
      };
    });

    const consensus = {
      bullish: signals.filter(s => s.signal === 'bullish').length,
      bearish: signals.filter(s => s.signal === 'bearish').length,
      neutral: signals.filter(s => s.signal === 'neutral').length,
    };

    // Compute median theme_fit_score — null when no theme was requested
    const themeFitScores = signals
      .map(s => s.theme_fit_score)
      .filter((v): v is number => v !== null);
    const median_theme_fit = themeFitScores.length > 0 ? median(themeFitScores) : null;

    if (median_theme_fit !== null && intent?.themes.length) {
      console.info(`[hedge-fund] ${ticker} median_theme_fit=${median_theme_fit.toFixed(1)} themes=${intent.themes.join(',')}`);
    }

    const hasSeniorSignals = signals.some(signal => signal.group === 'persona');
    const decision = functionalDebate?.adjudication
      ? {
          action: functionalDebate.adjudication.action,
          confidence: functionalDebate.adjudication.confidence,
          sizing: functionalDebate.adjudication.sizing,
          reasoning: `${functionalDebate.adjudication.reasoning} Confirmation: ${functionalDebate.adjudication.confirmation}`,
        }
      : mode === 'monitoring' || !hasSeniorSignals
        ? null
        : synthesizeDecision(consensus, median_theme_fit);

    const result: AnalysisResult = {
      ticker,
      mode,
      date:             new Date().toISOString().slice(0, 10),
      decision,
      signals,
      consensus,
      median_theme_fit,
      source:           'llm_fallback',
      degraded,
      degradedReason,
      debate: functionalDebate,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control':              'no-store',
        'X-CapitalBase-Agent-Source': 'llm_fallback',
        'X-CapitalBase-Agent-Mode':   mode,
      },
    });
  } catch (err) {
    logHedgeFundFailure('POST', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    );
  }
}
