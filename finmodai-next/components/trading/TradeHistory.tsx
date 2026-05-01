'use client';

import { useEffect, useState } from 'react';
import { getPositions, type Position } from '@/lib/trading/positions';
import { closedPnL, positionSummary } from '@/lib/trading/pnl';

type TradeHistoryProps = {
  refreshKey?: number;
};

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
}

function formatPct(value: number | null): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function ClosedRow({ position }: { position: Position }) {
  const pnl = closedPnL(position);
  const dateStr = position.closedAt
    ? new Date(position.closedAt).toLocaleDateString()
    : new Date(position.createdAt).toLocaleDateString();

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm odd:bg-white/[0.02]">
      <span className="w-16 font-medium text-[var(--cb-text-primary)]">{position.ticker}</span>
      <span
        className={`w-14 text-[10px] font-semibold uppercase ${position.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}
      >
        {position.direction}
      </span>
      <span className="w-20 tabular-nums text-[var(--cb-text-muted)]">
        {formatPrice(position.entryPrice)}
      </span>
      <span className="w-20 tabular-nums text-[var(--cb-text-muted)]">
        {formatPrice(position.exitPrice)}
      </span>
      <span
        className={`flex-1 font-medium tabular-nums ${pnl == null ? 'text-[var(--cb-text-muted)]' : pnl.isProfit ? 'text-emerald-400' : 'text-rose-400'}`}
      >
        {pnl != null ? formatPct(pnl.percentReturn) : '—'}
      </span>
      <span
        className={`w-12 text-[10px] font-semibold uppercase ${
          pnl == null ? 'text-[var(--cb-text-muted)]' : pnl.isProfit ? 'text-emerald-400' : 'text-rose-400'
        }`}
      >
        {pnl == null ? '—' : pnl.isProfit ? 'Win' : 'Loss'}
      </span>
      <span className="text-xs text-[var(--cb-text-muted)]">{dateStr}</span>
    </div>
  );
}

export function TradeHistory({ refreshKey = 0 }: TradeHistoryProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPositions = () => {
      setLoading(true);
      getPositions().then((all) => {
        if (!cancelled) {
          setPositions(all);
          setLoading(false);
        }
      });
    };
    loadPositions();
    window.addEventListener('capitalbase:positions-updated', loadPositions);
    return () => {
      cancelled = true;
      window.removeEventListener('capitalbase:positions-updated', loadPositions);
    };
  }, [refreshKey]);

  const closed = positions.filter((p) => p.status === 'closed');
  const summary = positionSummary(positions);

  if (loading) return null;
  if (closed.length === 0) return null;

  const displayed = showAll ? closed : closed.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
          Trade History
        </div>
        {/* Summary stats */}
        <div className="flex items-center gap-4 text-xs text-[var(--cb-text-muted)]">
          {summary.winRate != null && (
            <span>
              Win rate:{' '}
              <span className="font-medium text-[var(--cb-text-primary)]">
                {Math.round(summary.winRate * 100)}%
              </span>
            </span>
          )}
          {summary.avgReturn != null && (
            <span>
              Avg return:{' '}
              <span
                className={`font-medium ${summary.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {formatPct(summary.avgReturn)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
        <span className="w-16">Ticker</span>
        <span className="w-14">Dir</span>
        <span className="w-20">Entry</span>
        <span className="w-20">Exit</span>
        <span className="flex-1">Return</span>
        <span className="w-12">Result</span>
        <span>Date</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--cb-border-subtle)]">
        {displayed.map((position) => (
          <ClosedRow key={position.id} position={position} />
        ))}
      </div>

      {closed.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]"
        >
          {showAll ? 'Show less' : `Show all ${closed.length} trades`}
        </button>
      )}
    </div>
  );
}
