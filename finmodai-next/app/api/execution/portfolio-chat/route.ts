/**
 * POST /api/execution/portfolio-chat — SSE streaming
 *
 * Two-stage pipeline so the user sees cards fast then agents fill in:
 *
 * Stage 1 (~10–13s): screen → score → synthesise → emit `initial`
 *   → position cards appear immediately
 *
 * Stage 2 (~+15s): hedge-fund (19 personas) + TradingAgents debate
 *   run in parallel for top 5 positions → emit `enriched`
 *   → cards update with investor votes and debate verdict
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

// ── Types ────────────────────────────────────────────────────────────────────

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

export type EnrichedTicker = {
  ticker:              string;
  bullishCount:        number;
  bearishCount:        number;
  totalPersonas:       number;
  tradingDecision:     string;
  tradingThesis:       string;
  tradingTimeHorizon:  string;
};

export type SSEEvent =
  | { type: 'step';     message: string }
  | { type: 'initial';  positions: PortfolioPosition[]; narrative: string; positionCount: number; scoredAt: string; cached: boolean }
  | { type: 'enriched'; items: EnrichedTicker[] }
  | { type: 'error';    message: string }
  | { type: 'done' };

// ── In-memory cache (function-instance lifetime, reset on cold start) ────────

type CacheEntry = { ranked: RankedStock[]; cachedAt: number };
let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60 * 1_000;
const TARGET_PORTFOLIO_SIZE = 10;
const ENRICHED_POSITION_COUNT = 5;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function runHedgeFund(ticker: string, baseUrl: string): Promise<{
  consensus: { bullish: number; bearish: number; neutral: number };
} | null> {
  try {
    const res = await fetch(`${baseUrl}/api/hedge-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ consensus: { bullish: number; bearish: number; neutral: number } }>;
  } catch { return null; }
}

async function runTradingAgents(ticker: string, baseUrl: string): Promise<{
  decision: string; thesis: string; time_horizon: string;
} | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tradingagents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { decision?: string; thesis?: string; time_horizon?: string };
    return {
      decision:     data.decision     ?? 'Hold',
      thesis:       data.thesis       ?? '',
      time_horizon: data.time_horizon ?? '3–6 months',
    };
  } catch { return null; }
}

async function synthesisePortfolio(
  client: OpenAI,
  userMessage: string,
  candidates: RankedStock[],
  existingTickers: string[] = [],
): Promise<{ positions: PortfolioPosition[]; narrative: string }> {
  const stockSummaries = candidates.map(s => {
    const forecast = s.meta.forecastReturnPct != null ? `, forecast=${s.meta.forecastReturnPct.toFixed(1)}%` : '';
    const cats     = s.meta.catalystCount > 0 ? `, ${s.meta.catalystCount} catalysts` : '';
    return `${s.ticker}: score=${s.score}/10, sector=${s.meta.sector ?? 'N/A'}${forecast}${cats}. Reason: ${s.primaryReason}. Risk: ${s.mainRisk}`;
  }).join('\n');

  const existingContext = existingTickers.length > 0
    ? `\nUser already holds: ${existingTickers.join(', ')}. Do NOT include these tickers. Only suggest new additions.\n`
    : '';

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
${existingContext}
Candidates (scored 0–10, higher = stronger setup):
${stockSummaries}

Pick the best ${TARGET_PORTFOLIO_SIZE} matching the user's intent${existingTickers.length > 0 ? ' — excluding any tickers they already hold' : ''}. Weights must sum to 100. Write a 2-sentence thesis and 1-sentence risk per position.

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

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let message = `Build me a diversified ${TARGET_PORTFOLIO_SIZE}-stock portfolio`;
  let existingTickers: string[] = [];
  try {
    const body = await req.json() as { message?: string; existingTickers?: unknown };
    if (body.message) message = String(body.message).slice(0, 500);
    if (Array.isArray(body.existingTickers)) {
      existingTickers = body.existingTickers
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.toUpperCase().trim())
        .slice(0, 50);
    }
  } catch { /* use default */ }

  const apiKey = getOpenAIKey('user');
  if (!apiKey) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: 'OpenAI API key not configured' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const client = new OpenAI({ apiKey });
  const origin = appUrl(req);
  const enc    = new TextEncoder();

  function sse(event: SSEEvent): Uint8Array {
    return enc.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Stage 1: Screen + score + synthesise ──────────────────────────
        controller.enqueue(sse({ type: 'step', message: 'Screening live stock universe…' }));

        const { ranked, cached } = await getOrFetchRanked(origin);
        const candidates = ranked
          .filter(s => s.score >= 6.0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        if (candidates.length === 0) {
          controller.enqueue(sse({
            type: 'initial',
            positions: [],
            narrative: 'No strong buy candidates right now (score < 6.0 across universe). Try again later.',
            positionCount: 0,
            scoredAt: new Date().toISOString(),
            cached,
          }));
          controller.enqueue(sse({ type: 'done' }));
          controller.close();
          return;
        }

        controller.enqueue(sse({
          type: 'step',
          message: cached ? 'Using cached scores…' : 'Scoring candidates in parallel…',
        }));

        controller.enqueue(sse({ type: 'step', message: 'Building initial recommendations…' }));

        const { positions, narrative } = await synthesisePortfolio(client, message, candidates, existingTickers);

        controller.enqueue(sse({
          type: 'initial',
          positions,
          narrative,
          positionCount: positions.length,
          scoredAt: new Date().toISOString(),
          cached,
        }));

        if (positions.length === 0) {
          controller.enqueue(sse({ type: 'done' }));
          controller.close();
          return;
        }

        // ── Stage 2: Enrich top 5 with hedge-fund + TradingAgents ─────────
        const topToEnrich = positions.slice(0, ENRICHED_POSITION_COUNT);
        controller.enqueue(sse({
          type: 'step',
          message: `Running 19-persona hedge fund analysis + TradingAgents debate for ${topToEnrich.map(p => p.ticker).join(', ')}…`,
        }));

        const enrichedRaw = await Promise.all(
          topToEnrich.map(async pos => {
            const [hfRes, taRes] = await Promise.allSettled([
              runHedgeFund(pos.ticker, origin),
              runTradingAgents(pos.ticker, origin),
            ]);
            const hf = hfRes.status === 'fulfilled' ? hfRes.value : null;
            const ta = taRes.status === 'fulfilled' ? taRes.value : null;
            return { ticker: pos.ticker, hf, ta };
          }),
        );

        const items: EnrichedTicker[] = enrichedRaw.map(r => ({
          ticker:              r.ticker,
          bullishCount:        r.hf?.consensus.bullish ?? 0,
          bearishCount:        r.hf?.consensus.bearish ?? 0,
          totalPersonas:       r.hf ? r.hf.consensus.bullish + r.hf.consensus.bearish + r.hf.consensus.neutral : 0,
          tradingDecision:     r.ta?.decision     ?? '',
          tradingThesis:       r.ta?.thesis       ?? '',
          tradingTimeHorizon:  r.ta?.time_horizon ?? '',
        }));

        controller.enqueue(sse({ type: 'enriched', items }));
        controller.enqueue(sse({ type: 'done' }));

      } catch (err) {
        controller.enqueue(sse({ type: 'error', message: err instanceof Error ? err.message : 'Portfolio generation failed' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
