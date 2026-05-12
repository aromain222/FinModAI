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
};

type AnalysisResult = {
  ticker: string;
  date: string;
  decision: { action: string; quantity: number; confidence: number; reasoning: string } | null;
  signals: { key: string; name: string; group: string; signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string }[];
  consensus: { bullish: number; bearish: number; neutral: number };
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runPersonaSignals(ticker: string): Promise<RawSignal[]> {
  const personaList = PERSONAS.map((p, i) =>
    `${i + 1}. ${p.name} [key: ${p.key}] — ${p.style}`,
  ).join('\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.75,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: `You are a financial analysis system simulating ${PERSONAS.length} legendary investors and quantitative analysts evaluating ${ticker} stock. Each persona applies their distinct philosophy to arrive at a signal. Be realistic and let personas disagree — not all should be bullish or bearish.`,
      },
      {
        role: 'user',
        content: `Analyze ${ticker} from the perspective of each investor/analyst below. For each, provide a JSON signal reflecting their philosophy applied to ${ticker}'s current business position, valuation, growth, and market context.\n\nPersonas:\n${personaList}\n\nReturn JSON: { "signals": [ { "key": string, "signal": "bullish"|"bearish"|"neutral", "confidence": 0-100, "reasoning": "1-2 sentences in that persona's voice" }, ... ] }`,
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
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });
  }

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
    const rawSignals = await runPersonaSignals(ticker);

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
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    );
  }
}
