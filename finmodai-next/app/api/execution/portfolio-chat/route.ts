/**
 * POST /api/execution/portfolio-chat — SSE streaming
 *
 * Full LLM-agent pipeline:
 *
 * Stage 1: screen → score → agentConsensus → debate → synthesise → validate → emit `initial`
 *   Consensus: 5 personas × N candidates (parallel, haiku)
 *   Debate: bull/bear/arbiter for top 20 (parallel, haiku + sonnet)
 *   → positions enriched with bull_case, bear_case, agent_signals
 *
 * Stage 2: hedge-fund (19 personas) + TradingAgents for top 5 → emit `enriched`
 *   → cards update with investor vote counts and debate verdict
 *
 * UserIntent flows through every stage.
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge'; // no timeout on Vercel Hobby; all deps use fetch/Web APIs only
import { getOpenAIKey } from '@/lib/openaiKey';
import { hasAnyAnthropicKey } from '@/lib/anthropicKey';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { parseUserIntent, type UserIntent } from '@/lib/execution/userIntent';
import { fetchAssetMetadata, type AssetMetadata } from '@/lib/execution/assetMetadata';
import { validatePortfolio } from '@/lib/execution/portfolioValidator';
import { runAsyncJudges } from '@/lib/execution/asyncJudge';
import { matchThemes } from '@/lib/execution/themeClassifier';
import { runAgentConsensus } from '@/lib/execution/agentConsensus';
import { runDebate } from '@/lib/execution/debate';
import type { DebateResult } from '@/lib/execution/debate';
import type { ConsensusResult } from '@/lib/execution/agentConsensus';
import {
  validateSynthesis,
  type SynthesizedPortfolio,
  type SynthesizedPosition,
  type ValidationError,
} from '@/lib/execution/synthesisValidation';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';

export const dynamic = 'force-dynamic';

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

type CacheEntry = { key: string; ranked: RankedStock[]; cachedAt: number };
let _cache: CacheEntry | null = null;

function cacheKeyForIntent(intent: UserIntent, maxTickers: number): string {
  return JSON.stringify({
    themes:         intent.themes,
    risk_profile:   intent.risk_profile,
    position_count: intent.position_count,
    asset_class:    intent.asset_class,
    maxTickers,
  });
}

async function getOrFetchRanked(
  intent: UserIntent,
  origin: string,
): Promise<{ ranked: RankedStock[]; cached: boolean }> {
  const now = Date.now();
  const targetCount = intent.position_count ?? DEFAULT_PORTFOLIO_SIZE;
  const maxTickers = Math.max(targetCount * 3, 20); // keep under Edge 30s budget
  const key = cacheKeyForIntent(intent, maxTickers);
  if (_cache && _cache.key === key && now - _cache.cachedAt < CACHE_TTL_MS) {
    return { ranked: _cache.ranked, cached: true };
  }
  const screen = await screenUniverse(intent, maxTickers);
  console.info('[stage-1 portfolio-chat] parseUserIntent', {
    themes: intent.themes,
    requested: targetCount,
    source: screen.source,
    universeTotal: screen.total,
    themeFiltered: screen.themeFiltered,
    scoredCandidates: screen.tickers.length,
  });
  const ranked = await scoreMultiple(screen.tickers, origin, 6);
  _cache = { key, ranked, cachedAt: now };
  return { ranked, cached: false };
}

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
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

// Starter-only cap from debate verdict
const STARTER_ONLY_MAX_WEIGHT = 5;

async function synthesisePortfolio(
  intent:          UserIntent,
  candidates:      RankedStock[],
  existingTickers: string[],
  debateMap:       Map<string, DebateResult>,
  consensusMap:    Map<string, ConsensusResult>,
  lastErrors?:     ValidationError[],
): Promise<SynthesizedPortfolio> {
  const targetCount = intent.position_count ?? DEFAULT_PORTFOLIO_SIZE;
  const capital     = intent.capital_usd ?? 10_000;

  // Deduplicate candidates (ticker appears exactly once) before passing to LLM
  const seen = new Set<string>();
  const deduped = candidates.filter(s => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return true;
  });

  // Filter out debate-excluded tickers; sort by final_conviction when available
  const eligible = deduped
    .filter(s => debateMap.get(s.ticker)?.verdict !== 'exclude')
    .sort((a, b) => {
      const ca = debateMap.get(a.ticker)?.final_conviction ?? consensusMap.get(a.ticker)?.avg_conviction ?? a.score;
      const cb = debateMap.get(b.ticker)?.final_conviction ?? consensusMap.get(b.ticker)?.avg_conviction ?? b.score;
      return cb - ca;
    });

  // Early-exit when debate excluded every candidate
  if (eligible.length === 0) {
    return {
      narrative:         'No viable candidates — all were excluded by the debate filter.',
      total_capital_usd: intent.capital_usd ?? 10_000,
      cash_reserve_pct:  0,
      requested_count:   targetCount,
      delivered_count:   0,
      shortfall_reason:  `All ${deduped.length} candidates were excluded by the debate filter. Try a broader prompt.`,
      positions:         [],
    };
  }

  // Document shortfall when eligible count is below requested; cap context to top 15
  const effectiveTarget = Math.min(targetCount, eligible.length);
  const preSynthesisShortfall = eligible.length < targetCount
    ? `Only ${eligible.length} viable candidates after debate filtering (${targetCount} requested).`
    : null;
  const topEligible = eligible.slice(0, Math.max(effectiveTarget, 10));

  const stockSummaries = topEligible.map(s => {
    const debate   = debateMap.get(s.ticker);
    const cs       = consensusMap.get(s.ticker);
    const forecast = s.meta.forecastReturnPct != null ? `, forecast=${s.meta.forecastReturnPct.toFixed(1)}%` : '';
    const cats     = s.meta.catalystCount > 0 ? `, ${s.meta.catalystCount} catalysts` : '';
    const debateCtx = debate
      ? ` | verdict=${debate.verdict}, conviction=${debate.final_conviction}/10`
      : '';
    const consensusCtx = cs
      ? ` | agent_avg=${cs.avg_conviction}/10`
      : '';
    const starterNote = debate?.verdict === 'starter_only' ? ' [STARTER_ONLY — cap at 5%]' : '';
    return `${s.ticker}: score=${s.score}/10${debateCtx}${consensusCtx}, sector=${s.meta.sector ?? 'N/A'}${forecast}${cats}. ${s.primaryReason}${starterNote}`;
  }).join('\n');

  const existingContext = existingTickers.length > 0
    ? `\nUser already holds: ${existingTickers.join(', ')}. Do NOT include these tickers.\n`
    : '';

  const themeContext = intent.themes.length > 0
    ? `\nRequired themes: ${intent.themes.join(', ')}. Every position must have a documented link to one of these themes.\n`
    : '';

  const capitalContext = `\nPortfolio capital: $${capital.toLocaleString()}\n`;

  const horizonContext = `Time horizon: ${intent.time_horizon === 'short' ? '3 months' : intent.time_horizon === 'long' ? '3+ years' : '1 year'}`;

  const hasF1 = lastErrors?.some(e => e.code === 'F1') ?? false;
  const errorFeedback = lastErrors && lastErrors.length > 0
    ? `\n\n⚠️ PREVIOUS ATTEMPT FAILED VALIDATION — fix ALL of these issues:\n${lastErrors.map(e => `  • [${e.code}] ${e.message}`).join('\n')}\n${
      hasF1 ? '\n🚨 CRITICAL F1 OVERRIDE: Replace EVERY "Hold" with "Buy" or "Overweight". Aggressive profiles reject Hold — this is a hard blocker.\n' : ''
    }`
    : '';

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    anthropicModels:   ['claude-sonnet-4-6'],
    clientType:        'user',
    temperature:       0.25,
    maxTokens:         4000,
    messages: [
      {
        role: 'system',
        content: `You are a senior portfolio manager assembling a final portfolio from debate-vetted candidates.
Each candidate has been through 5 analyst personas and a bull/bear/arbiter debate.
Use the conviction scores and verdicts to weight positions — higher conviction = larger weight.

STRICT RULES:
1. Common equities only. No ETFs, bond funds, or index products.
2. Only use tickers from the candidate list. Do not add outside names.
3. ${intent.themes.length > 0 ? `Every position must relate to: ${intent.themes.join(', ')}. Fill theme_justification with a 1-sentence explanation. The word "${intent.themes[0]}" or a synonym must appear in theme_justification.` : 'Fill theme_justification with the primary sector or investment category.'}
4. weight_pct must be in range 2–20. Weights must sum to exactly 100.
5. Return exactly ${effectiveTarget} position${effectiveTarget !== 1 ? 's' : ''} (or fewer with shortfall_reason if not enough qualify).
6. risk must name a specific metric, company, product, or number — not generic phrases.
7. STARTER_ONLY tickers must have weight_pct ≤ 5.
8. Aggressive risk profiles must use "Buy" or "Overweight" — not "Hold".

Weight-to-sizing (follow exactly):
- Full position: weight_pct 10–20 (conviction ≥ 8.5)
- Build: weight_pct 6–9 (conviction 7.0–8.4)
- Starter: weight_pct 2–5 (conviction < 7.0 or STARTER_ONLY)`,
      },
      {
        role: 'user',
        content: `User request: "${intent.raw_prompt}"
Risk profile: ${intent.risk_profile} | ${horizonContext}${themeContext}${existingContext}${capitalContext}${errorFeedback}
Candidates (ranked by conviction, debate-vetted):
${stockSummaries}

Return JSON:
{
  "narrative": "2-3 sentence portfolio summary mentioning themes and risk profile",
  "shortfall_reason": null or "reason if fewer than ${targetCount} positions returned",
  "positions": [
    {
      "ticker": string,
      "score": number,
      "action": "Buy" | "Overweight" | "Hold" | "Reduce",
      "sizing": "Full position" | "Build" | "Starter",
      "weight_pct": number,
      "thesis": "<2-3 sentences using the bull case and conviction rationale>",
      "risk": "<specific risk from the bear case — name a metric, competitor, or number>",
      "theme_justification": string
    }
  ]
}`,
      },
    ],
  });

  type RawResponse = { narrative?: string; shortfall_reason?: string | null; positions?: RawLLMPosition[] };
  let raw: RawResponse;
  try {
    raw = extractJsonObject(result?.text ?? '{}') as RawResponse;
  } catch {
    raw = { shortfall_reason: preSynthesisShortfall ?? 'LLM returned malformed response.', positions: [] };
  }

  const positions: SynthesizedPosition[] = (Array.isArray(raw.positions) ? raw.positions : [])
    .filter((p): p is RawLLMPosition & { ticker: string } => typeof p.ticker === 'string' && !!p.ticker)
    .map(p => {
      const ticker  = p.ticker.toUpperCase().trim();
      const debate  = debateMap.get(ticker);
      const cs      = consensusMap.get(ticker);
      // Enforce starter_only cap
      let weight_pct = typeof p.weight_pct === 'number' ? p.weight_pct : 0;
      if (debate?.verdict === 'starter_only') {
        weight_pct = Math.min(weight_pct, STARTER_ONLY_MAX_WEIGHT);
      }
      return {
        ticker,
        score:               typeof p.score === 'number' ? p.score : 0,
        action:              (['Buy', 'Overweight', 'Hold', 'Reduce', 'Sell'].includes(p.action ?? '') ? p.action : 'Hold') as SynthesizedPosition['action'],
        sizing:              (['Full position', 'Build', 'Starter'].includes(p.sizing ?? '') ? p.sizing : 'Build') as SynthesizedPosition['sizing'],
        weight_pct,
        shares:              0,
        dollar_amount:       0,
        thesis:              p.thesis              ?? '',
        theme_justification: p.theme_justification ?? '',
        risk:                p.risk                ?? '',
        bull_case:           debate?.bull_case  ?? debate?.key_bull_point ?? '',
        bear_case:           debate?.bear_case  ?? debate?.key_bear_point ?? '',
        agent_signals:       cs?.outputs ?? [],
      };
    });

  // Default capital when not stated in prompt
  const effectiveCapital = intent.capital_usd ?? 10_000;
  const narrativeSuffix  = intent.capital_usd == null ? ' (Capital assumed $10,000 — specify your budget for exact share counts.)' : '';

  return {
    narrative:         (raw.narrative ?? 'Portfolio recommendation ready.') + narrativeSuffix,
    total_capital_usd: effectiveCapital,
    cash_reserve_pct:  0,
    requested_count:   targetCount,
    delivered_count:   positions.length,
    shortfall_reason:  preSynthesisShortfall ?? raw.shortfall_reason ?? null,
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
  const hasAnthropic = hasAnyAnthropicKey();
  if (!apiKey && !hasAnthropic) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: 'LLM API key not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const client = apiKey ? new OpenAI({ apiKey }) : null;
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
        // Threshold cascade: prefer score ≥ 6.0; fall back to ≥ 5.0 when not enough candidates
        const minCandidates = Math.max(targetCount * 2, 10); // keep under Edge 30s budget
        const themeFiltered = ranked
          .filter(s => intent.themes.length === 0 || matchThemes({
            ticker: s.ticker,
            name:   s.meta.companyName ?? s.meta.sector ?? s.ticker,
            sector: s.meta.sector ?? undefined,
          }, intent.themes).fits)
          .sort((a, b) => b.score - a.score);
        const strictPass = themeFiltered.filter(s => s.score >= 6.0);
        const candidates = (strictPass.length >= minCandidates ? strictPass : themeFiltered.filter(s => s.score >= 5.0))
          .slice(0, minCandidates);

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

        // ── Agent consensus: 5 personas × all candidates (parallel, haiku) ─
        controller.enqueue(sse({ type: 'step', message: `Running agent consensus on ${candidates.length} candidates…` }));

        // Fetch AssetMetadata for all candidates concurrently (needed by personas)
        const consensusAssetMap = new Map<string, AssetMetadata | null>();
        await Promise.allSettled(
          candidates.map(async s => {
            try {
              const meta = await fetchAssetMetadata(s.ticker, client);
              consensusAssetMap.set(s.ticker, meta);
            } catch {
              consensusAssetMap.set(s.ticker, null);
            }
          }),
        );

        const consensusMap = await runAgentConsensus(candidates, consensusAssetMap, intent);
        console.info(`[portfolio-chat] consensus complete: ${consensusMap.size} tickers`);

        // ── Debate: bull/bear/arbiter on top 20 (parallel, haiku + sonnet) ─
        controller.enqueue(sse({ type: 'step', message: 'Running bull/bear debate on top candidates…' }));
        const debateMap = await runDebate(candidates, consensusAssetMap, consensusMap, intent);

        // Announce excluded tickers
        for (const [ticker, dr] of debateMap) {
          if (dr.verdict === 'exclude') {
            controller.enqueue(sse({
              type:           'rejected',
              ticker,
              reason:         `Debate verdict: exclude — ${dr.key_bear_point}`,
              medianThemeFit: 0,
            }));
          }
        }

        controller.enqueue(sse({ type: 'step', message: `Building ${targetCount}-position portfolio…` }));

        // Stages 3+4: synthesis → validate → gate loop (max 2 attempts)
        const candidateTickers = new Set(candidates.map(c => c.ticker));
        const rejectedTickers  = new Set<string>(
          [...debateMap.values()].filter(d => d.verdict === 'exclude').map(d => d.ticker),
        );
        let synthesized: SynthesizedPortfolio | null = null;
        let lastErrors: ValidationError[] = [];

        try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const raw = await synthesisePortfolio(
            intent, candidates, existingTickers,
            debateMap, consensusMap,
            attempt > 1 ? lastErrors : undefined,
          );
          const offSlate = raw.positions
            .filter(p => !candidateTickers.has(p.ticker))
            .map(p => p.ticker);
          const offTheme = intent.themes.length > 0
            ? raw.positions
              .filter(p => !matchThemes({ ticker: p.ticker }, intent.themes).fits)
              .map(p => p.ticker)
            : [];
          for (const ticker of [...offSlate, ...offTheme]) rejectedTickers.add(ticker);

          const vr   = validateSynthesis(raw, intent, rejectedTickers);
          if (offSlate.length > 0) {
            vr.errors.push({
              code:    'C9',
              message: `Ticker(s) were not in the screened candidate slate and cannot be included: ${offSlate.join(', ')}`,
              tickers: offSlate,
            });
            vr.mustRegenerate = true;
          }
          if (offTheme.length > 0) {
            vr.errors.push({
              code:    'C10',
              message: `Ticker(s) do not have a deterministic link to requested themes [${intent.themes.join(', ')}]: ${offTheme.join(', ')}`,
              tickers: offTheme,
            });
            vr.mustRegenerate = true;
          }
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
        } catch (synthErr) {
          console.error('[portfolio-chat] synthesis threw:', synthErr instanceof Error ? synthErr.message : String(synthErr));
          controller.enqueue(sse({
            type: 'initial', positions: [], positionCount: 0, cached,
            narrative: 'Portfolio synthesis failed — insufficient candidates or model error. Try a broader prompt.',
            scoredAt: new Date().toISOString(),
          }));
          controller.enqueue(sse({ type: 'done' }));
          return;
        }

        // Force-normalize weights if both synthesis attempts left them outside 100±2%.
        // This prevents C1 gate failure when the LLM ignores weight-sum feedback on both attempts.
        if (synthesized && synthesized.positions.length > 0) {
          const wSum = synthesized.positions.reduce((s, p) => s + p.weight_pct, 0);
          if (wSum > 0 && Math.abs(wSum - 100) > 2) {
            const scale = 100 / wSum;
            for (const p of synthesized.positions) {
              p.weight_pct = Math.round(p.weight_pct * scale * 10) / 10;
            }
          }
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

        // Reuse the asset map from Stage 1 consensus; fetch any missing entries
        const assetMap = new Map<string, AssetMetadata | null>(consensusAssetMap);
        await Promise.allSettled(
          topToEnrich
            .filter(pos => !assetMap.has(pos.ticker))
            .map(async pos => {
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
          if (client) void runAsyncJudges(synthesized.positions, intent, assetMap, client);
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
