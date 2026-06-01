import { NextRequest, NextResponse } from 'next/server';
import { hasAnyAnthropicKey } from '@/lib/anthropicKey';
import { getOpenAIKey, hasAnyOpenAIKey } from '@/lib/openaiKey';
import { generateTextWithProviderFallback, type LlmMessage } from '@/lib/llm/generateText';
import { matchThemes } from '@/lib/execution/themeClassifier';
import type { UserIntent } from '@/lib/execution/userIntent';
import type { AssetMetadata } from '@/lib/execution/assetMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const AGENT_TIMEOUT_MS = 18_000;
const OPENAI_JSON_TIMEOUT_MS = 40_000;

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
  { key: 'news_sentiment',        name: 'News Sentiment',          group: 'quant',   style: 'recent news flow, analyst upgrades and downgrades, earnings revisions, catalyst pipeline' },
  { key: 'growth',                name: 'Growth Analyst',          group: 'quant',   style: 'TAM expansion, revenue acceleration, unit economics, LTV/CAC dynamics, market share gains' },
] as const;

type PersonaKey = typeof PERSONAS[number]['key'];

type RawSignal = {
  key:                  PersonaKey;
  signal:               'bullish' | 'bearish' | 'neutral';
  confidence:           number;
  reasoning:            string;
  thesis:               string;
  risk:                 string;
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
  date:              string;
  decision:          { action: string; confidence: number; reasoning: string; sizing?: string } | null;
  signals:           { key: string; name: string; group: string; signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; thesis: string; risk: string; theme_fit_score: number | null; theme_fit_reason: string; business_consistency: boolean }[];
  consensus:         { bullish: number; bearish: number; neutral: number };
  median_theme_fit:  number | null;
  source?:           'python_backend' | 'llm_fallback';
  degraded?:         boolean;
  degradedReason?:   string | null;
};

