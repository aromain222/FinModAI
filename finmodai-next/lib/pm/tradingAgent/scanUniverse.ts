import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import { WATCHLIST } from '@/lib/ranking/watchlist';
import type { RankedStock } from '@/lib/ranking/types';
import {
  analyzeTicker,
  persistConsensusDecision,
  recordSubmissionMemory,
  runExecutionStage,
  tradingAgentDefaultNotional,
} from '@/lib/pm/tradingAgent/runTradingAgent';
import type {
  CandidateSource,
  ScanCandidate,
  TickerAnalysis,
  TradingAgentPick,
  TradingAgentScanInput,
  TradingAgentScanRun,
} from '@/lib/pm/tradingAgent/types';

const DEFAULT_MAX_CANDIDATES = 4;
const MAX_CANDIDATES_CAP = 8;
const DEFAULT_MAX_PICKS = 2;
const ANALYSIS_CONCURRENCY = 2;
/** Weak conviction never becomes an investment, even if it tops the scan. */
const MIN_PICK_CONFIDENCE = 55;

function candidateFromRankedStock(stock: RankedStock): ScanCandidate {
  const valuation = stock.meta.valuation;
  return {
    ticker: stock.ticker.toUpperCase(),
    source: 'rank',
    rankScore: stock.score,
    primaryReason: stock.primaryReason || null,
    valuation: valuation
      ? {
          signal: valuation.valuationSignal,
          impliedUpside: valuation.impliedUpside,
          summary: valuation.summary,
        }
      : null,
  };
}

function plainCandidate(ticker: string, source: CandidateSource): ScanCandidate {
  return { ticker: ticker.toUpperCase(), source, rankScore: null, primaryReason: null, valuation: null };
}

async function tickersWithOpenDecisions(): Promise<Set<string>> {
  try {
    const decisions = await listDecisions({ limit: 200 });
    return new Set(
      decisions
        .filter(decision => decision.approvalStatus === 'pending' && !decision.executedAt)
        .map(decision => decision.ticker.toUpperCase()),
    );
  } catch {
    return new Set();
  }
}

/**
 * Source scan candidates without any user-provided ticker. Preference order:
 * caller-provided universe → the CapitalBase ranked board (already scored for
 * opportunity + valuation) → the static watchlist. Names that already have an
 * open pending decision are skipped so the agent doesn't restate itself.
 */
export async function sourceCandidates(params: {
  origin: string;
  requestHeaders?: Headers;
  universe?: string[];
  maxCandidates: number;
}): Promise<{ candidates: ScanCandidate[]; universeSource: CandidateSource }> {
  const openDecisionTickers = await tickersWithOpenDecisions();
  const take = (candidates: ScanCandidate[]): ScanCandidate[] =>
    candidates
      .filter(candidate => !openDecisionTickers.has(candidate.ticker))
      .slice(0, params.maxCandidates);

  if (params.universe && params.universe.length > 0) {
    return {
      candidates: take(params.universe.map(ticker => plainCandidate(ticker, 'provided'))),
      universeSource: 'provided',
    };
  }

  try {
    const response = await fetch(
      `${params.origin}/api/rank?limit=${Math.max(params.maxCandidates * 3, 12)}`,
      {
        headers: internalRequestHeaders(params.requestHeaders),
        cache: 'no-store',
        signal: AbortSignal.timeout(50_000),
      },
    );
    if (!response.ok) throw new Error(`rank responded ${response.status}`);
    const payload = await response.json() as { stocks?: RankedStock[] };
    const stocks = (payload.stocks ?? []).filter(stock => stock && stock.ticker);
    if (stocks.length > 0) {
      return {
        candidates: take(stocks.map(candidateFromRankedStock)),
        universeSource: 'rank',
      };
    }
  } catch {
    // Ranked board unavailable — fall through to the static watchlist.
  }

  return {
    candidates: take(WATCHLIST.map(ticker => plainCandidate(ticker, 'watchlist'))),
    universeSource: 'watchlist',
  };
}

