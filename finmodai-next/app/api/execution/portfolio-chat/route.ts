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
 *   → validateSynthesis(portfolio, intent, rejectedTickers)   ← Stage 3
 *   → validatePortfolio(portfolio, intent)                    ← Stage 4 final gate
 *   → emit
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { parseUserIntent, type UserIntent } from '@/lib/execution/userIntent';
import { fetchAssetMetadata, type AssetMetadata } from '@/lib/execution/assetMetadata';
import { validatePortfolio } from '@/lib/execution/portfolioValidator';
import { runAsyncJudges } from '@/lib/execution/asyncJudge';
import {
  validateSynthesis,
  type SynthesizedPortfolio,
  type SynthesizedPosition,
  type ValidationError,
} from '@/lib/execution/synthesisValidation';
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
  ticker:               string;
  score:                number;
  action:               string;
  confidence:           number;           // kept for UI backward compat; always 0 post-Stage 3
  suggestedWeight:      number;           // UI backward compat alias for weight_pct
  weight_pct:           number;
  sizing:               string;
  thesis:               string;
  risk:                 string;
  themeJustification?:  string;           // UI backward compat alias for theme_justification
  theme_justification?: string;
  shares?:              number;
  dollar_amount?:       number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPortfolioPosition(p: SynthesizedPosition): PortfolioPosition {
  return {
    ticker:              p.ticker,
    score:               p.score,
    action:              p.action,
    confidence:          0,
    suggestedWeight:     p.weight_pct,
    weight_pct:          p.weight_pct,
    sizing:              p.sizing,
    thesis:              p.thesis,
    risk:                p.risk,
    themeJustification:  p.theme_justification,
    theme_justification: p.theme_justification,
    shares:              p.shares > 0 ? p.shares : undefined,
    dollar_amount:       p.dollar_amount > 0 ? p.dollar_amount : undefined,
  };
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
  const screen = await screenUniverse(intent, Math.max(targetCount * 3, 40));
  const ranked = await scoreMultiple(screen.tickers, origin, 6);
  _cache = { ranked, cachedAt: now };
  return { ranked, cached: false };
}

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

// ── Synthesis ─────────────────────────────────────────────────────────────────

type RawLLMPosition = {
  ticker?:              string;
  score?:               number;
  action?:              string;
  sizing?:              string;
  weight_pct?:          number;
  thesis?:              string;
  theme_justification?: string;
  risk?:                string;
};

