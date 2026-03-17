export type FinanceStructuredPoint = {
  x: string | number;
  y: number | null;
};

export type FinanceStructuredChartType = 'line' | 'bar';

const TIME_LIKE_PATTERNS = [
  /^\d{4}$/,
  /^\d{4}-\d{2}(-\d{2})?$/,
  /^[A-Z][a-z]{2}\s+\d{1,2}$/,
  /^[A-Z][a-z]{2}\s+\d{4}$/,
  /^Q[1-4]\s+\d{4}$/i,
  /^\d{4}\s+Q[1-4]$/i,
];

function isAscending(values: number[]): boolean {
  for (let idx = 1; idx < values.length; idx += 1) {
    if (values[idx] <= values[idx - 1]) return false;
  }
  return true;
}

function isTimeLikeLabel(value: string | number): boolean {
  if (typeof value === 'number') return true;
  const text = value.trim();
  if (!text) return false;
  if (TIME_LIKE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed);
}

export function selectFinanceChartType(data: FinanceStructuredPoint[]): FinanceStructuredChartType {
  const points = data.filter((point) => point.y !== null && Number.isFinite(point.y));
  if (points.length < 2) return 'bar';

  const allTimeLike = points.every((point) => isTimeLikeLabel(point.x));
  if (allTimeLike) {
    const numericLabels = points
      .map((point) => {
        if (typeof point.x === 'number') return point.x;
        const trimmed = point.x.trim();
        if (/^\d{4}$/.test(trimmed)) return Number(trimmed);
        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((value): value is number => value !== null);
    if (numericLabels.length === points.length && isAscending(numericLabels)) {
      return 'line';
    }
    return 'line';
  }

  return 'bar';
}
