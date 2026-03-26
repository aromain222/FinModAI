type FootballFieldRange = {
  label: string;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
};

type FootballFieldRangeChartProps = {
  ranges: FootballFieldRange[];
  currentPrice?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMoney(value: number | null): string {
  if (!isFiniteNumber(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function FootballFieldRangeChart({
  ranges,
  currentPrice = null,
}: FootballFieldRangeChartProps) {
  const populatedRanges = ranges.filter(
    (range) =>
      isFiniteNumber(range.lowPrice) &&
      isFiniteNumber(range.midPrice) &&
      isFiniteNumber(range.highPrice) &&
      range.highPrice >= range.lowPrice
  );

  const values = populatedRanges.flatMap((range) => [range.lowPrice, range.midPrice, range.highPrice]);
  if (isFiniteNumber(currentPrice)) values.push(currentPrice);

  if (populatedRanges.length === 0 || values.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Football Field Chart</h3>
        <p className="text-sm text-[var(--cb-text-secondary)]">
          Not enough populated price ranges to render a football field chart yet.
        </p>
      </div>
    );
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;
  const toPercent = (value: number) => ((value - minValue) / span) * 100;

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Football Field Chart</h3>
          <p className="text-xs text-[var(--cb-text-secondary)]">
            Horizontal valuation ranges with midpoint markers and the current price anchor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--cb-text-secondary)]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--cb-accent)]" />
            Midpoint
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-px bg-amber-500" />
            Current price
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-[140px_minmax(0,1fr)_120px] gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
        <span>Method</span>
        <span>Range</span>
        <span className="text-right">Low / Mid / High</span>
      </div>

      <div className="space-y-3">
        {populatedRanges.map((range) => {
          const low = range.lowPrice as number;
          const mid = range.midPrice as number;
          const high = range.highPrice as number;
          const lowPct = toPercent(low);
          const highPct = toPercent(high);
          const midPct = toPercent(mid);
          const currentPct = isFiniteNumber(currentPrice) ? toPercent(currentPrice) : null;

          return (
            <div key={range.label} className="grid grid-cols-[140px_minmax(0,1fr)_120px] items-center gap-3">
              <div className="text-sm font-medium text-[var(--cb-text-primary)]">{range.label}</div>
              <div className="relative h-8 rounded-lg bg-[var(--cb-surface)]">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--cb-border-subtle)]" />
                {currentPct !== null ? (
                  <div
                    className="absolute top-0 bottom-0 z-10 w-px bg-amber-500/90"
                    style={{ left: `${currentPct}%` }}
                  />
                ) : null}
                <div
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-[var(--cb-accent)]/25"
                  style={{ left: `${lowPct}%`, width: `${Math.max(highPct - lowPct, 1)}%` }}
                />
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--cb-surface)] bg-[var(--cb-accent)] shadow-sm"
                  style={{ left: `${midPct}%` }}
                />
              </div>
              <div className="text-right font-mono text-xs text-[var(--cb-text-primary)]">
                {formatMoney(low)} / {formatMoney(mid)} / {formatMoney(high)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--cb-text-secondary)]">
        <span>{formatMoney(minValue)}</span>
        <span>{isFiniteNumber(currentPrice) ? `Current: ${formatMoney(currentPrice)}` : 'Current price not provided'}</span>
        <span>{formatMoney(maxValue)}</span>
      </div>
    </div>
  );
}
