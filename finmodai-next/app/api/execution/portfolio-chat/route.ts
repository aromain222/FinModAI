/**
 * POST /api/execution/portfolio-chat
 *
 * Fast multi-agent portfolio builder (~10s cold, ~3s warm):
 *   1. Screen live universe (top 25 by volume) — cached 15 min
 *   2. Score all 25 in parallel via ranking engine — cached 15 min
 *   3. OpenAI gpt-4o-mini synthesises portfolio from scored data
 *
 * Hedge-fund consensus (slow 19-persona step) is intentionally excluded
 * from this path — scores already incorporate news, technicals, fundamentals
 * and catalysts. Use InvestmentChat for per-ticker deep analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 30;

// ── In-memory cache (lives in the function instance, resets on cold start) ──
type CacheEntry = { ranked: RankedStock[]; cachedAt: number };
let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60 * 1_000; // 15 minutes

export type PortfolioPosition = {
  ticker:          string;
  score:           number;
  action:          string;
  confidence:      number;
  suggestedWeight: number;
  sizing:          string;
  thesis:          string;
  risk:            string;
};

export type PortfolioChatResponse = {
  positions:     PortfolioPosition[];
  narrative:     string;
  positionCount: number;
  scoredAt:      string;
  cached:        boolean;
};

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

async function getOrFetchRanked(origin: string): Promise<{ ranked: RankedStock[]; cached: boolean }> {
  const now = Date.now();
  if (_cache && now - _cache.cachedAt < CACHE_TTL_MS) {
    return { ranked: _cache.ranked, cached: true };
  }
  const screen = await screenUniverse(25);
  const ranked = await scoreMultiple(screen.tickers, origin, 6);
  _cache = { ranked, cachedAt: now };
  return { ranked, cached: false };
}

async function synthesisePortfolio(
  client: OpenAI,
  userMessage: string,
  candidates: RankedStock[],
): Promise<{ positions: PortfolioPosition[]; narrative: string }> {
  const stockSummaries = candidates.map(s => {
    const forecast = s.meta.forecastReturnPct != null ? `, forecast=${s.meta.forecastReturnPct.toFixed(1)}%` : '';
    const catalysts = s.meta.catalystCount > 0 ? `, ${s.meta.catalystCount} catalysts` : '';
    return `${s.ticker}: score=${s.score}/10, sector=${s.meta.sector ?? 'N/A'}${forecast}${catalysts}. Reason: ${s.primaryReason}. Risk: ${s.mainRisk}`;
  }).join('\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a portfolio manager building a diversified equity portfolio from pre-scored candidates. Be decisive and concise. Respond only in the JSON format requested.',
      },
      {
        role: 'user',
        content: `User request: "${userMessage}"

Candidates (already screened and scored 0–10):
${stockSummaries}

Pick the best 5 that match the user's intent. Weights must sum to 100. Write a 2-sentence thesis and 1-sentence risk per position.

Return JSON:
{
  "narrative": "2-3 sentence portfolio summary",
  "positions": [
    {
      "ticker": string,
      "score": number,
      "action": "Buy" | "Overweight" | "Build",
      "confidence": 0-100,
      "suggestedWeight": number,
      "sizing": "Starter" | "Build" | "Full position",
      "thesis": string,
      "risk": string
    }
  ]
}`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    narrative?: string;
    positions?: PortfolioPosition[];
  };

  return {
    narrative: parsed.narrative ?? 'Portfolio recommendation ready.',
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let message = 'Build me a diversified 5-stock portfolio';
  try {
    const body = await req.json() as { message?: string };
    if (body.message) message = String(body.message).slice(0, 500);
  } catch { /* use default */ }

  const apiKey = getOpenAIKey('user');
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  try {
    const origin = appUrl(req);
    const { ranked, cached } = await getOrFetchRanked(origin);

    const candidates = ranked
      .filter(s => s.score >= 6.0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (candidates.length === 0) {
      return NextResponse.json({
        positions: [],
        narrative: 'No strong buy candidates right now (score < 6.0 across universe). Try again later.',
        positionCount: 0,
        scoredAt: new Date().toISOString(),
        cached,
      } satisfies PortfolioChatResponse);
    }

    const { positions, narrative } = await synthesisePortfolio(client, message, candidates);

    return NextResponse.json({
      positions,
      narrative,
      positionCount: positions.length,
      scoredAt:      new Date().toISOString(),
      cached,
    } satisfies PortfolioChatResponse);

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Portfolio generation failed' },
      { status: 500 },
    );
  }
}
