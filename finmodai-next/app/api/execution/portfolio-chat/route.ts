/**
 * POST /api/execution/portfolio-chat — SSE streaming
 *
 * Two-stage pipeline so the user sees cards fast then agents fill in:
 *
 * Stage 1 (~10–13s): screen → score → synthesise → validate → emit `initial`
 *   → position cards appear immediately
 *
 * Stage 2 (~+15s): hedge-fund (19 personas) + TradingAgents debate
 *   run in parallel for top 5 positions → emit `enriched`
 *   → cards update with investor votes and debate verdict
 *
 * UserIntent flows through every stage:
 *   parseUserIntent(prompt) → intent
 *   → screenUniverse(intent)
 *   → synthesisePortfolio(client, intent, candidates, existingTickers)
 *   → validate(portfolio, intent)
 *   → emit
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { parseUserIntent, type UserIntent } from '@/lib/execution/userIntent';
import { fetchAssetMetadata, type AssetMetadata } from '@/lib/execution/assetMetadata';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const DEFAULT_PORTFOLIO_SIZE  = 10;
const ENRICHED_POSITION_COUNT = 5;
const CACHE_TTL_MS            = 15 * 60 * 1_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type PortfolioPosition = {
  ticker:              string;
  score:               number;
  action:              string;
  confidence:          number;
  suggestedWeight:     number;
  sizing:              string;
  thesis:              string;
  risk:                string;
  themeJustification?: string;
};

export type EnrichedTicker = {
  ticker:              string;
  bullishCount:        number;
  bearishCount:        number;
  totalPersonas:       number;
  medianThemeFit:      number | null;
  tradingDecision:     string;
  tradingThesis:       string;
  tradingTimeHorizon:  string;
  tradingThemeFit:     number | null;
  businessConsistency: boolean;
};

export type SSEEvent =
  | { type: 'step';     message: string }
  | { type: 'initial';  positions: PortfolioPosition[]; narrative: string; positionCount: number; scoredAt: string; cached: boolean }
  | { type: 'enriched'; items: EnrichedTicker[] }
  | { type: 'rejected'; ticker: string; reason: string; medianThemeFit: number }
  | { type: 'error';    message: string }
  | { type: 'done' };

// ── Validation (Stage 4 stub — hard checks run post-synthesis) ───────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

function validate(positions: PortfolioPosition[], intent: UserIntent): ValidationResult {
  const reasons: string[] = [];

  // A3: position count
  if (intent.position_count !== null && positions.length !== intent.position_count) {
    reasons.push(
      `A3: requested ${intent.position_count} positions, got ${positions.length}`,
    );
  }

  // C1: weights must sum to 98–102
  const totalWeight = positions.reduce((s, p) => s + (p.suggestedWeight ?? 0), 0);
  if (positions.length > 0 && (totalWeight < 98 || totalWeight > 102)) {
    reasons.push(`C1: weights sum to ${totalWeight.toFixed(1)}% (expected 98–102%)`);
    // Log the pre-fix value so we have telemetry on synthesis accuracy,
    // then normalise in-place so the response is still usable.
    console.warn(`[portfolio-chat] validate C1 auto-fix: weight sum was ${totalWeight.toFixed(1)}%`);
    const scale = 100 / totalWeight;
    for (const p of positions) {
      p.suggestedWeight = Math.round(p.suggestedWeight * scale * 10) / 10;
    }
    // Remove from reasons — we fixed it, so it's a warning not a hard fail
    reasons.splice(reasons.indexOf(reasons.find(r => r.startsWith('C1'))!), 1);
  }

  // A1: theme justification present when themes were specified
  if (intent.themes.length > 0) {
    const missing = positions.filter(p => !p.themeJustification?.trim());
    if (missing.length > 0) {
      reasons.push(
        `A1: missing themeJustification on ${missing.map(p => p.ticker).join(', ')}`,
      );
    }
  }

  if (reasons.length > 0) {
    console.warn('[portfolio-chat] validation warnings:', reasons);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

type CacheEntry = { ranked: RankedStock[]; cachedAt: number };
let _cache: CacheEntry | null = null;

async function getOrFetchRanked(
  intent: UserIntent,
  origin: string,
): Promise<{ ranked: RankedStock[]; cached: boolean }> {
  const now = Date.now();
  if (_cache && now - _cache.cachedAt < CACHE_TTL_MS) {
    return { ranked: _cache.ranked, cached: true };
  }
  const targetCount = intent.position_count ?? DEFAULT_PORTFOLIO_SIZE;
  // Screen wider than the target so synthesis has a theme-filtered pool
  const screen = await screenUniverse(intent, Math.max(targetCount * 3, 40));
  const ranked = await scoreMultiple(screen.tickers, origin, 6);
  _cache = { ranked, cachedAt: now };
  return { ranked, cached: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

async function runHedgeFund(
  ticker: string,
  intent: UserIntent,
  asset: AssetMetadata | null,
  baseUrl: string,
): Promise<{ consensus: { bullish: number; bearish: number; neutral: number }; median_theme_fit: number | null } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/hedge-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, intent, assetMetadata: asset }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ consensus: { bullish: number; bearish: number; neutral: number }; median_theme_fit: number | null }>;
  } catch { return null; }
}

async function runTradingAgents(
  ticker: string,
  intent: UserIntent,
  asset: AssetMetadata | null,
  baseUrl: string,
): Promise<{
  decision: string; thesis: string; time_horizon: string;
  theme_fit_score: number | null; business_consistency: boolean;
} | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tradingagents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, intent, assetMetadata: asset }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      decision?: string; thesis?: string; time_horizon?: string;
      theme_fit_score?: number | null; business_consistency?: boolean;
    };
    return {
      decision:             data.decision             ?? 'Hold',
      thesis:               data.thesis               ?? '',
      time_horizon:         data.time_horizon         ?? '3–6 months',
      theme_fit_score:      data.theme_fit_score      ?? null,
      business_consistency: data.business_consistency ?? true,
    };
  } catch { return null; }
}

async function synthesisePortfolio(
  client: OpenAI,
  intent: UserIntent,
  candidates: RankedStock[],
  existingTickers: string[] = [],
): Promise<{ positions: PortfolioPosition[]; narrative: string }> {
  const targetCount = intent.position_count ?? DEFAULT_PORTFOLIO_SIZE;

  const stockSummaries = candidates.map(s => {
    const forecast = s.meta.forecastReturnPct != null ? `, forecast=${s.meta.forecastReturnPct.toFixed(1)}%` : '';
    const cats     = s.meta.catalystCount > 0 ? `, ${s.meta.catalystCount} catalysts` : '';
    return `${s.ticker}: score=${s.score}/10, sector=${s.meta.sector ?? 'N/A'}${forecast}${cats}. Reason: ${s.primaryReason}. Risk: ${s.mainRisk}`;
  }).join('\n');

  const existingContext = existingTickers.length > 0
    ? `\nUser already holds: ${existingTickers.join(', ')}. Do NOT include these tickers.\n`
    : '';

  const themeContext = intent.themes.length > 0
    ? `\nRequired themes: ${intent.themes.join(', ')}. Every position must have a documented link to one of these themes.\n`
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
1. Common equities only. No ETFs, bond funds, closed-end funds, or index products.
2. ${intent.themes.length > 0 ? `Every position must relate to: ${intent.themes.join(', ')}. Fill themeJustification with a 1-sentence explanation of the link. Positions without a clear theme link must be excluded.` : 'Fill themeJustification with the primary sector or investment category.'}
3. Weights must sum to exactly 100.
4. Return exactly ${targetCount} positions. If you can only find N < ${targetCount} qualifying names, return N and note it in the narrative.
5. Risk must name a specific metric, customer, product, or regulatory risk. Generic risks like "competition" or "macro" alone are not acceptable.

Weight-to-sizing mapping:
- Full position: 10–15%
- Build: 6–9%
- Starter: 3–5%`,
      },
      {
        role: 'user',
        content: `User request: "${intent.raw_prompt}"
${themeContext}${existingContext}
Risk profile: ${intent.risk_profile}
Candidates (scored 0–10):
${stockSummaries}

Pick the best ${targetCount} positions. Weights sum to 100.

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

  return {
    narrative: raw.narrative ?? 'Portfolio recommendation ready.',
    positions: Array.isArray(raw.positions) ? raw.positions : [],
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let rawMessage = `Build me a diversified ${DEFAULT_PORTFOLIO_SIZE}-stock portfolio`;
  let existingTickers: string[] = [];
  try {
    const body = await req.json() as { message?: string; existingTickers?: unknown };
    if (body.message) rawMessage = String(body.message).slice(0, 500);
    if (Array.isArray(body.existingTickers)) {
      existingTickers = body.existingTickers
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.toUpperCase().trim())
        .slice(0, 50);
    }
  } catch { /* use default */ }

  const intent = parseUserIntent(rawMessage);

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
  const targetCount = intent.position_count ?? DEFAULT_PORTFOLIO_SIZE;

  function sse(event: SSEEvent): Uint8Array {
    return enc.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Stage 1: Screen + score + synthesise + validate ───────────────
        controller.enqueue(sse({ type: 'step', message: 'Screening live stock universe…' }));

        const { ranked, cached } = await getOrFetchRanked(intent, origin);
        const candidates = ranked
          .filter(s => s.score >= 6.0)
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(targetCount * 2, 20));

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
          client, intent, candidates, existingTickers,
        );

        // Validate before emitting — fixes in-place where possible, logs warnings
        validate(positions, intent);

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

        // ── Stage 2: Enrich top N with hedge-fund + TradingAgents ─────────
        const topToEnrich = positions.slice(0, ENRICHED_POSITION_COUNT);
        controller.enqueue(sse({
          type: 'step',
          message: `Running 19-persona hedge fund + TradingAgents for ${topToEnrich.map(p => p.ticker).join(', ')}…`,
        }));

        // Pre-fetch asset metadata for all tickers in parallel (cached after first hit)
        const assetMap = new Map<string, AssetMetadata | null>();
        await Promise.allSettled(
          topToEnrich.map(async pos => {
            try {
              const meta = await fetchAssetMetadata(pos.ticker, client);
              assetMap.set(pos.ticker, meta);
            } catch {
              console.warn(`[portfolio-chat] assetMetadata fetch failed for ${pos.ticker}, falling back`);
              assetMap.set(pos.ticker, null);
            }
          }),
        );

        const THEME_REJECTION_THRESHOLD = 5;

        const enrichedRaw = await Promise.all(
          topToEnrich.map(async pos => {
            const asset = assetMap.get(pos.ticker) ?? null;
            const [hfRes, taRes] = await Promise.allSettled([
              runHedgeFund(pos.ticker, intent, asset, origin),
              runTradingAgents(pos.ticker, intent, asset, origin),
            ]);
            const hf = hfRes.status === 'fulfilled' ? hfRes.value : null;
            const ta = taRes.status === 'fulfilled' ? taRes.value : null;
            return { ticker: pos.ticker, hf, ta };
          }),
        );

        const items: EnrichedTicker[] = [];
        for (const r of enrichedRaw) {
          const medianThemeFit = r.hf?.median_theme_fit ?? r.ta?.theme_fit_score ?? null;

          // Emit rejection event when agents agree the ticker is off-theme
          if (
            intent.themes.length > 0 &&
            medianThemeFit !== null &&
            medianThemeFit < THEME_REJECTION_THRESHOLD
          ) {
            console.warn(`[portfolio-chat] Stage 2 rejected ${r.ticker} — median_theme_fit=${medianThemeFit.toFixed(1)} < ${THEME_REJECTION_THRESHOLD}`);
            controller.enqueue(sse({
              type:           'rejected',
              ticker:         r.ticker,
              reason:         `Agent consensus: theme fit score ${medianThemeFit.toFixed(1)}/10 is below threshold for themes [${intent.themes.join(', ')}]`,
              medianThemeFit: medianThemeFit,
            }));
            continue;
          }

          items.push({
            ticker:              r.ticker,
            bullishCount:        r.hf?.consensus.bullish ?? 0,
            bearishCount:        r.hf?.consensus.bearish ?? 0,
            totalPersonas:       r.hf ? r.hf.consensus.bullish + r.hf.consensus.bearish + r.hf.consensus.neutral : 0,
            medianThemeFit:      medianThemeFit,
            tradingDecision:     r.ta?.decision          ?? '',
            tradingThesis:       r.ta?.thesis            ?? '',
            tradingTimeHorizon:  r.ta?.time_horizon      ?? '',
            tradingThemeFit:     r.ta?.theme_fit_score      ?? null,
            businessConsistency: r.ta?.business_consistency ?? true,
          });
        }

        controller.enqueue(sse({ type: 'enriched', items }));
        controller.enqueue(sse({ type: 'done' }));

      } catch (err) {
        controller.enqueue(sse({
          type: 'error',
          message: err instanceof Error ? err.message : 'Portfolio generation failed',
        }));
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
