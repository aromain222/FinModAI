"use client";

import { useEffect, useMemo, useState } from 'react';
import { FootballFieldRangeChart } from '@/components/models/FootballFieldRangeChart';

type FootballFieldRangeInput = {
  label: string;
  basis?: string | null;
  commentary?: string | null;
  lowValue: number | null;
  midValue: number | null;
  highValue: number | null;
};

type FootballFieldReviewCardProps = {
  ranges: FootballFieldRangeInput[];
  currentPrice?: number | null;
  netDebt?: number | null;
  sharesOutstanding?: number | null;
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

function formatPercent(value: number | null): string {
  if (!isFiniteNumber(value)) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function toPrice(
  enterpriseValue: number | null,
  netDebt: number | null | undefined,
  sharesOutstanding: number | null | undefined
): number | null {
  if (!isFiniteNumber(enterpriseValue)) return null;
  if (!isFiniteNumber(sharesOutstanding) || sharesOutstanding <= 0) return null;
  const debt = isFiniteNumber(netDebt) ? netDebt : 0;
  return (enterpriseValue - debt) / sharesOutstanding;
}

export function FootballFieldReviewCard({
  ranges,
  currentPrice = null,
  netDebt = null,
  sharesOutstanding = null,
}: FootballFieldReviewCardProps) {
  const rangeIds = useMemo(() => ranges.map((range) => range.label), [ranges]);
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(rangeIds.map((id) => [id, 100]))
  );
  const [selectedLabel, setSelectedLabel] = useState<string | null>(rangeIds[0] ?? null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  useEffect(() => {
    setWeights(Object.fromEntries(rangeIds.map((id) => [id, 100])));
    setSelectedLabel(rangeIds[0] ?? null);
    setHoveredLabel(null);
  }, [rangeIds]);

  const priceRanges = useMemo(
    () =>
      ranges.map((range) => ({
        label: range.label,
        basis: range.basis ?? null,
        commentary: range.commentary ?? null,
        lowPrice: toPrice(range.lowValue, netDebt, sharesOutstanding),
        midPrice: toPrice(range.midValue, netDebt, sharesOutstanding),
        highPrice: toPrice(range.highValue, netDebt, sharesOutstanding),
      })),
    [netDebt, ranges, sharesOutstanding]
  );

  const weightedMidpoint = useMemo(() => {
    let numerator = 0;
    let denominator = 0;
    for (const range of priceRanges) {
      const weight = weights[range.label] ?? 0;
      if (weight <= 0 || !isFiniteNumber(range.midPrice)) continue;
      numerator += range.midPrice * weight;
      denominator += weight;
    }
    return denominator > 0 ? numerator / denominator : null;
  }, [priceRanges, weights]);

  const activeLabel = hoveredLabel ?? selectedLabel;
  const selectedRange =
    priceRanges.find((range) => range.label === activeLabel) ??
    priceRanges[0] ??
    null;
  const selectedSpread =
    selectedRange &&
    isFiniteNumber(selectedRange.lowPrice) &&
    isFiniteNumber(selectedRange.highPrice)
      ? selectedRange.highPrice - selectedRange.lowPrice
      : null;
  const selectedSpreadPct =
    selectedRange &&
    isFiniteNumber(selectedRange.midPrice) &&
    isFiniteNumber(selectedSpread) &&
    selectedRange.midPrice !== 0
      ? selectedSpread / Math.abs(selectedRange.midPrice)
      : null;
  const currentDelta =
    selectedRange &&
    isFiniteNumber(selectedRange.midPrice) &&
    isFiniteNumber(currentPrice) &&
    currentPrice !== 0
      ? (selectedRange.midPrice - currentPrice) / Math.abs(currentPrice)
      : null;
  const weightedDelta =
    selectedRange &&
    isFiniteNumber(selectedRange.midPrice) &&
    isFiniteNumber(weightedMidpoint) &&
    weightedMidpoint !== 0
      ? (selectedRange.midPrice - weightedMidpoint) / Math.abs(weightedMidpoint)
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Method Weighting And Highlight</h3>
            <p className="text-xs text-[var(--cb-text-secondary)]">
              Use weights to stress the methods you trust most and highlight the one carrying the discussion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setWeights(Object.fromEntries(rangeIds.map((id) => [id, 100])))}
              className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[var(--cb-text-primary)]"
            >
              Equal weight
            </button>
            <span className="text-[var(--cb-text-secondary)]">
              Weighted midpoint: {formatMoney(weightedMidpoint)}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {priceRanges.map((range) => (
            <div key={range.label} className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_96px_96px] lg:items-center">
              <button
                type="button"
                onClick={() => setSelectedLabel(range.label)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedLabel === range.label
                    ? 'border-[var(--cb-accent)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)]'
                    : 'border-[var(--cb-border-subtle)] bg-transparent text-[var(--cb-text-secondary)]'
                }`}
              >
                {range.label}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[range.label] ?? 0}
                onChange={(event) =>
                  setWeights((current) => ({
                    ...current,
                    [range.label]: Number(event.target.value),
                  }))
                }
              />
              <div className="font-mono text-sm text-[var(--cb-text-primary)]">{weights[range.label] ?? 0}%</div>
              <div className="font-mono text-sm text-[var(--cb-text-primary)]">{formatMoney(range.midPrice)}</div>
            </div>
          ))}
        </div>
      </div>

      <FootballFieldRangeChart
        ranges={priceRanges}
        currentPrice={currentPrice}
        selectedLabel={selectedLabel}
        hoveredLabel={hoveredLabel}
        weightedMidpoint={weightedMidpoint}
        onSelectLabel={setSelectedLabel}
        onHoverLabelChange={setHoveredLabel}
      />

      {selectedRange ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Selected Method Detail</h3>
              <p className="text-xs text-[var(--cb-text-secondary)]">
                {selectedRange.label}
                {selectedRange.basis ? ` · ${selectedRange.basis.toUpperCase()} basis` : ''}
              </p>
            </div>
            <div className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-xs text-[var(--cb-text-secondary)]">
              Weight {weights[selectedRange.label] ?? 0}%
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--cb-text-muted)]">Low / Mid / High</p>
              <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                {formatMoney(selectedRange.lowPrice)} / {formatMoney(selectedRange.midPrice)} / {formatMoney(selectedRange.highPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--cb-text-muted)]">Spread</p>
              <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                {formatMoney(selectedSpread)} / {formatPercent(selectedSpreadPct)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--cb-text-muted)]">Vs Current Price</p>
              <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatPercent(currentDelta)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--cb-text-muted)]">Vs Weighted Midpoint</p>
              <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatPercent(weightedDelta)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--cb-text-muted)]">Current / Weighted</p>
              <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                {formatMoney(currentPrice)} / {formatMoney(weightedMidpoint)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3">
            <p className="mb-1 text-xs uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Method Commentary</p>
            <p className="text-sm text-[var(--cb-text-primary)]">
              {selectedRange.commentary && selectedRange.commentary.trim().length > 0
                ? selectedRange.commentary
                : 'No method commentary was provided for this range.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
