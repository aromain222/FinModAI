/**
 * Debate Stage
 *
 * For each candidate ticker, runs a bull/bear debate followed by an arbiter
 * that decides include / exclude / starter_only.
 *
 * - Bull and Bear calls: claude-haiku (parallel per ticker)
 * - Arbiter call: claude-sonnet (quality matters here)
 * - All ticker debates run concurrently (Promise.all)
 *
 * Tickers with verdict "exclude" are dropped.
 * Tickers with verdict "starter_only" are capped at 5% weight in synthesis.
 */

import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { UserIntent } from './userIntent';
import type { AssetMetadata } from './assetMetadata';
import type { RankedStock } from '@/lib/ranking/types';
import type { ConsensusResult } from './agentConsensus';

export type DebateVerdict = 'include' | 'exclude' | 'starter_only';

export type DebateResult = {
  ticker:             string;
  verdict:            DebateVerdict;
  final_conviction:   number;    // 0-10
  key_bull_point:     string;
  key_bear_point:     string;
  decision_rationale: string;
  bull_case:          string;    // full bull argument
  bear_case:          string;    // full bear argument
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = cleaned.indexOf('{');
  const last  = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object');
  return JSON.parse(cleaned.slice(first, last + 1));
}

function safeVerdict(v: unknown): DebateVerdict {
  if (v === 'include' || v === 'exclude' || v === 'starter_only') return v;
  return 'include';
}

function clamp(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? def : Math.max(lo, Math.min(hi, n));
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(
  stock:     RankedStock,
  asset:     AssetMetadata | null,
  consensus: ConsensusResult,
  intent:    UserIntent,
): string {
  const themeCtx = intent.themes.length > 0
    ? `Requested themes: ${intent.themes.join(', ')} | Risk profile: ${intent.risk_profile}`
    : `Risk profile: ${intent.risk_profile}`;

  const assetCtx = asset
    ? `${asset.name} (${stock.ticker}) — ${asset.sector} / ${asset.industry}\n${asset.business_summary}`
    : `${stock.ticker} — no business metadata`;

  const signalDist = consensus.signal_distribution;
  const signalSummary = [
    signalDist.strong_buy > 0 ? `${signalDist.strong_buy} strong_buy` : '',
    signalDist.buy        > 0 ? `${signalDist.buy} buy`         : '',
    signalDist.hold       > 0 ? `${signalDist.hold} hold`        : '',
    signalDist.sell       > 0 ? `${signalDist.sell} sell`        : '',
  ].filter(Boolean).join(', ');

  const forecastCtx = stock.meta.forecastReturnPct != null
    ? ` | Forecast return: ${stock.meta.forecastReturnPct.toFixed(1)}%`
    : '';

  return `${themeCtx}
${assetCtx}

Composite score: ${stock.score}/10 (${stock.signal})${forecastCtx}
Agent consensus (${consensus.outputs.length} personas, avg conviction ${consensus.avg_conviction}/10): ${signalSummary}
Primary reason: ${stock.primaryReason}
Main risk: ${stock.mainRisk}`;
}

// ── Bull call (haiku) ─────────────────────────────────────────────────────────

async function runBull(
  stock:     RankedStock,
  asset:     AssetMetadata | null,
  consensus: ConsensusResult,
  intent:    UserIntent,
): Promise<string> {
  const ctx = buildContext(stock, asset, consensus, intent);

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    anthropicModels:   ['claude-haiku-4-5-20251001'],
    clientType:        'user',
    temperature:       0.4,
    maxTokens:         300,
    messages: [
      {
        role:    'system',
        content: `You are the BULL analyst in a portfolio debate. Your job is to make
the strongest possible case FOR including this ticker in the portfolio.
Draw on the composite score, agent signals, catalyst pipeline, and theme alignment.
Be specific — cite numbers, products, or competitive dynamics. 3-4 sentences.`,
      },
      {
        role:    'user',
        content: `${ctx}\n\nMake the strongest bull case for including ${stock.ticker}.`,
      },
    ],
  }).catch(() => null);

  return result?.text?.trim() ?? `${stock.ticker} presents a compelling setup based on the composite score of ${stock.score}/10 and ${stock.primaryReason}`;
}

// ── Bear call (haiku) ─────────────────────────────────────────────────────────

async function runBear(
  stock:     RankedStock,
  asset:     AssetMetadata | null,
  consensus: ConsensusResult,
  intent:    UserIntent,
): Promise<string> {
  const ctx = buildContext(stock, asset, consensus, intent);

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    anthropicModels:   ['claude-haiku-4-5-20251001'],
    clientType:        'user',
    temperature:       0.4,
    maxTokens:         300,
    messages: [
      {
        role:    'system',
        content: `You are the BEAR analyst in a portfolio debate. Your job is to make
the strongest possible case AGAINST including this ticker in the portfolio.
Challenge the consensus — identify what the bulls are ignoring, risks that are
underpriced, or better alternatives. Be specific and contrarian. 3-4 sentences.`,
      },
      {
        role:    'user',
        content: `${ctx}\n\nMake the strongest bear case against including ${stock.ticker}.`,
      },
    ],
  }).catch(() => null);

  return result?.text?.trim() ?? `${stock.ticker} carries risk: ${stock.mainRisk}`;
}

// ── Arbiter call (sonnet) ─────────────────────────────────────────────────────

