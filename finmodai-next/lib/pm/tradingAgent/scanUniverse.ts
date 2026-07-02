import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { WATCHLIST } from '@/lib/ranking/watchlist';
import type { RankedStock } from '@/lib/ranking/types';
import {
  analyzeTicker,
  persistConsensusDecision,
  recordSubmissionMemory,
  runExecutionStage,
  tradingAgentDefaultNotional,
} from '@/lib/pm/tradingAgent/runTradingAgent';
import { resolvePersonality, type TradingPersonality } from '@/lib/pm/tradingAgent/personality';
import { getPortfolioEquity, sizePosition } from '@/lib/pm/tradingAgent/sizing';
import { reviewTrackRecord, type AgentTrackRecord } from '@/lib/pm/tradingAgent/learning';
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
const ANALYSIS_CONCURRENCY = 2;
/** Absolute floor: weak conviction never becomes an investment, whatever the personality. */
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

/** Held names the loop must keep re-examining so it can trim/exit, not just buy. */
const MAX_HELD_CANDIDATES = 2;

async function heldCandidates(): Promise<ScanCandidate[]> {
  try {
    const positions = await listPositions({ limit: 100 });
    return positions
      .filter(position => position.status === 'active')
      .slice(0, MAX_HELD_CANDIDATES)
      .map(position => plainCandidate(position.ticker, 'positions'));
  } catch {
    return [];
  }
}

function dedupeByTicker(candidates: ScanCandidate[]): ScanCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.ticker)) return false;
    seen.add(candidate.ticker);
    return true;
  });
}