type PersonaPrompt = {
  messages: LlmMessage[];
  expectedKeys: string[];
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

function normalizePersonaSignals(raw: unknown): RawSignal[] {
  const payload = raw as { signals?: unknown };
  if (!Array.isArray(payload.signals)) return [];

  const byKey = new Map<string, RawSignal>();
  for (const item of payload.signals) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const persona = PERSONAS.find(p => p.key === key);
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

    byKey.set(persona.key, {
      key: persona.key,
      signal: parseSignal(row.signal),
      confidence: clampConfidence(row.confidence),
      reasoning,
      thesis,
      risk,
      theme_fit_score: themeFit,
      theme_fit_reason: typeof row.theme_fit_reason === 'string' ? row.theme_fit_reason.trim() : '',
      business_consistency: typeof row.business_consistency === 'boolean' ? row.business_consistency : true,
    });
  }

  return PERSONAS
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
      median_theme_fit: null,
      source: 'python_backend',
      signals: (data.signals ?? []).map(signal => ({
        ...signal,
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

  const compactSignals: RawSignal[] = [
    {
      key: 'fundamentals',
      signal: offTheme ? 'neutral' : 'neutral',
      confidence: confidenceBase,
      reasoning: 'Fast check only: fundamentals need the full agent pass before a high-conviction call.',
      thesis: `${ticker} should stay in work-up mode until revenue durability, margins, and cash-flow quality are confirmed by the full run.`,
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: full persona evidence was unavailable, so conviction should stay limited.',
      business_consistency: !offTheme,
    },
    {
      key: 'valuation',
      signal: 'neutral',
      confidence: confidenceBase - 2,
      reasoning: 'Fast check only: valuation was not fully rebuilt before the latency guardrail.',
      thesis: 'Do not treat this as a margin-of-safety verdict; use the compressed valuation signal elsewhere in the stock page.',
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: valuation sensitivity was not fully re-underwritten.',
      business_consistency: !offTheme,
    },
    {
      key: 'technicals',
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
      business_consistency: !offTheme,
    },
    {
      key: 'news_sentiment',
      signal: 'neutral',
      confidence: confidenceBase - 1,
      reasoning: 'Fast check only: live news/persona synthesis did not complete inside the timeout budget.',
      thesis: 'Treat catalyst evidence as incomplete until the full agent read refreshes.',
      theme_fit_score: themeMatch ? themeMatch.score : null,
      theme_fit_reason: themeMatch?.reason ?? '',
      risk: 'Fast fallback risk: missed live headlines could change the catalyst read.',
      business_consistency: !offTheme,
    },
    {
      key: 'growth',
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
      reasoning: 'Persona consensus leans bullish, but sizing still needs catalyst and risk confirmation.',
    };
  }
  if (consensus.bearish >= consensus.bullish + 4) {
    return {
      action: 'sell',
      confidence: 62,
      sizing: 'Avoid',
      reasoning: 'Persona consensus leans negative; do not add unless catalyst evidence reverses the setup.',
    };
  }
  return {
    action: 'hold',
    confidence: 58,
    sizing: 'Track',
    reasoning: 'Persona consensus is mixed; keep this tracked until stronger agent evidence comes through.',
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

async function runPersonaSignals(
  ticker: string,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
  ctx: MarketContext | null,
): Promise<RawSignal[]> {
  const prompt = buildPersonaPrompt(ticker, intent, asset, ctx);

  if (getOpenAIKey('user')) {
    try {
      const signals = await runPersonaSignalsOpenAIJson(ticker, prompt);
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
    const signals = normalizePersonaSignals(parsed);
    if (signals.length < PERSONAS.length) {
      throw new Error(`LLM returned ${signals.length}/${PERSONAS.length} persona signals`);
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
): PersonaPrompt {
  const hasThemes = intent && intent.themes.length > 0;

  const personaList = PERSONAS.map((p, i) =>
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

  const themeFitInstruction = hasThemes
    ? `For theme_fit_score: rate 0–10 how well this ticker's actual business fits the user's themes (${intent.themes.join(', ')}). 0 = completely off-theme (e.g. bond ETF or printer company asked for AI/space stocks), 10 = perfect match. Be honest even if the ticker is otherwise a good investment. If theme_fit_score is below 5, the persona must be neutral or bearish for this portfolio request and must not invent an AI/space/robotics angle.`
    : 'For theme_fit_score: return null (no theme filter was specified).';

  const expectedKeys = PERSONAS.map(p => p.key);
  return {
    expectedKeys,
    messages: [
      {
        role: 'system',
        content: [
          `You are a strict JSON financial analysis engine evaluating ${ticker}.`,
          `Return exactly ${PERSONAS.length} signals, one for each provided key. Do not skip keys.`,
          'No markdown. No prose outside JSON. Keep the JSON valid while giving each persona a real institutional opinion.',
          '',
          userContextBlock,
          '',
          assetRealityBlock,
        ].filter(Boolean).join('\n'),
      },
      {
        role: 'user',
        content: `Analyze ${ticker} from each investor/analyst viewpoint.\n${dataStr ? `\nCurrent market data:\n${dataStr}` : ''}\n\n${themeFitInstruction}\n\nFor business_consistency: true only if the thesis matches the actual business.\n\nReturn valid JSON exactly in this shape:\n{"signals":[{"key":"warren_buffett","signal":"neutral","confidence":55,"reasoning":"Two concise sentences in this persona's voice.","thesis":"One clear investment view.","risk":"One sentence on what could make this persona wrong.","theme_fit_score":null,"theme_fit_reason":"max 12 words","business_consistency":true}]}\n\nRules:\n- Include exactly these keys in this order: ${expectedKeys.join(', ')}.\n- Use each key once.\n- signal must be bullish, bearish, or neutral.\n- confidence must be 0-100.\n- reasoning should be 2 concise sentences, max 45 words total.\n- thesis should be 1 sentence, max 28 words.\n- risk should be 1 sentence, max 24 words.\n- theme_fit_reason max 12 words.\n- No trailing commas.\n\nPersonas:\n${personaList}`,
      },
    ],
  };
}

async function runPersonaSignalsOpenAIJson(ticker: string, prompt: PersonaPrompt): Promise<RawSignal[]> {
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
        max_tokens: 4200,
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
    const signals = normalizePersonaSignals(parsed);
    if (signals.length < PERSONAS.length) {
      throw new Error(`OpenAI JSON-mode fallback returned ${signals.length}/${PERSONAS.length} persona signals`);
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

async function runPortfolioManager(
  ticker: string,
  signals: RawSignal[],
  consensus: { bullish: number; bearish: number; neutral: number },
): Promise<AnalysisResult['decision']> {
  const signalSummary = signals
    .map(s => `${s.key}: ${s.signal} (${s.confidence}%) — ${s.reasoning}`)
    .join('\n');

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'user',
    temperature: 0.5,
    maxTokens: 500,
    messages: [
      {
        role: 'system',
        content: 'You are a portfolio manager synthesizing analyst signals into a single trading posture. Be decisive, but do not generate brokerage orders, share quantities, or exact position sizes.',
      },
      {
        role: 'user',
        content: `Ticker: ${ticker}\nConsensus: ${consensus.bullish} bullish, ${consensus.bearish} bearish, ${consensus.neutral} neutral\n\nAnalyst signals:\n${signalSummary}\n\nReturn JSON: { "action": "buy"|"sell"|"hold"|"short"|"cover", "confidence": 0-100, "sizing": "Track / Build / Trim / Exit watch / Avoid", "reasoning": "2-3 sentence synthesis" }`,
      },
    ],
  });

  const parsed = extractJsonObject(result?.text ?? '{}') as AnalysisResult['decision'];
  if (!parsed) return null;
  const { action, confidence, reasoning, sizing } = parsed;
  return { action, confidence, reasoning, sizing };
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

  const requestStart = Date.now();
  console.log('[hedge-fund] POST started', { ticker, model: agentModelCandidates()[0] });

  // Optional: intent and assetMetadata from portfolio-chat (backward compatible)
  const intent:        UserIntent    | null = (b.intent        ?? null) as UserIntent | null;
  const assetMetadata: AssetMetadata | null = (b.assetMetadata ?? null) as AssetMetadata | null;

  try {
    const pythonResult = intent?.themes.length ? null : await tryPythonBackend(ticker);
    if (pythonResult) {
      return NextResponse.json(pythonResult, {
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

    const ctx = await fetchMarketContext(ticker);
    let rawSignals: RawSignal[];
    let degraded = false;
    let degradedReason: string | null = null;
    try {
      rawSignals = await runPersonaSignals(ticker, intent, assetMetadata, ctx);
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
      degradedReason = 'Full 19-persona agent run hit the latency guardrail, so this is a compact fast check.';
      rawSignals = fallbackPersonaSignals(ticker, intent, assetMetadata, ctx);
      console.log('[hedge-fund] signals completed', {
        count: rawSignals.length,
        degraded: true,
        elapsed: `${Date.now() - requestStart}ms`,
      });
    }

    const signals = rawSignals.map(s => {
      const meta = PERSONAS.find(p => p.key === s.key);
      return {
        key:                  s.key,
        name:                 meta?.name                  ?? s.key,
        group:                meta?.group                 ?? 'quant',
        signal:               s.signal,
        confidence:           Math.round(Math.max(0, Math.min(100, s.confidence))),
        reasoning:            s.reasoning,
        thesis:               s.thesis ?? s.reasoning,
        risk:                 s.risk ?? 'Risk depends on valuation, catalyst timing, and whether the core thesis keeps confirming.',
        theme_fit_score:      s.theme_fit_score      ?? null,
        theme_fit_reason:     s.theme_fit_reason     ?? '',
        business_consistency: s.business_consistency ?? true,
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

    const decision = synthesizeDecision(consensus, median_theme_fit);

    const result: AnalysisResult = {
      ticker,
      date:             new Date().toISOString().slice(0, 10),
      decision,
      signals,
      consensus,
      median_theme_fit,
      source:           'llm_fallback',
      degraded,
      degradedReason,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control':              'no-store',
        'X-CapitalBase-Agent-Source': 'llm_fallback',
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
