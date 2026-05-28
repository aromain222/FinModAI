import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import type { UserIntent } from '@/lib/execution/userIntent';
import type { AssetMetadata } from '@/lib/execution/assetMetadata';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

type AnalystReports = {
  market:       string | null;
  fundamentals: string | null;
  sentiment:    string | null;
  news:         string | null;
};

type AnalysisResult = {
  ticker:               string;
  date:                 string;
  decision:             string;
  summary:              string | null;
  thesis:               string | null;
  price_target:         number | null;
  current_price?:       number | null;
  target_implied_move_pct?: number | null;
  target_validity?:     'valid' | 'invalid' | 'unavailable';
  target_warning?:      string | null;
  time_horizon:         string | null;
  reports:              AnalystReports;
  theme_fit_score:      number | null;
  theme_fit_reason:     string;
  business_consistency: boolean;
  source?:              'python_backend' | 'openai_fallback';
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function openAIClient(): OpenAI | null {
  const apiKey = getOpenAIKey('user');
  return apiKey ? new OpenAI({ apiKey }) : null;
}

function pythonBackendUrl(): string | null {
  const raw = process.env.AI_AGENT_BACKEND_URL || process.env.PYTHON_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, '') : null;
}

function buildContextBlocks(
  ticker: string,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
): string {
  const parts: string[] = [];

  if (intent) {
    const themes  = intent.themes.length > 0 ? intent.themes.join(', ') : 'no specific theme';
    const capital = intent.capital_usd != null ? `$${intent.capital_usd.toLocaleString()}` : 'not specified';
    parts.push(`USER CONTEXT
Themes: ${themes} | Risk profile: ${intent.risk_profile} | Capital: ${capital}
Original prompt: "${intent.raw_prompt}"
If ${ticker} does not fit the user's stated themes, note it explicitly in your analysis.`);
  }

  if (asset) {
    parts.push(`WHAT ${ticker} ACTUALLY IS
Name: ${asset.name} | Sector: ${asset.sector} | Industry: ${asset.industry}
Asset class: ${asset.asset_class}
Business: ${asset.business_summary}
Your analyst notes must be consistent with this business description.`);
  }

  return parts.join('\n\n');
}

