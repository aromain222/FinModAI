import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const PERSONAS = [
  { key: 'warren_buffett',       name: 'Warren Buffett',         group: 'persona', style: 'value investing, wide moat businesses, long-term compounding, owner-operator mentality' },
  { key: 'charlie_munger',       name: 'Charlie Munger',         group: 'persona', style: 'mental models, quality businesses, invert problems, latticework of disciplines' },
  { key: 'ben_graham',           name: 'Ben Graham',             group: 'persona', style: 'deep value, margin of safety, quantitative screens, net-net stocks' },
  { key: 'peter_lynch',          name: 'Peter Lynch',            group: 'persona', style: 'GARP, invest in what you know, strong earnings growth, PEG ratio' },
  { key: 'nassim_taleb',         name: 'Nassim Taleb',           group: 'persona', style: 'tail risk, fragility vs antifragility, black swan events, convexity' },
  { key: 'michael_burry',        name: 'Michael Burry',          group: 'persona', style: 'contrarian deep value, asymmetric payoffs, against consensus, concentrated positions' },
  { key: 'cathie_wood',          name: 'Cathie Wood',            group: 'persona', style: 'disruptive innovation, 5-year price targets, exponential growth curves, platform businesses' },
  { key: 'aswath_damodaran',     name: 'Aswath Damodaran',       group: 'persona', style: 'rigorous DCF valuation, intrinsic value analysis, equity risk premium, narrative & numbers' },
  { key: 'stanley_druckenmiller', name: 'Stanley Druckenmiller', group: 'persona', style: 'macro momentum, asymmetric bets, top-down thesis, trend following with conviction' },
  { key: 'bill_ackman',          name: 'Bill Ackman',            group: 'persona', style: 'activist investing, high-conviction concentrated, brand moat, predictable cash flows' },
  { key: 'phil_fisher',          name: 'Phil Fisher',            group: 'persona', style: 'scuttlebutt research, qualitative analysis, management quality, multi-decade growth' },
  { key: 'mohnish_pabrai',       name: 'Mohnish Pabrai',         group: 'persona', style: 'cloning great investors, heads-I-win-tails-I-don\'t-lose bets, patience, asymmetry' },
  { key: 'rakesh_jhunjhunwala',  name: 'Rakesh Jhunjhunwala',    group: 'persona', style: 'long-term structural growth, macro tailwinds, high conviction, emerging market lens' },
  { key: 'fundamentals',         name: 'Fundamentals Analyst',   group: 'quant',   style: 'revenue growth trajectory, margin expansion, balance sheet quality, free cash flow conversion' },
  { key: 'valuation',            name: 'Valuation Analyst',      group: 'quant',   style: 'P/E, EV/EBITDA, P/S, P/FCF multiples vs peers and historical range' },
  { key: 'technicals',           name: 'Technical Analyst',      group: 'quant',   style: 'price action, momentum indicators, RSI, MACD, moving averages, volume confirmation' },
  { key: 'sentiment',            name: 'Sentiment Analyst',      group: 'quant',   style: 'options flow, short interest, insider buying/selling, institutional positioning' },
  { key: 'news_sentiment',       name: 'News Sentiment',         group: 'quant',   style: 'recent news flow, analyst upgrades and downgrades, earnings revisions, catalyst pipeline' },
  { key: 'growth',               name: 'Growth Analyst',         group: 'quant',   style: 'TAM expansion, revenue acceleration, unit economics, LTV/CAC dynamics, market share gains' },
] as const;

type PersonaKey = typeof PERSONAS[number]['key'];

type RawSignal = {
  key: PersonaKey;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  thesis: string;
};

type MarketContext = {
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  high52w: number | null;
  low52w: number | null;
  name: string | null;
};