async function synthesisePortfolio(
  client: OpenAI,
  intent: UserIntent,
  candidates: RankedStock[],
  existingTickers: string[],
  lastErrors?: ValidationError[],
): Promise<SynthesizedPortfolio> {
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

  const capitalContext = intent.capital_usd != null
    ? `\nPortfolio capital: $${intent.capital_usd.toLocaleString()}\n`
    : '';

  const errorFeedback = lastErrors && lastErrors.length > 0
    ? `\n\n⚠️ PREVIOUS ATTEMPT FAILED VALIDATION — fix ALL of these issues:\n${lastErrors.map(e => `  • [${e.code}] ${e.message}`).join('\n')}\n`
    : '';

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a portfolio manager building a diversified equity portfolio from pre-scored candidates. Be decisive and concise. Respond only in the JSON format requested. Output will be validated automatically.

STRICT RULES — every position must pass all of these or do not include it:
1. Common equities only. No ETFs, bond funds, closed-end funds, or index products.
2. ${intent.themes.length > 0 ? `Every position must relate to: ${intent.themes.join(', ')}. Fill theme_justification with a 1-sentence explanation of the link. The word "${intent.themes[0]}" or a synonym must appear in theme_justification.` : 'Fill theme_justification with the primary sector or investment category.'}
3. weight_pct values must be in range 2–20. Weights must sum to exactly 100.
4. Return exactly ${targetCount} positions. If you can only find N < ${targetCount} qualifying names, return N and explain in shortfall_reason.
5. risk must name a specific metric, company, product, or number. Generic risks like "competition" or "macro risk" alone are not acceptable — they will be rejected.

Weight-to-sizing mapping (do not guess — follow exactly):
- Full position: weight_pct 10–20
- Build: weight_pct 6–9
- Starter: weight_pct 2–5`,
      },
      {
        role: 'user',
        content: `User request: "${intent.raw_prompt}"
${themeContext}${existingContext}${capitalContext}${errorFeedback}
Risk profile: ${intent.risk_profile}
Candidates (scored 0–10):
${stockSummaries}

Pick the best ${targetCount} positions. All weight_pct values must be in 2–20 range and sum to exactly 100.

Return JSON:
{
  "narrative": "2-3 sentence portfolio summary",
  "shortfall_reason": null or "reason why fewer positions were returned",
  "positions": [
    {
      "ticker": string,
      "score": number,
      "action": "Buy" | "Overweight" | "Hold" | "Reduce" | "Sell",
      "sizing": "Full position" | "Build" | "Starter",
      "weight_pct": number,
      "thesis": string,
      "risk": "specific risk with a named metric, company, or number",
      "theme_justification": string
    }
  ]
}`,
      },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    narrative?: string;
    shortfall_reason?: string | null;
    positions?: RawLLMPosition[];
  };

  const positions: SynthesizedPosition[] = (Array.isArray(raw.positions) ? raw.positions : [])
    .filter((p): p is RawLLMPosition & { ticker: string } => typeof p.ticker === 'string' && !!p.ticker)
    .map(p => ({
      ticker:              p.ticker.toUpperCase().trim(),
      score:               typeof p.score === 'number' ? p.score : 0,
      action:              (['Buy', 'Overweight', 'Hold', 'Reduce', 'Sell'].includes(p.action ?? '') ? p.action : 'Hold') as SynthesizedPosition['action'],
      sizing:              (['Full position', 'Build', 'Starter'].includes(p.sizing ?? '') ? p.sizing : 'Build') as SynthesizedPosition['sizing'],
      weight_pct:          typeof p.weight_pct === 'number' ? p.weight_pct : 0,
      shares:              0,
      dollar_amount:       0,
      thesis:              p.thesis              ?? '',
      theme_justification: p.theme_justification ?? '',
      risk:                p.risk                ?? '',
    }));

  return {
    narrative:         raw.narrative ?? 'Portfolio recommendation ready.',
    total_capital_usd: intent.capital_usd,
    cash_reserve_pct:  0,
    requested_count:   targetCount,
    delivered_count:   positions.length,
    shortfall_reason:  raw.shortfall_reason ?? null,
    positions,
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

        // Stages 3+4: synthesis → validate → gate loop (max 2 attempts)
        const rejectedTickers = new Set<string>();
        let synthesized: SynthesizedPortfolio | null = null;
        let lastErrors: ValidationError[] = [];

        for (let attempt = 1; attempt <= 2; attempt++) {
          const raw = await synthesisePortfolio(
            client, intent, candidates, existingTickers,
            attempt > 1 ? lastErrors : undefined,
          );
          const vr   = validateSynthesis(raw, intent, rejectedTickers);
          const gate = validatePortfolio(vr.portfolio, intent);
          synthesized = vr.portfolio;

          const needsRetry = vr.mustRegenerate || !gate.ok;
          if (!needsRetry || attempt === 2) {
            if (attempt === 2 && !gate.ok) {
              console.error('[portfolio-chat] gate blockers after 2 attempts:', gate.blockers.map(v => v.rule_id).join(', '));
            }
            break;
          }

          const s3Errors = vr.errors.filter(e => !e.code.endsWith('_warn'));
          lastErrors = [...s3Errors, ...gate.blockers.map(v => ({ code: v.rule_id, message: v.message }))];
          console.info(`[portfolio-chat] attempt ${attempt} needs retry (s3=${vr.mustRegenerate}, gate=${!gate.ok})`);
        }

        // Final gate — never ship BLOCKER violations
        const finalGate = validatePortfolio(synthesized!, intent);
        if (!finalGate.ok) {
          console.error('[portfolio-chat] FINAL GATE BLOCKERS:', finalGate.blockers.map(v => `[${v.rule_id}] ${v.message}`).join('; '));
          controller.enqueue(sse({
            type: 'initial', positions: [], positionCount: 0, cached,
            narrative: "We couldn't produce a portfolio that fully matches your constraints. Please try again.",
            scoredAt: new Date().toISOString(),
          }));
          controller.enqueue(sse({ type: 'done' }));
          controller.close();
          return;
        }
        if (finalGate.warnings.length > 0) {
          console.warn('[portfolio-chat] gate warnings:', finalGate.warnings.map(v => `[${v.rule_id}] ${v.message}`).join('; '));
        }

        const positions: PortfolioPosition[] = (synthesized?.positions ?? []).map(toPortfolioPosition);
        const narrative: string = synthesized?.narrative ?? 'Portfolio recommendation ready.';

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

        const assetMap = new Map<string, AssetMetadata | null>();
        await Promise.allSettled(
          topToEnrich.map(async pos => {
            try {
              const meta = await fetchAssetMetadata(pos.ticker, client);
              assetMap.set(pos.ticker, meta);
            } catch {
              console.warn(`[portfolio-chat] assetMetadata fetch failed for ${pos.ticker}`);
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

          if (
            intent.themes.length > 0 &&
            medianThemeFit !== null &&
            medianThemeFit < THEME_REJECTION_THRESHOLD
          ) {
            rejectedTickers.add(r.ticker);
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

        // Fire async quality judges — background, does not block user
        if (process.env.NODE_ENV !== 'test' && synthesized) {
          void runAsyncJudges(synthesized.positions, intent, assetMap, client);
        }

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
