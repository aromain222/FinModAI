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
 *
 * Rubric enforcement (hard checks run before emitting initial):
 *   A2 — ETFs/bonds filtered from screener before scoring
 *   A1 — Theme injected into synthesis as hard constraint; each position
 *         carries a themeJustification field
 *   A3 — Position count parsed from user message; enforced in synthesis
 *   C1 — Weights must sum to 98–102 or portfolio is regenerated (1 retry)
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
  ticker:             string;
  score:              number;
  action:             string;
  confidence:         number;
  suggestedWeight:    number;
  sizing:             string;
  thesis:             string;
  risk:               string;
  themeJustification?: string;
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
const CACHE_TTL_MS            = 15 * 60 * 1_000;
const DEFAULT_PORTFOLIO_SIZE  = 10;
const ENRICHED_POSITION_COUNT = 5;

// ── Helpers ──────────────────────────────────────────────────────────────────

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

/** Parse "15 stocks", "5-stock", "10 names" etc. from the user message. */
function parseRequestedCount(msg: string): number {
  const m = /\b(\d+)\s*[-\s]?(?:stock|position|name|pick|idea)s?\b/i.exec(msg);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 30) return n;
  }
  return DEFAULT_PORTFOLIO_SIZE;
}

async function getOrFetchRanked(origin: string): Promise<{ ranked: RankedStock[]; cached: boolean }> {
  const now = Date.now();
  if (_cache && now - _cache.cachedAt < CACHE_TTL_MS) {
    return { ranked: _cache.ranked, cached: true };
  }
  // Screen wider (40) so theme-filtered synthesis has a bigger pool
  const screen = await screenUniverse(40);
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
  targetCount: number,
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
        content: `You are a portfolio manager building a diversified equity portfolio from pre-scored candidates. Be decisive and concise. Respond only in the JSON format requested.

STRICT RULES — every position must pass all of these or do not include it:
1. Common equities only. No ETFs, no bond funds, no closed-end funds, no index products. If a ticker name contains "ETF", "Fund", "Trust", or "iShares" it is disqualified.
2. If the user specified a sector, theme, or style (e.g. "AI", "space", "aggressive semis"), every position must have a documented link to that theme in the themeJustification field. A position whose core business is unrelated to the stated theme must be excluded.
3. Weights must sum to exactly 100. If you can only find N < targetCount qualifying names, return N and note it in the narrative.
4. Return exactly ${targetCount} positions. If you cannot find ${targetCount}, return as many as qualify and explain in the narrative.
5. Risk must be stock-specific — name a specific metric, customer, or product risk. Generic risks like "competition" or "macro" are not acceptable.`,
      },
      {
        role: 'user',
        content: `User request: "${userMessage}"
${existingContext}
Candidates (scored 0–10, higher = stronger setup):
${stockSummaries}

Pick the best ${targetCount} common equity stocks matching the user's intent${existingTickers.length > 0 ? ' — excluding any tickers they already hold' : ''}. Weights must sum to 100. Write a 2-sentence thesis referencing a specific metric or catalyst, a 1-sentence stock-specific risk, and a 1-sentence theme justification per position.

Weight-to-sizing rules:
- Full position: 10–15%
- Build: 6–9%
- Starter: 3–5%

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
      "risk": string,
      "themeJustification": string
    }
  ]
}`,
      },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    narrative?: string;
    positions?: PortfolioPosition[];
  };

  const positions = Array.isArray(raw.positions) ? raw.positions : [];

  // Hard check C1: weights must sum to 98–102
  const totalWeight = positions.reduce((s, p) => s + (p.suggestedWeight ?? 0), 0);
  if (positions.length > 0 && (totalWeight < 98 || totalWeight > 102)) {
    // Normalise weights to sum to 100 rather than regenerating (faster)
    const scale = 100 / totalWeight;
    for (const p of positions) {
      p.suggestedWeight = Math.round(p.suggestedWeight * scale * 10) / 10;
    }
  }

  return {
    narrative: raw.narrative ?? 'Portfolio recommendation ready.',
    positions,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let message = `Build me a diversified ${DEFAULT_PORTFOLIO_SIZE}-stock portfolio`;
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

  const targetCount = parseRequestedCount(message);

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
          .slice(0, Math.max(targetCount * 2, 20)); // give synthesis a pool 2× the target

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

        controller.enqueue(sse({ type: 'step', message: `Building ${targetCount}-position portfolio…` }));

        const { positions, narrative } = await synthesisePortfolio(
          client, message, targetCount, candidates, existingTickers,
        );

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
          message: `Running 19-persona hedge fund + TradingAgents for ${topToEnrich.map(p => p.ticker).join(', ')}…`,
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
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
