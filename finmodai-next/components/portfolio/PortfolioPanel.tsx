'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getPositions,
  updateCurrentPrice,
  exitPosition,
  removePosition,
  PORTFOLIO_EVENT,
} from '@/lib/portfolio/storage';
import type { ActivePosition } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';
import { PositionCard } from './PositionCard';
import { PortfolioNewsWatch } from './PortfolioNewsWatch';

function fmtUsd(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
}

function PortfolioSummary({ positions }: { positions: ActivePosition[] }) {
  const active = positions.filter(p => p.status !== 'exited');
  if (active.length === 0) return null;

  const withCapital = active.filter(
    p => typeof p.notionalUsd === 'number' && Number.isFinite(p.notionalUsd) && (p.notionalUsd ?? 0) > 0,
  );
  const totalCapital = withCapital.reduce((s, p) => s + (p.notionalUsd ?? 0), 0);
  const totalPnl = withCapital.reduce((s, p) => {
    const pct = (p.currentPrice - p.entryPrice) / p.entryPrice;
    return s + (p.notionalUsd ?? 0) * pct;
  }, 0);

  const riskPosition =
    active.find(p => p.status === 'broken') ??
    active.find(p => p.thesisDrift === 'weakening');

  return (
    <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            Tracked Ideas
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--cb-text-primary)]">
            {active.length}
          </div>
        </div>

        {totalCapital > 0 && (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                Tracked Capital
              </div>
              <div className="text-xl font-bold tabular-nums text-[var(--cb-text-primary)]">
                {fmtUsd(totalCapital)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                Est. P&amp;L
              </div>
              <div
                className={cn(
                  'text-xl font-bold tabular-nums',
                  totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {totalPnl >= 0 ? '+' : '–'}{fmtUsd(totalPnl)}
              </div>
            </div>
          </>
        )}

        {riskPosition && (
          <div className="min-w-[180px] flex-1 rounded-xl border border-rose-400/20 bg-rose-500/5 px-3 py-2">
            <div className="mb-0.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
              <div className="text-[10px] uppercase tracking-widest text-rose-400/80">Risk Watch</div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                {riskPosition.ticker}
              </span>
              <p className="text-[11px] leading-tight text-[var(--cb-text-muted)]">
                {riskPosition.keyRisks}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
      <PortfolioSummary positions={positions} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--cb-text-muted)]">
          {active.length} tracked idea{active.length === 1 ? '' : 's'}
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
          <div className="text-base font-semibold text-[var(--cb-text-primary)]">
            No tracked ideas yet
          </div>
          <p className="mt-2 text-sm text-[var(--cb-text-muted)]">
            Open a ranked stock in the Analyst Chat, review the thesis, then paper track it to monitor it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <PortfolioNewsWatch positions={active} />
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
