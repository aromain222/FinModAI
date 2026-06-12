import {
  technicalBreakScore,
  thresholdsFor,
  valuationOverextendedScore,
} from '@/lib/pm/monitoring/thresholds';
import type {
  QuantScoreSnapshot,
  QuantSignalEvent,
  QuantSignalKind,
} from '@/lib/pm/monitoring/types';

function eventKind(previous: QuantScoreSnapshot, current: QuantScoreSnapshot): QuantSignalKind {
  if (
    current.analystKey === 'valuation'
    && previous.score > valuationOverextendedScore()
    && current.score <= valuationOverextendedScore()
  ) {
    return 'valuation_overextended';
  }
  if (
    current.analystKey === 'technicals'
    && previous.score > technicalBreakScore()
    && current.score <= technicalBreakScore()
  ) {
    return 'technical_break';
  }
  if (previous.signal !== current.signal && previous.signal !== 'neutral' && current.signal !== 'neutral') {
    return 'signal_flip';
  }
  return 'score_change';
}

function eventSummary(
  kind: QuantSignalKind,
  current: QuantScoreSnapshot,
  delta: number,
): string {
  if (kind === 'valuation_overextended') {
    return `${current.ticker} valuation became overextended at ${current.score}/100.`;
  }
  if (kind === 'technical_break') {
    return `${current.ticker} technical structure broke at ${current.score}/100.`;
  }
  if (kind === 'signal_flip') {
    return `${current.ticker} ${current.analystName} flipped ${current.signal} with a ${delta >= 0 ? '+' : ''}${delta}-point move.`;
  }
  return `${current.ticker} ${current.analystName} score moved ${delta >= 0 ? '+' : ''}${delta} points to ${current.score}/100.`;
}

export function evaluateQuantSignal(
  previous: QuantScoreSnapshot | null,
  current: QuantScoreSnapshot,
  recentHistory: QuantScoreSnapshot[] = [],
): QuantSignalEvent | null {
  if (!previous) return null;

  const stabilityWindow = [current, ...recentHistory.slice(0, 3)];
  const baseline = recentHistory.length >= 3 ? recentHistory[2] : previous;
  const delta = current.score - baseline.score;
  const thresholds = thresholdsFor(current.analystKey);
  const kind = eventKind(baseline, current);
  const hardBreak = kind === 'valuation_overextended' || kind === 'technical_break' || kind === 'signal_flip';
  if (!hardBreak && Math.abs(delta) < thresholds.change) return null;

  const candidateDirection = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  const confirmations = stabilityWindow.filter(snapshot => {
    const move = snapshot.score - baseline.score;
    return Math.sign(move) === candidateDirection && Math.abs(move) >= thresholds.change;
  }).length;
  const stable = confirmations >= 3;
  const shouldEscalate = stable && (hardBreak || Math.abs(delta) >= thresholds.escalation);
  const severity: QuantSignalEvent['severity'] =
    shouldEscalate && hardBreak && Math.abs(delta) >= thresholds.escalation ? 'critical' :
    shouldEscalate ? 'high' :
    'medium';
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    ticker: current.ticker,
    analystKey: current.analystKey,
    analystName: current.analystName,
    kind,
    previousScore: baseline.score,
    currentScore: current.score,
    delta,
    threshold: thresholds.change,
    escalationThreshold: thresholds.escalation,
    severity,
    direction: delta > 0 ? 'bullish' : delta < 0 ? 'bearish' : 'neutral',
    summary: eventSummary(kind, current, delta),
    reasoning: current.reasoning,
    status: shouldEscalate ? 'escalated' : 'open',
    shouldEscalate,
    stability: {
      required: 3,
      window: 4,
      confirmations,
    },
    committeeRunId: null,
    createdAt: now,
    reviewedAt: null,
  };
}
