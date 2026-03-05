export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function normalizePathFromRows(
  years: number,
  fallback: number,
  rows: Array<{ year: number; value: number }> | undefined,
): number[] {
  if (!rows || rows.length === 0) {
    return Array.from({ length: years }, () => fallback);
  }

  const byYear = new Map<number, number>();
  rows.forEach((row) => byYear.set(row.year, row.value));

  const result: number[] = [];
  let last = fallback;
  for (let year = 1; year <= years; year += 1) {
    const next = byYear.get(year);
    if (typeof next === 'number') {
      last = next;
      result.push(next);
    } else {
      result.push(last);
    }
  }
  return result;
}

export function toYearColumns(startYear: number, years: number): number[] {
  return Array.from({ length: years }, (_, idx) => startYear + idx + 1);
}