async function runArbiter(
  stock:     RankedStock,
  bullCase:  string,
  bearCase:  string,
  consensus: ConsensusResult,
  intent:    UserIntent,
): Promise<Omit<DebateResult, 'ticker' | 'bull_case' | 'bear_case'>> {
  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    anthropicModels:   ['claude-sonnet-4-6'],
    clientType:        'user',
    temperature:       0.2,
    maxTokens:         350,
    messages: [
      {
        role:    'system',
        content: `You are the arbiter in a portfolio construction debate. You have heard
the bull and bear cases. Your job is to render a final verdict.

Verdict options:
- "include": this ticker earns a place in the portfolio
- "starter_only": include but cap weight at 5% — the bear raises real doubts
- "exclude": the bear case is strong enough to reject this ticker

Be decisive. Return ONLY valid JSON.`,
      },
      {
        role:    'user',
        content: `Ticker: ${stock.ticker} | Score: ${stock.score}/10 | Avg agent conviction: ${consensus.avg_conviction}/10
Risk profile: ${intent.risk_profile} | Themes: ${intent.themes.length > 0 ? intent.themes.join(', ') : 'none'}

BULL CASE:
${bullCase}

BEAR CASE:
${bearCase}

Render your verdict. Return this JSON (no extra fields):
{
  "verdict": "include" | "exclude" | "starter_only",
  "final_conviction": <number 0-10>,
  "key_bull_point": "<the single most compelling bull argument, 1 sentence>",
  "key_bear_point": "<the single most compelling bear argument, 1 sentence>",
  "decision_rationale": "<why you chose this verdict, 2 sentences>"
}`,
      },
    ],
  }).catch(() => null);

  try {
    const parsed = extractJson(result?.text ?? '{}') as Record<string, unknown>;
    return {
      verdict:            safeVerdict(parsed.verdict),
      final_conviction:   clamp(parsed.final_conviction, 0, 10, consensus.avg_conviction),
      key_bull_point:     typeof parsed.key_bull_point     === 'string' ? parsed.key_bull_point     : '',
      key_bear_point:     typeof parsed.key_bear_point     === 'string' ? parsed.key_bear_point     : '',
      decision_rationale: typeof parsed.decision_rationale === 'string' ? parsed.decision_rationale : '',
    };
  } catch {
    // Default to include on arbiter failure — preserve the candidate
    return {
      verdict:            'include',
      final_conviction:   consensus.avg_conviction,
      key_bull_point:     stock.primaryReason,
      key_bear_point:     stock.mainRisk,
      decision_rationale: 'Arbiter defaulted to include based on composite score.',
    };
  }
}

// ── Single ticker debate ──────────────────────────────────────────────────────

async function debateTicker(
  stock:     RankedStock,
  asset:     AssetMetadata | null,
  consensus: ConsensusResult,
  intent:    UserIntent,
): Promise<DebateResult> {
  // Bull and Bear fire in parallel; Arbiter waits for both
  const [bullCase, bearCase] = await Promise.all([
    runBull(stock, asset, consensus, intent),
    runBear(stock, asset, consensus, intent),
  ]);

  const arbiter = await runArbiter(stock, bullCase, bearCase, consensus, intent);

  return {
    ticker:   stock.ticker,
    bull_case: bullCase,
    bear_case: bearCase,
    ...arbiter,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs bull/bear/arbiter for each candidate concurrently.
 * Takes the top MAX_DEBATE_CANDIDATES by avg_conviction from the consensus map.
 *
 * Returns a map from ticker to DebateResult.
 * Tickers that fail are given a default "include" verdict so the pipeline
 * continues gracefully.
 */
export const MAX_DEBATE_CANDIDATES = 20;

export async function runDebate(
  stocks:    RankedStock[],
  assetMap:  Map<string, AssetMetadata | null>,
  consensus: Map<string, ConsensusResult>,
  intent:    UserIntent,
): Promise<Map<string, DebateResult>> {
  // Take top MAX_DEBATE_CANDIDATES by avg_conviction
  const ranked = stocks
    .filter(s => consensus.has(s.ticker))
    .sort((a, b) => {
      const ca = consensus.get(a.ticker)!.avg_conviction;
      const cb = consensus.get(b.ticker)!.avg_conviction;
      return cb - ca;
    })
    .slice(0, MAX_DEBATE_CANDIDATES);

  console.info(`[debate] running on ${ranked.length} candidates: ${ranked.map(s => s.ticker).join(', ')}`);

  const settled = await Promise.allSettled(
    ranked.map(async stock => {
      const asset = assetMap.get(stock.ticker) ?? null;
      const cs    = consensus.get(stock.ticker)!;
      return debateTicker(stock, asset, cs, intent);
    }),
  );

  const map = new Map<string, DebateResult>();
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const ticker = ranked[i].ticker;
    if (r.status === 'fulfilled') {
      map.set(ticker, r.value);
    } else {
      // Fallback so pipeline doesn't lose the candidate
      const cs = consensus.get(ticker);
      map.set(ticker, {
        ticker,
        verdict:            'include',
        final_conviction:   cs?.avg_conviction ?? 5,
        key_bull_point:     ranked[i].primaryReason,
        key_bear_point:     ranked[i].mainRisk,
        decision_rationale: 'Debate errored — defaulting to include.',
        bull_case:          ranked[i].primaryReason,
        bear_case:          ranked[i].mainRisk,
      });
    }
  }

  const excluded = [...map.values()].filter(d => d.verdict === 'exclude').map(d => d.ticker);
  const starters = [...map.values()].filter(d => d.verdict === 'starter_only').map(d => d.ticker);
  console.info(`[debate] excluded=${excluded.join(',') || 'none'} starter_only=${starters.join(',') || 'none'}`);

  return map;
}
