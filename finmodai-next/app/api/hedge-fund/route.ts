import { NextRequest, NextResponse } from 'next/server';
import { hasAnyAnthropicKey } from '@/lib/anthropicKey';
import { hasAnyOpenAIKey } from '@/lib/openaiKey';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { UserIntent } from '@/lib/execution/userIntent';
import type { AssetMetadata } from '@/lib/execution/assetMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

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
  signals:           { key: string; name: string; group: string; signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; thesis: string; theme_fit_score: number | null; theme_fit_reason: string; business_consistency: boolean }[];
  consensus:         { bullish: number; bearish: number; neutral: number };
  median_theme_fit:  number | null;
  source?:           'python_backend' | 'llm_fallback';
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pythonBackendUrl(): string | null {
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
      signal: AbortSignal.timeout(45_000),
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

async function fetchMarketContext(ticker: string): Promise<MarketContext | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,forwardPE,shortName`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
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
  attempt = 1,
): Promise<RawSignal[]> {
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

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'user',
    temperature: 0.75,
    maxTokens: 6000,
    messages: [
      {
        role: 'system',
        content: [
          `You are a financial analysis system simulating ${PERSONAS.length} legendary investors and quantitative analysts evaluating ${ticker} stock. Each persona applies their distinct philosophy to arrive at a signal. Be realistic and let personas disagree — not all should be bullish or bearish.`,
          '',
          userContextBlock,
          '',
          assetRealityBlock,
        ].filter(Boolean).join('\n'),
      },
      {
        role: 'user',
        content: `Analyze ${ticker} from the perspective of each investor/analyst below.\n${dataStr ? `\nCurrent market data:\n${dataStr}` : ''}\n\n${themeFitInstruction}\n\nFor business_consistency: set true if your thesis is consistent with the company's actual business described above, false if you cannot write a consistent thesis.\n\nFor each persona, apply their specific philosophy. Return JSON:\n{ "signals": [ { "key": string, "signal": "bullish"|"bearish"|"neutral", "confidence": 0-100, "reasoning": "1-2 sentences", "thesis": "3-5 sentence full investment thesis in that persona's voice", "theme_fit_score": number|null, "theme_fit_reason": "1-2 sentences explaining the score", "business_consistency": boolean }, ... ] }\n\nPersonas:\n${personaList}`,
      },
    ],
  });

  const parsed = extractJsonObject(result?.text ?? '{}') as { signals?: RawSignal[] };
  const signals = Array.isArray(parsed.signals) ? parsed.signals : [];

  // Validate required new fields; retry once on first attempt
  const invalid = signals.filter(
    s => hasThemes && s.theme_fit_score === undefined,
  );
  if (invalid.length > 0 && attempt === 1) {
    console.warn(`[hedge-fund] ${invalid.length} signals missing theme_fit_score on attempt 1, retrying…`);
    return runPersonaSignals(ticker, intent, asset, ctx, 2);
  }

  return signals;
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
    const rawSignals = await runPersonaSignals(ticker, intent, assetMetadata, ctx);

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

    const decision = await runPortfolioManager(ticker, rawSignals, consensus);

    const result: AnalysisResult = {
      ticker,
      date:             new Date().toISOString().slice(0, 10),
      decision,
      signals,
      consensus,
      median_theme_fit,
      source:           'llm_fallback',
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control':              'no-store',
        'X-CapitalBase-Agent-Source': 'llm_fallback',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    );
  }
}
