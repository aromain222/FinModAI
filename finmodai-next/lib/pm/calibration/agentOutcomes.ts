import type { AgentView } from '@/lib/pm/types';
import { listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export type AgentOutcome = {
  id: string;
  ticker: string;
  agentViewId: string;
  agentName: string;
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  predictedConfidence: number;
  referencePrice: number;
  horizonDays: number;
  dueAt: string;
  status: 'pending' | 'settled';
  realizedPrice: number | null;
  realizedReturnPct: number | null;
  directionCorrect: boolean | null;
  brierScore: number | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
};

export type CalibrationSummary = {
  agentName: string;
  sampleSize: number;
  hitRate: number | null;
  averageBrierScore: number | null;
  confidenceMultiplier: number;
};

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function probabilityForPositiveReturn(stance: AgentOutcome['stance'], confidence: number): number {
  const p = clamp(confidence) / 100;
  if (stance === 'bullish') return p;
  if (stance === 'bearish') return 1 - p;
  return 0.5;
}

export async function scheduleAgentOutcome(params: {
  view: AgentView;
  referencePrice: number | null;
  horizonDays: number;
}): Promise<AgentOutcome | null> {
  if (!params.referencePrice || params.referencePrice <= 0) return null;
  const now = new Date().toISOString();
  const outcome: AgentOutcome = {
    id: `outcome:${params.view.id}`,
    ticker: params.view.ticker,
    agentViewId: params.view.id,
    agentName: params.view.agentName,
    stance: params.view.stance,
    predictedConfidence: params.view.conviction,
    referencePrice: params.referencePrice,
    horizonDays: params.horizonDays,
    dueAt: addDays(now, params.horizonDays),
    status: 'pending',
    realizedPrice: null,
    realizedReturnPct: null,
    directionCorrect: null,
    brierScore: null,
    createdAt: now,
    updatedAt: now,
    settledAt: null,
  };
  return upsertPMRecord('pm_agent_outcomes', outcome);
}

export async function listAgentOutcomes(params: { ticker?: string; limit?: number } = {}): Promise<AgentOutcome[]> {
  return listPMRecords<AgentOutcome>('pm_agent_outcomes', params);
}

export function summarizeCalibration(outcomes: AgentOutcome[], agentName: string): CalibrationSummary {
  const settled = outcomes.filter(item => item.agentName === agentName && item.status === 'settled' && item.directionCorrect !== null);
  if (settled.length === 0) {
    return { agentName, sampleSize: 0, hitRate: null, averageBrierScore: null, confidenceMultiplier: 1 };
  }
  const hitRate = settled.filter(item => item.directionCorrect).length / settled.length;
  const brierRows = settled.filter(item => item.brierScore !== null);
  const averageBrierScore = brierRows.length > 0
    ? brierRows.reduce((sum, item) => sum + (item.brierScore ?? 0), 0) / brierRows.length
    : null;
  const rawMultiplier = 0.75 + hitRate * 0.5;
  const sampleWeight = Math.min(1, settled.length / 20);
  const confidenceMultiplier = settled.length < 5
    ? 1
    : 1 + (rawMultiplier - 1) * sampleWeight;
  return {
    agentName,
    sampleSize: settled.length,
    hitRate: Math.round(hitRate * 1000) / 10,
    averageBrierScore: averageBrierScore === null ? null : Math.round(averageBrierScore * 1000) / 1000,
    confidenceMultiplier: Math.round(confidenceMultiplier * 1000) / 1000,
  };
}

export async function calibratedConfidence(agentName: string, rawConfidence: number): Promise<{ value: number; summary: CalibrationSummary }> {
  const outcomes = await listAgentOutcomes({ limit: 500 });
  const summary = summarizeCalibration(outcomes, agentName);
  return { value: clamp(rawConfidence * summary.confidenceMultiplier), summary };
}

export async function settleDueAgentOutcomes(params: { origin: string; now?: Date }): Promise<{ settled: number; skipped: number }> {
  const now = params.now ?? new Date();
  const pending = (await listAgentOutcomes({ limit: 500 }))
    .filter(item => item.status === 'pending' && new Date(item.dueAt).getTime() <= now.getTime());
  const tickers = [...new Set(pending.map(item => item.ticker))];
  const prices = new Map<string, number>();
  for (let index = 0; index < tickers.length; index += 50) {
    const symbols = tickers.slice(index, index + 50).join(',');
    try {
      const response = await fetch(`${params.origin}/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const payload = await response.json() as { quotes?: Array<{ ticker: string; price: number | null }> };
      for (const quote of payload.quotes ?? []) {
        if (typeof quote.price === 'number' && quote.price > 0) prices.set(quote.ticker.toUpperCase(), quote.price);
      }
    } catch { /* unavailable tickers remain pending */ }
  }

  let settled = 0;
  for (const outcome of pending) {
    const price = prices.get(outcome.ticker);
    if (!price) continue;
    const realizedReturnPct = ((price / outcome.referencePrice) - 1) * 100;
    const actualPositive = realizedReturnPct > 0 ? 1 : 0;
    const probability = probabilityForPositiveReturn(outcome.stance, outcome.predictedConfidence);
    const directionCorrect = outcome.stance === 'neutral' || outcome.stance === 'mixed'
      ? Math.abs(realizedReturnPct) < 3
      : outcome.stance === 'bullish'
        ? realizedReturnPct > 0
        : realizedReturnPct < 0;
    await patchPMRecord<AgentOutcome>('pm_agent_outcomes', outcome.id, {
      status: 'settled',
      realizedPrice: price,
      realizedReturnPct: Math.round(realizedReturnPct * 10) / 10,
      directionCorrect,
      brierScore: Math.round(((probability - actualPositive) ** 2) * 1000) / 1000,
      settledAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    settled += 1;
  }
  return { settled, skipped: pending.length - settled };
}
