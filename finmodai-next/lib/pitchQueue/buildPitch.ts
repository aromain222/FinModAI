import type { RankedStock, Signal } from '@/lib/ranking/types';
import type { PitchQueueItem } from '@/lib/pitchQueue/types';

function signalPlain(signal: Signal | string | null): string {
  if (signal === 'green') return 'Bullish';
  if (signal === 'red') return 'Bearish';
  return 'Neutral';
}

function tradePlain(signal: Signal | string | null): string {
  if (signal === 'green') return 'Buy / work up';
  if (signal === 'red') return 'Pass / avoid unless the bear case breaks';
  return 'Wait';
}

type PitchSource = {
  ticker: string;
  score: number | null;
  signal: Signal | string | null;
  horizonWeeks: number | null;
  primaryReason: string | null;
  mainRisk: string | null;
  valuationSignal?: 'undervalued' | 'fair' | 'overvalued' | null;
};

export function buildWeeklyPitchText(source: PitchSource): string {
  const marketMiss = source.valuationSignal === 'undervalued'
    ? 'Valuation does not look fully priced in.'
    : source.valuationSignal === 'overvalued'
      ? 'The market may already be pricing too much of the upside.'
      : 'The market appears close to fair value, so catalysts matter more than valuation.';

  return [
    `${source.ticker} — Weekly Pitch`,
    `Signal: ${signalPlain(source.signal)}`,
    `Why Now: ${source.primaryReason ?? 'The near-term score is driven by forecast, catalyst, and earnings signals.'}`,
    `Market Miss: ${marketMiss}`,
    `Risk: ${source.mainRisk ?? 'Weak guidance or a failed catalyst would weaken the setup.'}`,
    `Trade: ${tradePlain(source.signal)}`,
  ].join('\n');
}

export function buildPitchQueueItem(source: PitchSource): PitchQueueItem {
  const now = Date.now();
  return {
    id: `${source.ticker}-${now}`,
    ticker: source.ticker,
    opportunityScore: source.score ?? 0,
    signal: source.signal ?? 'yellow',
    horizon: source.horizonWeeks ? `${source.horizonWeeks} weeks` : '1-3 months',
    primaryReason: source.primaryReason ?? 'No ranked reason available.',
    mainRisk: source.mainRisk ?? 'No main risk available.',
    generatedPitch: buildWeeklyPitchText(source),
    timestamp: now,
    voteStatus: 'pending',
  };
}

export function buildPitchQueueItemFromRankedStock(stock: RankedStock): PitchQueueItem {
  return buildPitchQueueItem({
    ticker: stock.ticker,
    score: stock.score,
    signal: stock.signal,
    horizonWeeks: stock.horizonWeeks,
    primaryReason: stock.primaryReason,
    mainRisk: stock.mainRisk,
    valuationSignal: stock.meta.valuation?.valuationSignal ?? null,
  });
}

