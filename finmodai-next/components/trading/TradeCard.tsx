'use client';

import { useState } from 'react';
import type { Position } from '@/lib/trading/positions';
import { closePosition } from '@/lib/trading/positions';
import { calculatePnL, formatPnL } from '@/lib/trading/pnl';
import { evaluateThesis } from '@/lib/trading/thesis';

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

function statusClasses(status: Position['status']): string {
  if (status === 'OPEN') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'PENDING') return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  return 'border-zinc-600/40 bg-zinc-600/20 text-zinc-400';
}

function thesisClasses(status: ReturnType<typeof evaluateThesis>): string {
  if (status === 'Strengthening') return 'text-emerald-300';
  if (status === 'Breaking') return 'text-rose-300';
  return 'text-[var(--cb-text-muted)]';
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
}

function formatDollarPnL(value: number): string {
  return `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
}

function daysBetween(start: number | null, end: number): number {
  if (start == null) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function TradeCard({ position, currentPrice, onClose }: TradeCardProps) {
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const isOpen = position.status === 'OPEN';
  const isPending = position.status === 'PENDING';
  const thesisStatus = evaluateThesis(position, { currentPrice });
  const pnl = isOpen && currentPrice != null ? calculatePnL(position, currentPrice) : null;

  async function handleClose() {
    const closePrice = currentPrice ?? position.exitPrice ?? position.entryPrice;
    setClosing(true);
    await closePosition(position.id, closePrice);
    onClose?.(position.id);
    setClosing(false);
  }

  const displayPrice = position.status === 'CLOSED' ? position.exitPrice : currentPrice;
  const closedPnl =
    position.status === 'CLOSED' && position.exitPrice != null && position.openedAt != null
      ? calculatePnL(position, position.exitPrice)
      : null;
  const displayPnl = isOpen ? pnl : closedPnl;
  const dayAnchor = position.status === 'PENDING' ? position.createdAt : position.openedAt;
  const dayEnd = position.status === 'CLOSED' ? position.closedAt ?? Date.now() : Date.now();
  const daysInTrade = daysBetween(dayAnchor, dayEnd);

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
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClasses(position.status)}`}>
              {position.status}
            </span>
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
          ) : isPending ? (
            <div className="mt-1 text-sm text-amber-300">Waiting for entry</div>
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
          <span className="text-[var(--cb-text-muted)]">{position.status === 'CLOSED' ? 'Exit' : 'Current'}</span>
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
        <span>Days in Trade: {daysInTrade}</span>
        <span className={thesisClasses(thesisStatus)}>Thesis: {thesisStatus}</span>
      </div>

      {/* Close action */}
      {position.status !== 'CLOSED' && (
        <div className="mt-3">
          {showCloseConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--cb-text-muted)]">
                {isPending ? 'Close pending trade' : `Close at ${formatPrice(currentPrice ?? position.entryPrice)}`}?
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
