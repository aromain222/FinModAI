'use client';

import { useState } from 'react';
import type { Position } from '@/lib/trading/positions';
import { closePosition } from '@/lib/trading/positions';
import { calculatePnL, formatPnL } from '@/lib/trading/pnl';

type TradeCardProps = {
  position: Position;
  currentPrice?: number;
  onClose?: (id: string) => void;
};

function directionClasses(direction: Position['direction']): string {
  return direction === 'LONG'
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-400/30 bg-rose-500/10 text-rose-300';
}

function pnlClasses(isProfit: boolean): string {
  return isProfit ? 'text-emerald-400' : 'text-rose-400';
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
}

function formatDollarPnL(value: number): string {
  return `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
}

export function TradeCard({ position, currentPrice, onClose }: TradeCardProps) {
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const pnl = currentPrice != null ? calculatePnL(position, currentPrice) : null;

  async function handleClose() {
    if (currentPrice == null) return;
    setClosing(true);
    await closePosition(position.id, currentPrice);
    onClose?.(position.id);
    setClosing(false);
  }

  const isOpen = position.status === 'open';
  const displayPrice = isOpen ? currentPrice : position.exitPrice;
  const closedPnl =
    position.status === 'closed' && position.exitPrice != null
      ? calculatePnL(position, position.exitPrice)
      : null;
  const displayPnl = isOpen ? pnl : closedPnl;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
      {/* Direction accent */}
      <div
        className={`absolute inset-y-0 left-0 w-0.5 ${position.direction === 'LONG' ? 'bg-emerald-400' : 'bg-rose-400'}`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Ticker + direction */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
              {position.ticker}
            </span>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${directionClasses(position.direction)}`}
            >
              {position.direction}
            </span>
            {position.status === 'closed' && (
              <span className="inline-flex rounded-full border border-zinc-600/40 bg-zinc-600/20 px-2 py-0.5 text-[10px] text-zinc-400">
                Closed
              </span>
            )}
            {pnl?.hitTarget && (
              <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                Target hit
              </span>
            )}
            {pnl?.hitStop && (
              <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                Stop hit
              </span>
            )}
          </div>

          {/* P&L */}
          {displayPnl != null ? (
            <div className={`mt-1 flex flex-wrap items-baseline gap-2 tabular-nums ${pnlClasses(displayPnl.isProfit)}`}>
              <span className="text-xl font-semibold">{formatPnL(displayPnl)}</span>
              <span className="text-xs font-medium">{formatDollarPnL(displayPnl.unrealizedPnL)} / share</span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-[var(--cb-text-muted)]">P&L loading…</div>
          )}
        </div>

        {/* Confidence badge */}
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            Confidence
          </div>
          <div className="text-sm font-medium tabular-nums text-[var(--cb-text-primary)]">
            {(position.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Price grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <span className="text-[var(--cb-text-muted)]">Entry</span>
          <div className="font-medium tabular-nums text-[var(--cb-text-primary)]">
            {formatPrice(position.entryPrice)}
          </div>
        </div>
        <div>
          <span className="text-[var(--cb-text-muted)]">{isOpen ? 'Current' : 'Exit'}</span>
          <div className="font-medium tabular-nums text-[var(--cb-text-primary)]">
            {formatPrice(displayPrice ?? null)}
          </div>
        </div>
        <div>
          <span className="text-[var(--cb-text-muted)]">Target</span>
          <div className="font-medium tabular-nums text-emerald-400/90">
            {formatPrice(position.targetPrice)}
          </div>
        </div>
        <div>
          <span className="text-[var(--cb-text-muted)]">Stop</span>
          <div className="font-medium tabular-nums text-rose-400/90">
            {formatPrice(position.stopLoss)}
          </div>
        </div>
      </div>

      {/* Size + horizon */}
      <div className="mt-2.5 flex items-center gap-3 text-xs text-[var(--cb-text-muted)]">
        <span>Size: {position.sizePct.toFixed(1)}%</span>
        {position.horizon && <span>Horizon: {position.horizon}</span>}
        <span>{new Date(position.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Close action */}
      {isOpen && currentPrice != null && (
        <div className="mt-3">
          {showCloseConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--cb-text-muted)]">
                Close at {formatPrice(currentPrice)}?
              </span>
              <button
                onClick={handleClose}
                disabled={closing}
                className="rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
              >
                {closing ? 'Closing…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="text-xs text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="text-xs text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]"
            >
              Close position
            </button>
          )}
        </div>
      )}
    </div>
  );
}
