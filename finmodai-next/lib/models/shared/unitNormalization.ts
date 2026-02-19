export type UnitHint = 'millions' | 'actual' | 'auto';

type RescaleResult = {
  series: Array<number | null>;
  applied: boolean;
  ratio: number | null;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Rescale a numeric series so that its first value matches a canonical base.
 * Only applies scaling when the ratio suggests a unit mismatch (default: >1,000x).
 */
export function rescaleSeriesToCanonical(
  series: Array<number | null | undefined> | null | undefined,
  canonicalBase: number | null,
  opts?: { minRatio?: number; maxRatio?: number }
): RescaleResult {
  const safeSeries: Array<number | null> = Array.isArray(series)
    ? series.map((value) => (isFiniteNumber(value) ? value : null))
    : [];

  if (!safeSeries.length || !isFiniteNumber(canonicalBase)) {
    return { series: safeSeries, applied: false, ratio: null };
  }

  const base = safeSeries[0];
  if (!isFiniteNumber(base) || base === 0) {
    safeSeries[0] = canonicalBase;
    return { series: safeSeries, applied: false, ratio: null };
  }

  const ratio = canonicalBase / base;
  const minRatio = opts?.minRatio ?? 1e-3;
  const maxRatio = opts?.maxRatio ?? 1e3;
  const needsRescale = ratio < minRatio || ratio > maxRatio;

  const rescaled = needsRescale
    ? safeSeries.map((value) => (isFiniteNumber(value) ? value * ratio : value))
    : safeSeries.slice();

  rescaled[0] = canonicalBase;

  return { series: rescaled, applied: needsRescale, ratio };
}

/**
 * Coerce a raw monetary value into USD millions.
 * Uses unit hints and an optional reference value (already in millions).
 */
export function coerceToMillions(
  value: number | null | undefined,
  opts: { unitHint?: UnitHint; referenceMillions?: number | null } = {}
): number | null {
  if (!isFiniteNumber(value)) return null;

  const hint = opts.unitHint ?? 'auto';
  if (hint === 'millions') return value;
  if (hint === 'actual') return value / 1_000_000;

  const reference = opts.referenceMillions;
  if (isFiniteNumber(reference) && reference > 0) {
    const ratio = value / reference;
    // Already in millions if close to reference (within 10x).
    if (ratio > 0.1 && ratio < 10) return value;
    // Likely actual dollars if ~1e6x reference.
    if (ratio > 1e5 && ratio < 1e7) return value / 1_000_000;
  }

  // Fallback heuristic: treat very large values as actual dollars.
  if (Math.abs(value) >= 1e8) return value / 1_000_000;

  // Default: assume already in millions.
  return value;
}
