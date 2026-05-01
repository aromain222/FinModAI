'use client';

import { useEffect, useState } from 'react';
import { getPositions, updatePendingEntries, type Position } from '@/lib/trading/positions';
import { TradeCard } from '@/components/trading/TradeCard';

type ActivePositionsProps = {
  currentPrices?: Record<string, number>;
  refreshKey?: number;
};

export function ActivePositions({ currentPrices = {}, refreshKey = 0 }: ActivePositionsProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

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

  function handleClose(id: string) {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'CLOSED' } : p)));
    window.dispatchEvent(new CustomEvent('capitalbase:positions-updated'));
  }

  useEffect(() => {
    if (Object.keys(currentPrices).length === 0) return;
    let cancelled = false;
    updatePendingEntries(currentPrices).then((updated) => {
      if (!cancelled) setPositions(updated);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPrices]);

  const active = positions.filter((p) => p.status === 'PENDING' || p.status === 'OPEN');

  if (loading) {
    return (
      <div className="py-4 text-sm text-[var(--cb-text-muted)]">Loading positions…</div>
    );
  }

  if (active.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 text-sm text-[var(--cb-text-muted)]">
        <div className="text-[10px] font-medium uppercase tracking-widest">Active Positions</div>
        <div className="mt-1">No pending or open trades yet. Use Track Trade on a LONG or SHORT recommendation.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
          Active Positions
        </div>
        <span className="text-xs text-[var(--cb-text-muted)]">
          {active.filter((position) => position.status === 'OPEN').length} open · {active.filter((position) => position.status === 'PENDING').length} pending
        </span>
      </div>
      <div className="space-y-2.5">
        {active.map((position) => (
          <TradeCard
            key={position.id}
            position={position}
            portfolioPositions={positions}
            currentPrice={currentPrices[position.ticker.toUpperCase()]}
            onClose={handleClose}
          />
        ))}
      </div>
    </div>
  );
}
