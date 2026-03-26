"use client";

import { useEffect, useMemo, useState } from 'react';
import { FootballFieldRangeChart } from '@/components/models/FootballFieldRangeChart';

type FootballFieldRangeInput = {
  label: string;
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
  const [highlightLabel, setHighlightLabel] = useState<string | null>(rangeIds[0] ?? null);

  useEffect(() => {
    setWeights(Object.fromEntries(rangeIds.map((id) => [id, 100])));
    setHighlightLabel(rangeIds[0] ?? null);
  }, [rangeIds]);

  const priceRanges = useMemo(
    () =>
      ranges.map((range) => ({
        label: range.label,
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
                onClick={() => setHighlightLabel(range.label)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  highlightLabel === range.label
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
        highlightLabel={highlightLabel}
        weightedMidpoint={weightedMidpoint}
      />
    </div>
  );
}