async function tryPythonBackend(ticker: string): Promise<AnalysisResult | null> {
  const backend = pythonBackendUrl();
  if (!backend) return null;

  try {
    const res = await fetch(`${backend}/api/v1/tradingagents/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, analysts: ['market', 'news'], timeout_seconds: 35 }),
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json() as AnalysisResult;
    return {
      ...data,
      theme_fit_score:      null,
      theme_fit_reason:     '',
      business_consistency: true,
      source:               'python_backend',
    };
  } catch {
    return null;
  }
}

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> };
    };
    const price = data.quoteResponse?.result?.[0]?.regularMarketPrice;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

function normalizeDecision(decision: string): 'bullish' | 'neutral' | 'bearish' {
  const d = decision.toLowerCase();
  if (d === 'buy' || d === 'overweight') return 'bullish';
  if (d === 'sell' || d === 'underweight') return 'bearish';
  return 'neutral';
}

function withTargetSanity(result: AnalysisResult, currentPrice: number | null): AnalysisResult {
  const target = result.price_target;
  if (!currentPrice || !target || !Number.isFinite(target) || target <= 0) {
    return {
      ...result,
      current_price:            currentPrice,
      target_implied_move_pct:  null,
      target_validity:          'unavailable',
      target_warning:           target ? 'Could not validate target because current price was unavailable.' : null,
    };
  }

  const impliedMove      = ((target / currentPrice) - 1) * 100;
  const stance           = normalizeDecision(result.decision);
  const directionMismatch =
    (stance === 'bullish' && impliedMove < -10) ||
    (stance === 'bearish' && impliedMove > 10);
  const extremeWithoutSupport = Math.abs(impliedMove) > 35;
  const invalid = directionMismatch || extremeWithoutSupport;

  return {
    ...result,
    current_price:           currentPrice,
    target_implied_move_pct: Math.round(impliedMove * 10) / 10,
    target_validity:         invalid ? 'invalid' : 'valid',
    target_warning:          invalid
      ? `Target sanity failed: ${result.decision} with a ${impliedMove.toFixed(1)}% implied move versus current price. Treat stance as directional only.`
      : null,
  };
}

async function runAnalysts(
  client: OpenAI,
  ticker: string,
  contextBlocks: string,
): Promise<AnalystReports> {
  const systemContent = [
    `You are the TradingAgents debate pipeline — 4 specialist analysts each writing a focused 3-4 sentence research note on ${ticker}. Each analyst has a distinct domain and voice.`,
    contextBlocks,
  ].filter(Boolean).join('\n\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: `Write 4 analyst research notes for ${ticker}:

1. Market Analyst — technical price action, trend, momentum, key levels, volume signals
2. Fundamentals Analyst — revenue growth, margins, earnings quality, balance sheet, FCF
3. Sentiment Analyst — options positioning, short interest, insider activity, institutional flows
4. News Analyst — recent catalyst news, analyst upgrades/downgrades, sector/macro headwinds or tailwinds

Each note should be 3-4 concise sentences. If any analyst note would contradict the asset's actual business description (e.g. discussing AI revenue for a bond ETF), state that explicitly instead.

Return JSON: { "market": "...", "fundamentals": "...", "sentiment": "...", "news": "..." }`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as Partial<AnalystReports>;
  return {
    market:       parsed.market       ?? null,
    fundamentals: parsed.fundamentals ?? null,
    sentiment:    parsed.sentiment    ?? null,
    news:         parsed.news         ?? null,
  };
}

async function runDebateAndDecision(
  client: OpenAI,
  ticker: string,
  reports: AnalystReports,
  currentPrice: number | null,
  intent: UserIntent | null,
  asset: AssetMetadata | null,
): Promise<{
  decision:             string;
  summary:              string;
  thesis:               string;
  price_target:         number | null;
  time_horizon:         string;
  theme_fit_score:      number | null;
  theme_fit_reason:     string;
  business_consistency: boolean;
}> {
  const reportText = [
    reports.market       ? `MARKET: ${reports.market}`           : '',
    reports.fundamentals ? `FUNDAMENTALS: ${reports.fundamentals}` : '',
    reports.sentiment    ? `SENTIMENT: ${reports.sentiment}`     : '',
    reports.news         ? `NEWS: ${reports.news}`               : '',
  ].filter(Boolean).join('\n\n');

  const hasThemes = intent && intent.themes.length > 0;
  const themeLine = hasThemes
    ? `\ntheme_fit_score: 0–10 — how well does ${ticker}'s actual business fit the themes (${intent.themes.join(', ')})? 0 = off-theme (e.g. bond ETF for AI portfolio), 10 = perfect fit. Be accurate.\ntheme_fit_reason: 1-2 sentences explaining the score.\nbusiness_consistency: true if the decision is consistent with ${asset?.name ?? ticker}'s actual business; false otherwise.`
    : '\ntheme_fit_score: null (no theme specified).\ntheme_fit_reason: "".\nbusiness_consistency: true.';

  const assetLine = asset
    ? `\nNote: ${ticker} is ${asset.name} (${asset.sector} / ${asset.industry}). ${asset.business_summary}`
    : '';

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: `You are the TradingAgents portfolio manager. Synthesize the four analyst reports into a final trading decision for ${ticker}.${assetLine}`,
      },
      {
        role: 'user',
        content: `Analyst reports for ${ticker}:\n\n${reportText}\n\nCurrent price anchor: ${currentPrice ? `$${currentPrice.toFixed(2)}` : 'unavailable'}.\n\nBull case: Weigh the strongest bullish signals and near-term catalysts.\nBear case: Weigh the key risks — valuation, momentum, macro.\n\nReturn JSON: { "decision": "Buy"|"Hold"|"Sell"|"Overweight"|"Underweight", "summary": "2-3 sentence debate synthesis", "thesis": "1-2 sentence core thesis the PM is acting on", "price_target": <number or null>, "time_horizon": "e.g. 3-6 months"${themeLine} }\n\nPrice target rule: if you are not anchoring to the current price, return price_target null.`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    decision?: string; summary?: string; thesis?: string;
    price_target?: number | null; time_horizon?: string;
    theme_fit_score?: number | null; theme_fit_reason?: string; business_consistency?: boolean;
  };

  return {
    decision:             parsed.decision             ?? 'Hold',
    summary:              parsed.summary              ?? '',
    thesis:               parsed.thesis               ?? '',
    price_target:         typeof parsed.price_target === 'number' ? parsed.price_target : null,
    time_horizon:         parsed.time_horizon         ?? '3-6 months',
    theme_fit_score:      parsed.theme_fit_score      ?? null,
    theme_fit_reason:     parsed.theme_fit_reason     ?? '',
    business_consistency: parsed.business_consistency ?? true,
  };
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

  const intent:        UserIntent    | null = (b.intent        ?? null) as UserIntent | null;
  const assetMetadata: AssetMetadata | null = (b.assetMetadata ?? null) as AssetMetadata | null;

  try {
    const currentPricePromise = fetchCurrentPrice(ticker);
    const pythonResult = await tryPythonBackend(ticker);
    if (pythonResult) {
      const currentPrice = await currentPricePromise;
      return NextResponse.json(withTargetSanity(pythonResult, currentPrice), {
        headers: { 'Cache-Control': 'no-store', 'X-CapitalBase-Agent-Source': 'python_backend' },
      });
    }

    const client = openAIClient();
    if (!client) {
      return NextResponse.json({
        error: 'Agent backend unavailable and OpenAI key not configured.',
      }, { status: 503 });
    }

    const contextBlocks = buildContextBlocks(ticker, intent, assetMetadata);
    const currentPrice  = await currentPricePromise;
    const reports       = await runAnalysts(client, ticker, contextBlocks);
    const debateResult  = await runDebateAndDecision(client, ticker, reports, currentPrice, intent, assetMetadata);

    if (debateResult.theme_fit_score !== null && intent?.themes.length) {
      console.info(`[tradingagents] ${ticker} theme_fit_score=${debateResult.theme_fit_score} themes=${intent.themes.join(',')}`);
    }

    const result: AnalysisResult = withTargetSanity({
      ticker,
      date:                 new Date().toISOString().slice(0, 10),
      decision:             debateResult.decision,
      summary:              debateResult.summary,
      thesis:               debateResult.thesis,
      price_target:         debateResult.price_target,
      time_horizon:         debateResult.time_horizon,
      reports,
      theme_fit_score:      debateResult.theme_fit_score,
      theme_fit_reason:     debateResult.theme_fit_reason,
      business_consistency: debateResult.business_consistency,
      source:               'openai_fallback',
    }, currentPrice);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', 'X-CapitalBase-Agent-Source': 'openai_fallback' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    );
  }
}
