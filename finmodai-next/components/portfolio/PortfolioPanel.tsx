'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  getPositions,
  updateCurrentPrice,
  exitPosition,
  removePosition,
  PORTFOLIO_EVENT,
} from '@/lib/portfolio/storage';
import type { ActivePosition } from '@/lib/portfolio/types';
import { PositionCard } from './PositionCard';

export function PortfolioPanel() {
  const [positions, setPositions] = useState<ActivePosition[]>([]);
  const [showExited, setShowExited] = useState(false);

  useEffect(() => {
    const refresh = () => setPositions(getPositions());
    refresh();
    window.addEventListener(PORTFOLIO_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PORTFOLIO_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const active  = positions.filter(p => p.status !== 'exited');
  const exited  = positions.filter(p => p.status === 'exited');
  const visible = showExited ? positions : active;

  const handleUpdatePrice = (id: string, price: number) =>
    setPositions(updateCurrentPrice(id, price));
  const handleExit   = (id: string) => setPositions(exitPosition(id));
  const handleRemove = (id: string) => setPositions(removePosition(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--cb-text-muted)]">
          {active.length} active position{active.length === 1 ? '' : 's'}
          {exited.length > 0 && ` · ${exited.length} exited`}
        </p>
        <div className="flex items-center gap-2">
          {exited.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExited(v => !v)}
              className="text-xs text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
            >
              {showExited ? 'Hide exited' : 'Show exited'}
            </button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/app">Back to Ranked Board</Link>
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-12 text-center">
          <div className="text-base font-semibold text-[var(--cb-text-primary)]">No active positions</div>
          <p className="mt-2 text-sm text-[var(--cb-text-muted)]">
            Select a ranked stock, review the thesis, then enter a position to track it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(position => (
            <PositionCard
              key={position.id}
              position={position}
              onUpdatePrice={handleUpdatePrice}
              onExit={handleExit}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
