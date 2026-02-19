type BuildRevenueSeriesParams = {
  revenueSeries?: unknown;
  revenueLtm?: unknown;
  years?: number;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function buildRevenueSeries({ revenueSeries, revenueLtm, years }: BuildRevenueSeriesParams): number[] {
  const series = Array.isArray(revenueSeries)
    ? revenueSeries
        .map(toFiniteNumber)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    : [];

  if (series.length > 0) return series;

  const base = toFiniteNumber(revenueLtm);
  if (typeof base === 'number' && Number.isFinite(base) && base > 0) {
    const length = typeof years === 'number' && Number.isFinite(years) && years > 0 ? Math.floor(years) : 5;
    return Array(length).fill(base);
  }

  return [];
}