type AnalysisResult = {
  ticker: string;
  date: string;
  decision: { action: string; quantity: number; confidence: number; reasoning: string } | null;
  signals: { key: string; name: string; group: string; signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; thesis: string }[];
  consensus: { bullish: number; bearish: number; neutral: number };
  source?: 'python_backend' | 'openai_fallback';
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pythonBackendUrl(): string | null {
  const raw = process.env.AI_AGENT_BACKEND_URL || process.env.PYTHON_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, '') : null;
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
      source: 'python_backend',
      signals: (data.signals ?? []).map(signal => ({
        ...signal,
        thesis: signal.thesis ?? signal.reasoning,
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
      price:     q.regularMarketPrice ?? null,
      changePct: q.regularMarketChangePercent ?? null,
      marketCap: q.marketCap ?? null,
      pe:        q.trailingPE ?? null,
      forwardPe: q.forwardPE ?? null,
      high52w:   q.fiftyTwoWeekHigh ?? null,
      low52w:    q.fiftyTwoWeekLow ?? null,
      name:      q.shortName ?? null,
    };
  } catch {
    return null;
  }
}

async function runPersonaSignals(ticker: string, ctx: MarketContext | null): Promise<RawSignal[]> {
  const personaList = PERSONAS.map((p, i) =>
    `${i + 1}. ${p.name} [key: ${p.key}] — ${p.style}`,
  ).join('\n');

  const dataStr = ctx ? [
    ctx.name ? `Company: ${ctx.name}` : '',
    ctx.price != null ? `Price: $${ctx.price.toFixed(2)}` : '',
    ctx.changePct != null ? `Daily change: ${ctx.changePct >= 0 ? '+' : ''}${ctx.changePct.toFixed(2)}%` : '',
    ctx.marketCap != null ? `Market cap: $${(ctx.marketCap / 1e9).toFixed(1)}B` : '',
    ctx.pe != null ? `Trailing P/E: ${ctx.pe.toFixed(1)}` : '',
    ctx.forwardPe != null ? `Forward P/E: ${ctx.forwardPe.toFixed(1)}` : '',
    ctx.high52w != null && ctx.low52w != null && ctx.price != null
      ? `52-week range: $${ctx.low52w.toFixed(2)} – $${ctx.high52w.toFixed(2)} (currently at ${(((ctx.price - ctx.low52w) / (ctx.high52w - ctx.low52w)) * 100).toFixed(0)}% of range)`
      : '',
  ].filter(Boolean).join(' | ') : '';

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.75,
    max_tokens: 5000,
    messages: [
      {
        role: 'system',
        content: `You are a financial analysis system simulating ${PERSONAS.length} legendary investors and quantitative analysts evaluating ${ticker} stock. Each persona applies their distinct philosophy to arrive at a signal. Be realistic and let personas disagree — not all should be bullish or bearish.`,
      },
      {
        role: 'user',
        content: `Analyze ${ticker} from the perspective of each investor/analyst below.\n${dataStr ? `\nCurrent market data:\n${dataStr}` : ''}\n\nFor each persona, apply their specific philosophy to these actual numbers. Return JSON:\n{ "signals": [ { "key": string, "signal": "bullish"|"bearish"|"neutral", "confidence": 0-100, "reasoning": "1-2 sentences summarizing the signal", "thesis": "3-5 sentence full investment thesis written in that persona's voice, referencing specific data points where relevant" }, ... ] }\n\nPersonas:\n${personaList}`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as { signals?: RawSignal[] };
  return Array.isArray(parsed.signals) ? parsed.signals : [];
}

async function runPortfolioManager(ticker: string, signals: RawSignal[], consensus: { bullish: number; bearish: number; neutral: number }): Promise<AnalysisResult['decision']> {
  const signalSummary = signals
    .map(s => `${s.key}: ${s.signal} (${s.confidence}%) — ${s.reasoning}`)
    .join('\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_tokens: 400,
    messages: [
      {
        role: 'system',
        content: 'You are a portfolio manager synthesizing analyst signals into a single trading decision. Be decisive. Choose one action.',
      },
      {
        role: 'user',
        content: `Ticker: ${ticker}\nConsensus: ${consensus.bullish} bullish, ${consensus.bearish} bearish, ${consensus.neutral} neutral\n\nAnalyst signals:\n${signalSummary}\n\nReturn JSON: { "action": "buy"|"sell"|"hold"|"short"|"cover", "quantity": 100, "confidence": 0-100, "reasoning": "2-3 sentence synthesis" }`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as AnalysisResult['decision'];
  return parsed ?? null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const ticker = (typeof (body as Record<string, unknown>).ticker === 'string'
    ? (body as Record<string, unknown>).ticker as string
    : ''
  ).toUpperCase().trim();

  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  try {
    const pythonResult = await tryPythonBackend(ticker);
    if (pythonResult) {
      return NextResponse.json(pythonResult, {
        headers: {
          'Cache-Control': 'no-store',
          'X-CapitalBase-Agent-Source': 'python_backend',
        },
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        error: 'Agent backend unavailable and OPENAI_API_KEY not configured',
      }, { status: 503 });
    }

    const ctx = await fetchMarketContext(ticker);
    const rawSignals = await runPersonaSignals(ticker, ctx);

    // Merge with persona metadata
    const signals = rawSignals.map(s => {
      const meta = PERSONAS.find(p => p.key === s.key);
      return {
        key: s.key,
        name: meta?.name ?? s.key,
        group: meta?.group ?? 'quant',
        signal: s.signal,
        confidence: Math.round(Math.max(0, Math.min(100, s.confidence))),
        reasoning: s.reasoning,
        thesis: s.thesis ?? s.reasoning,
      };
    });

    const consensus = {
      bullish: signals.filter(s => s.signal === 'bullish').length,
      bearish: signals.filter(s => s.signal === 'bearish').length,
      neutral: signals.filter(s => s.signal === 'neutral').length,
    };

    const decision = await runPortfolioManager(ticker, rawSignals, consensus);

    const result: AnalysisResult = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
      decision,
      signals,
      consensus,
      source: 'openai_fallback',
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'X-CapitalBase-Agent-Source': 'openai_fallback',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    );
  }
}
