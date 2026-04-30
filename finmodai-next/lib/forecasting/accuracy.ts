import type { ForecastRecord } from '@/lib/forecasting/history';

export type DirectionalAccuracy = {
  accuracy: number;
  sampleSize: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeDirectionalAccuracy(records: ForecastRecord[]): DirectionalAccuracy {
  const resolved = records.filter((record) => record.actualDirection === 'up' || record.actualDirection === 'down');
  const sampleSize = resolved.length;

  if (sampleSize < 5) {
    return {
      accuracy: 0.5,
      sampleSize,
    };
  }

  const correct = resolved.filter((record) => record.predictedDirection === record.actualDirection).length;
  return {
    accuracy: Number(clamp(correct / sampleSize, 0, 1).toFixed(2)),
    sampleSize,
  };
}
