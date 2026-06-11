import { saveAlert } from '@/lib/pm/alerts/alertStore';
import { runInvestmentCommittee } from '@/lib/pm/monitoring/committee';
import { evaluateQuantSignal } from '@/lib/pm/monitoring/evaluateSignal';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import {
  latestQuantScore,
  saveQuantScoreSnapshot,
  saveQuantSignalEvent,
} from '@/lib/pm/monitoring/store';
import type {
  HedgeFundMonitoringResult,
  QuantMonitoringRun,
  QuantScoreSnapshot,
  QuantSignalEvent,
} from '@/lib/pm/monitoring/types';
import { QUANT_ANALYST_KEYS } from '@/lib/pm/monitoring/types';

function isMonitoringResult(value: unknown): value is HedgeFundMonitoringResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<HedgeFundMonitoringResult>;
  return result.mode === 'monitoring' && result.decision === null && Array.isArray(result.signals);
}

function toSnapshot(
  ticker: string,
  signal: HedgeFundMonitoringResult['signals'][number],
  observedAt: string,
): QuantScoreSnapshot {
  return {
    id: crypto.randomUUID(),
    ticker,
    analystKey: signal.key,
    analystName: signal.name,
    score: Math.max(0, Math.min(100, Math.round(signal.score))),
    signal: signal.signal,
    confidence: Math.max(0, Math.min(100, Math.round(signal.confidence))),
    reasoning: signal.reasoning,
    watch: signal.watch,
    source: 'hedge_fund_monitoring',
    observedAt,
    createdAt: observedAt,
  };
}

async function persistSignalAlert(event: QuantSignalEvent): Promise<void> {
  await saveAlert({
    id: crypto.randomUUID(),
    ticker: event.ticker,
    alertType: 'score_change',
    severity: event.severity,
    title: event.summary,
    summary: event.reasoning,
    impactDirection: event.direction,
    suggestedAction: event.shouldEscalate ? 'review' : 'watch',
    confidence: Math.min(100, Math.max(50, Math.round(Math.abs(event.delta) * 3))),
    affectedTheme: event.analystKey,
    affectedThesis: null,
    shouldNotifyPM: event.shouldEscalate,
    evidence: [{
      source: event.analystName,
      title: event.kind.replace(/_/g, ' '),
      summary: `${event.previousScore}/100 -> ${event.currentScore}/100`,
      impactDirection: event.direction,
    }],
    createdAt: event.createdAt,
    resolvedAt: null,
  });
}

export async function runQuantMonitoring(params: {
  ticker: string;
  origin: string;
  autoEscalate?: boolean;
  requestHeaders?: Headers;
}): Promise<QuantMonitoringRun> {
  const ticker = params.ticker.toUpperCase();
  const response = await fetch(`${params.origin}/api/hedge-fund`, {
    method: 'POST',
    headers: internalRequestHeaders(params.requestHeaders),
    body: JSON.stringify({ ticker, mode: 'monitoring' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    throw new Error(`Quant monitoring failed for ${ticker} (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json() as unknown;
  if (!isMonitoringResult(payload)) {
    throw new Error(`Quant monitoring returned an invalid contract for ${ticker}.`);
  }

  const observedAt = new Date().toISOString();
  const signals = payload.signals.filter(signal => QUANT_ANALYST_KEYS.includes(signal.key));
  if (signals.length !== QUANT_ANALYST_KEYS.length) {
    throw new Error(`Quant monitoring returned ${signals.length}/${QUANT_ANALYST_KEYS.length} scout scores for ${ticker}.`);
  }

  const snapshots: QuantScoreSnapshot[] = [];
  const events: QuantSignalEvent[] = [];
  for (const signal of signals) {
    const previous = await latestQuantScore(ticker, signal.key);
    const snapshot = await saveQuantScoreSnapshot(toSnapshot(ticker, signal, observedAt));
    snapshots.push(snapshot);
    const event = evaluateQuantSignal(previous, snapshot);
    if (!event) continue;
    const saved = await saveQuantSignalEvent(event);
    events.push(saved);
    await persistSignalAlert(saved);
  }

  const escalatedEvents = events.filter(event => event.shouldEscalate);
  const committee = params.autoEscalate !== false && escalatedEvents.length > 0
    ? await runInvestmentCommittee({
        ticker,
        trigger: 'signal_event',
        origin: params.origin,
        signalEvents: escalatedEvents,
        requestHeaders: params.requestHeaders,
      })
    : null;

  return {
    ticker,
    snapshots,
    events,
    escalatedEvents,
    committeeRunId: committee?.id ?? null,
  };
}
