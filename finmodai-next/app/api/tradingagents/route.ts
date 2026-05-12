import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

type AnalystReports = {
  market: string | null;
  fundamentals: string | null;
  sentiment: string | null;
  news: string | null;
};

type AnalysisResult = {
  ticker: string;
  date: string;
  decision: string;
  summary: string | null;
  thesis: string | null;
  price_target: number | null;
  time_horizon: string | null;
  reports: AnalystReports;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runAnalysts(ticker: string): Promise<AnalystReports> {
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: `You are the TradingAgents debate pipeline — 4 specialist analysts each writing a focused 3-4 sentence research note on ${ticker}. Each analyst has a distinct domain and voice.`,
      },
      {
        role: 'user',
        content: `Write 4 analyst research notes for ${ticker}:

1. Market Analyst — technical price action, trend, momentum, key levels, volume signals
2. Fundamentals Analyst — revenue growth, margins, earnings quality, balance sheet, FCF
3. Sentiment Analyst — options positioning, short interest, insider activity, institutional flows
4. News Analyst — recent catalyst news, analyst upgrades/downgrades, sector/macro headwinds or tailwinds

Each note should be 3-4 concise sentences that a PM would read before making a decision.

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

async function runDebateAndDecision(ticker: string, reports: AnalystReports): Promise<{
  decision: string;
  summary: string;
  thesis: string;
  price_target: number | null;
  time_horizon: string;
}> {
  const reportText = [
    reports.market       ? `MARKET: ${reports.market}`       : '',
    reports.fundamentals ? `FUNDAMENTALS: ${reports.fundamentals}` : '',
    reports.sentiment    ? `SENTIMENT: ${reports.sentiment}`   : '',
    reports.news         ? `NEWS: ${reports.news}`             : '',
  ].filter(Boolean).join('\n\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: `You are the TradingAgents portfolio manager. A bull researcher and bear researcher have debated the four analyst reports below. Synthesize the debate into a final trading decision for ${ticker}.`,
      },
      {
        role: 'user',
        content: `Analyst reports for ${ticker}:\n\n${reportText}\n\nBull case: Weigh the strongest bullish signals and near-term catalysts.\nBear case: Weigh the key risks — valuation, momentum, macro.\n\nReturn JSON: { "decision": "Buy"|"Hold"|"Sell"|"Overweight"|"Underweight", "summary": "2-3 sentence debate synthesis", "thesis": "1-2 sentence core thesis the PM is acting on", "price_target": <number or null>, "time_horizon": "e.g. 3-6 months" }`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    decision?: string; summary?: string; thesis?: string;
    price_target?: number | null; time_horizon?: string;
  };

  return {
    decision:     parsed.decision     ?? 'Hold',
    summary:      parsed.summary      ?? '',
    thesis:       parsed.thesis       ?? '',
    price_target: typeof parsed.price_target === 'number' ? parsed.price_target : null,
    time_horizon: parsed.time_horizon ?? '3-6 months',
  };
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
    const reports = await runAnalysts(ticker);
    const debateResult = await runDebateAndDecision(ticker, reports);

    const result: AnalysisResult = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
      decision:     debateResult.decision,
      summary:      debateResult.summary,
      thesis:       debateResult.thesis,
      price_target: debateResult.price_target,
      time_horizon: debateResult.time_horizon,
      reports,
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
