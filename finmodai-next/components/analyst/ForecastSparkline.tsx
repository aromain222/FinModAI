'use client';

type ForecastSparklineProps = {
  forecast: number[];
  historical?: number[];
};

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

function sanitizeSeries(values: number[] | undefined): number[] {
  const finiteValues = (values ?? []).filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return [];

  const center = median(finiteValues);
  const distances = finiteValues.map((value) => Math.abs(value - center));
  const medianDistance = median(distances);
  const band = Math.max(Math.abs(center) * 2, medianDistance * 8, 1);
  const min = center - band;
  const max = center + band;

  return finiteValues.map((value) => clamp(value, min, max));
}

function buildPoints(values: number[], min: number, max: number, startX: number, endX: number): Point[] {
  if (values.length === 0) return [];
  const range = Math.max(max - min, 1);
  const width = endX - startX;
  return values.map((value, index) => {
    const x = values.length === 1 ? startX + width / 2 : startX + (index / (values.length - 1)) * width;
    const y = 68 - ((value - min) / range) * 56;
    return { x, y };
  });
}

function linePath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlDistance = (current.x - previous.x) / 2;
    path += ` C ${previous.x + controlDistance} ${previous.y}, ${current.x - controlDistance} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export function ForecastSparkline({ forecast, historical }: ForecastSparklineProps) {
  const cleanForecast = sanitizeSeries(forecast);
  const cleanHistorical = sanitizeSeries(historical);

  if (cleanForecast.length <= 1) return null;

  const allValues = [...cleanHistorical, ...cleanForecast];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const hasHistorical = cleanHistorical.length > 1;
  const historicalPoints = hasHistorical ? buildPoints(cleanHistorical, min, max, 2, 48) : [];
  const forecastPoints = buildPoints(cleanForecast, min, max, hasHistorical ? 50 : 2, 98);

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
        Forecast Path
      </div>
      <svg viewBox="0 0 100 80" role="img" aria-label="Forecast trend sparkline" className="h-20 w-full overflow-visible">
        <line x1="2" y1="68" x2="98" y2="68" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="2" y1="40" x2="98" y2="40" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="2" y1="12" x2="98" y2="12" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        {hasHistorical ? (
          <path
            d={linePath(historicalPoints)}
            fill="none"
            stroke="rgba(161,161,170,0.72)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        ) : null}
        <path
          d={linePath(forecastPoints)}
          fill="none"
          stroke="rgb(52,211,153)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}