/**
 * Source scan candidates without any user-provided ticker. Preference order:
 * caller-provided universe → held positions (the book must be managed, not
 * just added to) followed by the CapitalBase ranked board (already scored for
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
    dedupeByTicker(candidates)
      .filter(candidate => !openDecisionTickers.has(candidate.ticker))
      .slice(0, params.maxCandidates);

  if (params.universe && params.universe.length > 0) {
    return {
      candidates: take(params.universe.map(ticker => plainCandidate(ticker, 'provided'))),
      universeSource: 'provided',
    };
  }

  const held = await heldCandidates();

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
        candidates: take([...held, ...stocks.map(candidateFromRankedStock)]),
        universeSource: 'rank',
      };
    }
  } catch {
    // Ranked board unavailable — fall through to the static watchlist.
  }

  return {
    candidates: take([...held, ...WATCHLIST.map(ticker => plainCandidate(ticker, 'watchlist'))]),
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

function isInvestable(analysis: Pick<TickerAnalysis, 'consensus'>, minConfidence: number): boolean {
  return (
    analysis.consensus.stance === 'bullish' &&
    (analysis.consensus.action === 'buy' || analysis.consensus.action === 'add') &&
    analysis.consensus.confidence >= Math.max(MIN_PICK_CONFIDENCE, minConfidence)
  );
}

/** Order investable analyses by selection score; the top maxPicks win. */
export function selectPicks<T extends Pick<TickerAnalysis, 'candidate' | 'consensus'>>(
  analyses: T[],
  maxPicks: number,
  minConfidence: number = MIN_PICK_CONFIDENCE,
): Array<{ analysis: T; selectionScore: number; selectionReason: string }> {
  return analyses
    .filter(analysis => isInvestable(analysis, minConfidence))
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

/**
 * Defensive side of the loop: held names where the agents turned bearish get
 * trimmed/exited. Sells are only ever against existing positions — the scan
 * can never open a short.
 */
export function selectBookActions<T extends Pick<TickerAnalysis, 'candidate' | 'consensus' | 'context'>>(
  analyses: T[],
): Array<{ analysis: T; selectionScore: number; selectionReason: string }> {
  return analyses
    .filter(analysis =>
      analysis.context.holdsPosition &&
      analysis.consensus.stance === 'bearish' &&
      (analysis.consensus.action === 'trim' || analysis.consensus.action === 'exit'),
    )
    .map(analysis => ({
      analysis,
      selectionScore: selectionScore(analysis),
      selectionReason: `${analysis.consensus.agreement} bearish consensus at ${analysis.consensus.confidence}/100 on a held position — reducing exposure`,
    }));
}

/** A trim sells a quarter of current exposure (min $25), never more than held. */
export function trimNotional(exposureUsd: number | null, fallback: number): number {
  if (exposureUsd == null || exposureUsd <= 0) return fallback;
  return Math.max(25, Math.min(Math.round(exposureUsd * 0.25), Math.round(exposureUsd)));
}

/** Run-level narrative: universe, per-name verdicts, and why the picks won. */
export function buildScanStory(
  universeSource: CandidateSource,
  scanned: TickerAnalysis[],
  picks: Array<{ ticker: string; selectionScore: number; selectionReason: string }>,
  flavor?: {
    personality?: TradingPersonality;
    trackRecord?: AgentTrackRecord;
    bookActions?: Array<{ ticker: string }>;
  },
): string {
  const sourceLabel =
    universeSource === 'rank' ? 'the CapitalBase ranked opportunity board'
    : universeSource === 'provided' ? 'the caller-provided universe'
    : 'the fallback watchlist';

  const lines: string[] = [];
  if (flavor?.personality) {
    lines.push(`${flavor.personality.name} on the desk. ${flavor.personality.voice}`);
  }
  if (flavor?.trackRecord) {
    lines.push(flavor.trackRecord.summary);
    for (const lesson of flavor.trackRecord.lessons) lines.push(`Journal: ${lesson}`);
  }
  lines.push(
    `Scanned ${scanned.length} candidate(s) from ${sourceLabel}: ${scanned.map(s => s.candidate.ticker).join(', ')}. Each was debated by the TradingAgents research desk and the Senior Investment Committee before any selection.`,
  );

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

  if (flavor?.bookActions && flavor.bookActions.length > 0) {
    lines.push(`Book defense: reducing ${flavor.bookActions.map(a => a.ticker).join(', ')} on bearish agent consensus.`);
  }

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
  const personality = resolvePersonality(input.personality);
  const maxCandidates = Math.max(1, Math.min(MAX_CANDIDATES_CAP, input.maxCandidates ?? DEFAULT_MAX_CANDIDATES));
  const maxPicks = Math.max(1, Math.min(3, input.maxPicks ?? personality.defaultMaxPicks));

  const [{ candidates, universeSource }, trackRecord, equity] = await Promise.all([
    sourceCandidates({
      origin: input.origin,
      requestHeaders: input.requestHeaders,
      universe: input.universe,
      maxCandidates,
    }),
    reviewTrackRecord(),
    getPortfolioEquity(),
  ]);

  const scanned = await analyzeWithConcurrency(candidates, input);
  // Training feedback: an underwater book raises the personality's pick floor.
  const pickFloor = personality.minPickConfidence + trackRecord.disciplineAdjustment;
  const selected = selectPicks(scanned, maxPicks, pickFloor);

  const picks: TradingAgentPick[] = [];
  for (const { analysis, selectionScore: score, selectionReason } of selected) {
    const ticker = analysis.candidate.ticker;

    // The agent assigns its own slice of the portfolio unless the caller
    // pinned an explicit per-order notional.
    const sizing = sizePosition({
      equity: equity.equity,
      consensus: analysis.consensus,
      personality,
      valuationSignal: analysis.candidate.valuation?.signal ?? null,
      currentExposureUsd: analysis.context.notionalExposure,
    });
    const notional = input.notional ?? sizing.notional;

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
      notional,
      personality,
      disciplineAdjustment: trackRecord.disciplineAdjustment,
    });
    if (execution.status === 'submitted') {
      await recordSubmissionMemory(ticker, analysis.consensus);
    }

    picks.push({
      ticker,
      selectionScore: score,
      selectionReason: input.notional != null
        ? `${selectionReason}; caller pinned $${input.notional} per order`
        : `${selectionReason}; ${sizing.reasoning}`,
      consensus: analysis.consensus,
      sizing,
      decision: execution.status === 'submitted' ? execution.result.decision : decision,
      execution,
    });
  }

  // Defensive side: trim/exit held names the agents turned bearish on.
  const bookActions: TradingAgentPick[] = [];
  for (const { analysis, selectionScore: score, selectionReason } of selectBookActions(scanned)) {
    const ticker = analysis.candidate.ticker;
    const exposure = analysis.context.notionalExposure;
    const notional = input.notional ?? trimNotional(exposure, tradingAgentDefaultNotional());
    const sizing = {
      allocationPct: exposure != null && equity.equity > 0
        ? Math.round((notional / equity.equity) * 10_000) / 100
        : 0,
      notional,
      reasoning: exposure != null
        ? `Trimming 25% of the $${Math.round(exposure).toLocaleString()} position on bearish consensus.`
        : `Trimming at the default $${notional} clip; live exposure unavailable.`,
    };

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
      notional,
      personality,
      disciplineAdjustment: trackRecord.disciplineAdjustment,
    });
    if (execution.status === 'submitted') {
      await recordSubmissionMemory(ticker, analysis.consensus);
    }

    bookActions.push({
      ticker,
      selectionScore: score,
      selectionReason,
      consensus: analysis.consensus,
      sizing,
      decision: execution.status === 'submitted' ? execution.result.decision : decision,
      execution,
    });
  }

  return {
    mode: 'scan',
    ranAt,
    universeSource,
    personality: { key: personality.key, name: personality.name, voice: personality.voice },
    trackRecord: {
      summary: trackRecord.summary,
      disciplineAdjustment: trackRecord.disciplineAdjustment,
      lessons: trackRecord.lessons,
    },
    equity,
    scanned,
    picks,
    bookActions,
    story: buildScanStory(universeSource, scanned, picks, { personality, trackRecord, bookActions }),
  };
}