function valuationLine(candidate: ScanCandidate): string | null {
  if (!candidate.valuation) return null;
  const upside = candidate.valuation.impliedUpside != null
    ? ` (implied ${candidate.valuation.impliedUpside > 0 ? 'upside' : 'downside'} ${Math.abs(candidate.valuation.impliedUpside).toFixed(1)}%)`
    : '';
  return `Valuation signal: ${candidate.valuation.signal}${upside}. ${candidate.valuation.summary}`;
}

/** Narrative for one scanned ticker: ranking context → agent reads → consensus. */
export function buildTickerStory(analysis: Omit<TickerAnalysis, 'story'>): string {
  const { candidate, consultations, consensus } = analysis;
  const parts: string[] = [];

  if (candidate.rankScore != null) {
    parts.push(`${candidate.ticker} entered the scan from the ranked board at ${candidate.rankScore}/10${candidate.primaryReason ? `: ${candidate.primaryReason}` : '.'}`);
  }
  const valuation = valuationLine(candidate);
  if (valuation) parts.push(valuation);

  for (const consultation of consultations) {
    parts.push(consultation.ok
      ? `${consultation.agentName} (${consultation.stance}, ${consultation.confidence}/100): ${consultation.summary}`
      : `${consultation.agentName} did not respond (${consultation.error ?? 'unknown error'}).`);
  }

  parts.push(`Consensus: ${consensus.action.toUpperCase()} — ${consensus.rationale}`);
  return parts.join('\n');
}

/**
 * Composite selection score. Agent consensus dominates; the ranked board's
 * opportunity score and the valuation signal break ties — an undervalued read
 * strengthens a pick, an overvalued one drags it down.
 */
export function selectionScore(analysis: Pick<TickerAnalysis, 'candidate' | 'consensus'>): number {
  const { candidate, consensus } = analysis;
  let score = consensus.confidence;
  if (consensus.agreement === 'unanimous') score += 10;
  if (candidate.valuation?.signal === 'undervalued') score += 6;
  if (candidate.valuation?.signal === 'overvalued') score -= 12;
  if (candidate.rankScore != null) score += (candidate.rankScore - 5) * 2;
  return Math.round(score * 10) / 10;
}

function isInvestable(analysis: Pick<TickerAnalysis, 'consensus'>): boolean {
  return (
    analysis.consensus.stance === 'bullish' &&
    (analysis.consensus.action === 'buy' || analysis.consensus.action === 'add') &&
    analysis.consensus.confidence >= MIN_PICK_CONFIDENCE
  );
}

/** Order investable analyses by selection score; the top maxPicks win. */
export function selectPicks<T extends Pick<TickerAnalysis, 'candidate' | 'consensus'>>(
  analyses: T[],
  maxPicks: number,
): Array<{ analysis: T; selectionScore: number; selectionReason: string }> {
  return analyses
    .filter(isInvestable)
    .map(analysis => ({
      analysis,
      selectionScore: selectionScore(analysis),
      selectionReason: [
        `${analysis.consensus.agreement} bullish consensus at ${analysis.consensus.confidence}/100`,
        analysis.candidate.valuation ? `valuation ${analysis.candidate.valuation.signal}` : null,
        analysis.candidate.rankScore != null ? `ranked board score ${analysis.candidate.rankScore}/10` : null,
      ].filter(Boolean).join('; '),
    }))
    .sort((a, b) => b.selectionScore - a.selectionScore)
    .slice(0, Math.max(1, maxPicks));
}

