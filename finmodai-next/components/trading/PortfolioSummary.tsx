'use client';

import { useEffect, useState } from 'react';
import { computePortfolioMetrics } from '@/lib/trading/portfolio';
import { getPositions, type Position } from '@/lib/trading/positions';

type PortfolioSummaryProps = {
  currentPrices?: Record<string, number>;
  refreshKey?: number;
};

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatAbsPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDollar(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function pnlClass(value: number): string {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-[var(--cb-text-primary)]';
}

export function PortfolioSummary({ currentPrices = {}, refreshKey = 0 }: PortfolioSummaryProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadPositions = () => {
      getPositions()
        .then((all) => {
          if (!cancelled) setPositions(all);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    loadPositions();
    window.addEventListener('capitalbase:positions-updated', loadPositions);
    return () => {
      cancelled = true;
      window.removeEventListener('capitalbase:positions-updated', loadPositions);
    };
  }, [refreshKey]);

  const metrics = computePortfolioMetrics(positions, currentPrices);
  const netLabel =
    metrics.netExposure > 0
      ? `${formatPct(metrics.netExposure)} net long`
      : metrics.netExposure < 0
        ? `${formatAbsPct(Math.abs(metrics.netExposure))} net short`
        : '0.0% neutral';

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            Portfolio Summary
          </div>
          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
            {loading ? 'Loading portfolio context...' : netLabel}
          </div>
        </div>
        {metrics.totalExposure > 100 ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Exposure limit
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <div>
          <div className="text-[var(--cb-text-muted)]">Total exposure</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatAbsPct(metrics.totalExposure)}
          </div>
        </div>
        <div>
          <div className="text-[var(--cb-text-muted)]">Long / Short</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatAbsPct(metrics.longExposure)} / {formatAbsPct(metrics.shortExposure)}
          </div>
        </div>
        <div>
          <div className="text-[var(--cb-text-muted)]">Total P&L</div>
          <div className={`mt-0.5 text-base font-semibold tabular-nums ${pnlClass(metrics.totalPnL)}`}>
            {formatDollar(metrics.totalPnL)}
          </div>
        </div>
        <div>
          <div className="text-[var(--cb-text-muted)]">Open trades</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {metrics.openPositions}
          </div>
        </div>
      </div>
    </div>
  );
}
