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
): QuantSignalEvent | null {
  if (!previous) return null;

  const delta = current.score - previous.score;
  const thresholds = thresholdsFor(current.analystKey);
  const kind = eventKind(previous, current);
  const hardBreak = kind === 'valuation_overextended' || kind === 'technical_break' || kind === 'signal_flip';
  if (!hardBreak && Math.abs(delta) < thresholds.change) return null;

  const shouldEscalate = hardBreak || Math.abs(delta) >= thresholds.escalation;
  const severity: QuantSignalEvent['severity'] =
    hardBreak && Math.abs(delta) >= thresholds.escalation ? 'critical' :
    shouldEscalate ? 'high' :
    'medium';
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    ticker: current.ticker,
    analystKey: current.analystKey,
    analystName: current.analystName,
    kind,
    previousScore: previous.score,
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
    committeeRunId: null,
    createdAt: now,
    reviewedAt: null,
  };
}