/** Run-level narrative: universe, per-name verdicts, and why the picks won. */
export function buildScanStory(
  universeSource: CandidateSource,
  scanned: TickerAnalysis[],
  picks: Array<{ ticker: string; selectionScore: number; selectionReason: string }>,
): string {
  const sourceLabel =
    universeSource === 'rank' ? 'the CapitalBase ranked opportunity board'
    : universeSource === 'provided' ? 'the caller-provided universe'
    : 'the fallback watchlist';

  const lines: string[] = [
    `Scanned ${scanned.length} candidate(s) from ${sourceLabel}: ${scanned.map(s => s.candidate.ticker).join(', ')}. Each was debated by the TradingAgents research desk and the Senior Investment Committee before any selection.`,
  ];

  for (const analysis of scanned) {
    const pick = picks.find(p => p.ticker === analysis.candidate.ticker);
    const verdict = pick
      ? `SELECTED (${pick.selectionScore}): ${pick.selectionReason}`
      : `passed over — ${analysis.consensus.agreement} ${analysis.consensus.stance} at ${analysis.consensus.confidence}/100, action ${analysis.consensus.action}`;
    lines.push(`${analysis.candidate.ticker}: ${verdict}`);
  }

  lines.push(picks.length > 0
    ? `The agent chose ${picks.map(p => p.ticker).join(', ')} to invest in; pending decisions were persisted for PM review.`
    : 'No candidate cleared the investment bar — nothing was selected this run.');

  return lines.join('\n');
}

async function analyzeWithConcurrency(
  candidates: ScanCandidate[],
  input: TradingAgentScanInput,
): Promise<TickerAnalysis[]> {
  const results: TickerAnalysis[] = [];
  for (let i = 0; i < candidates.length; i += ANALYSIS_CONCURRENCY) {
    const batch = candidates.slice(i, i + ANALYSIS_CONCURRENCY);
    const analyses = await Promise.all(batch.map(async candidate => {
      const analysis = await analyzeTicker({
        ticker: candidate.ticker,
        origin: input.origin,
        requestHeaders: input.requestHeaders,
        themes: input.themes,
      });
      const withoutStory = { candidate, ...analysis };
      return { ...withoutStory, story: buildTickerStory(withoutStory) };
    }));
    results.push(...analyses);
  }
  return results;
}

/**
 * Autonomous mode: the trading agent sources its own universe, consults the
 * resident agents on every candidate, and chooses which names to invest in.
 * Decisions are persisted only for the selected picks; execution keeps every
 * gate from single-ticker mode (paper-only, unanimous + confident + enabled).
 */
export async function runTradingAgentScan(input: TradingAgentScanInput): Promise<TradingAgentScanRun> {
  const ranAt = new Date().toISOString();
  const maxCandidates = Math.max(1, Math.min(MAX_CANDIDATES_CAP, input.maxCandidates ?? DEFAULT_MAX_CANDIDATES));
  const maxPicks = Math.max(1, Math.min(3, input.maxPicks ?? DEFAULT_MAX_PICKS));

  const { candidates, universeSource } = await sourceCandidates({
    origin: input.origin,
    requestHeaders: input.requestHeaders,
    universe: input.universe,
    maxCandidates,
  });

  const scanned = await analyzeWithConcurrency(candidates, input);
  const selected = selectPicks(scanned, maxPicks);

  const picks: TradingAgentPick[] = [];
  for (const { analysis, selectionScore: score, selectionReason } of selected) {
    const ticker = analysis.candidate.ticker;
    const decision = await persistConsensusDecision({
      ticker,
      consensus: analysis.consensus,
      consultations: analysis.consultations,
      scoreSummary: analysis.context.quantScoreSummary,
      positionId: analysis.positionId,
    });

    const execution = await runExecutionStage({
      decision,
      consensus: analysis.consensus,
      execute: Boolean(input.execute),
      notional: input.notional ?? tradingAgentDefaultNotional(),
    });
    if (execution.status === 'submitted') {
      await recordSubmissionMemory(ticker, analysis.consensus);
    }

    picks.push({
      ticker,
      selectionScore: score,
      selectionReason,
      consensus: analysis.consensus,
      decision: execution.status === 'submitted' ? execution.result.decision : decision,
      execution,
    });
  }

  return {
    mode: 'scan',
    ranAt,
    universeSource,
    scanned,
    picks,
    story: buildScanStory(universeSource, scanned, picks),
  };
}
