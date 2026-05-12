'use client';

import { useState } from 'react';
import { Trash2, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import type { ActivePosition, PositionStatus, ThesisDrift } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<PositionStatus, string> = {
  building:  'New',
  working:   'Active',
  extended:  'Extended',
  weakening: 'Weakening',
  broken:    'Broken',
  exited:    'Exited',
};

function statusBadge(status: PositionStatus): string {
  if (status === 'building')  return 'border-blue-400/30 bg-blue-500/10 text-blue-300';
  if (status === 'working')   return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'extended')  return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  if (status === 'weakening') return 'border-orange-400/30 bg-orange-500/10 text-orange-300';
  if (status === 'broken')    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]';
}

function driftBadge(drift: ThesisDrift): { cls: string; label: string } {
  if (drift === 'strengthening') return { cls: 'text-emerald-300', label: '↑ Strengthening' };
  if (drift === 'weakening')     return { cls: 'text-rose-300',    label: '↓ Weakening' };
  return                                { cls: 'text-[var(--cb-text-muted)]', label: '→ Stable' };
}

function pnlColor(value: number): string {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-[var(--cb-text-muted)]';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const sign = value < 0 ? '–' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
}

type Props = {
  position: ActivePosition;
  onUpdatePrice: (id: string, price: number) => void;
  onExit:        (id: string) => void;
  onRemove:      (id: string) => void;
};

export function PositionCard({ position, onUpdatePrice, onExit, onRemove }: Props) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput,   setPriceInput]   = useState('');

  const pctChange = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const dollarPnL =
    typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd)
      ? position.notionalUsd * (pctChange / 100)
      : null;
  const scoreDelta = position.currentScore - position.entryScore;
  const drift      = driftBadge(position.thesisDrift);

  const handlePriceConfirm = () => {
    const price = parseFloat(priceInput);
    if (!isNaN(price) && price > 0) onUpdatePrice(position.id, price);
    setEditingPrice(false);
    setPriceInput('');
  };

  return (
    <article className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-[var(--cb-text-primary)]">{position.ticker}</h2>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              statusBadge(position.status),
            )}
          >
            {STATUS_LABELS[position.status]}
          </span>
          <span className={cn('text-[11px] font-medium', drift.cls)}>{drift.label}</span>
          {typeof position.notionalUsd === 'number' &&
            Number.isFinite(position.notionalUsd) &&
            position.notionalUsd > 0 && (
              <span className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--cb-text-muted)]">
                {fmtUsd(position.notionalUsd)} tracked
              </span>
            )}
        </div>

        {/* P&L + actions */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className={cn('text-lg font-bold tabular-nums', pnlColor(pctChange))}>
              {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
            </div>
            {dollarPnL !== null && (
              <div className={cn('text-xs font-semibold tabular-nums', pnlColor(dollarPnL))}>
                {dollarPnL >= 0 ? '+' : ''}{fmtUsd(dollarPnL)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onExit(position.id)}
            className="rounded-lg border border-[var(--cb-border-subtle)] p-1.5 text-[var(--cb-text-muted)] transition-colors hover:border-amber-400/40 hover:text-amber-300"
            title="Mark exited"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(position.id)}
            className="rounded-lg border border-[var(--cb-border-subtle)] p-1.5 text-[var(--cb-text-muted)] transition-colors hover:border-rose-400/40 hover:text-rose-300"
            title="Remove idea"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Price + score strip */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-[var(--cb-text-muted)]">
          Entry{' '}
          <span className="tabular-nums text-[var(--cb-text-primary)]">
            ${position.entryPrice.toFixed(2)}
          </span>
        </span>
        <span className="text-[var(--cb-text-muted)]">
          Now{' '}
          <span className="tabular-nums text-[var(--cb-text-primary)]">
            ${position.currentPrice.toFixed(2)}
          </span>
        </span>
        <span className="text-[var(--cb-text-muted)]">
          Score{' '}
          <span className="tabular-nums text-[var(--cb-text-primary)]">
            {position.entryScore.toFixed(1)} → {position.currentScore.toFixed(1)}
          </span>{' '}
          <span className={scoreDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
            ({scoreDelta >= 0 ? '+' : ''}{scoreDelta.toFixed(1)})
          </span>
        </span>
        <span className="text-[var(--cb-text-muted)]">
          Since {fmtDate(position.entryDate)}
        </span>
      </div>

      {/* Body grid */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            PM View
          </div>
          <p className="mt-0.5 text-sm font-medium text-[var(--cb-text-primary)]">
            {position.currentStance}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--cb-text-muted)]">
            {position.thesisSummary}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            Next Catalyst
          </div>
          <p className="mt-0.5 text-sm text-[var(--cb-text-primary)]">{position.nextCatalyst}</p>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            Watch Items
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--cb-text-muted)]">
            {position.watchItems.join(' · ')}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            Main Risk
          </div>
          <p className="mt-0.5 text-[11px] text-amber-100/80">{position.keyRisks}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editingPrice ? (
          <>
            <input
              type="number"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              placeholder="Current price"
              className="w-32 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2.5 py-1 text-xs text-[var(--cb-text-primary)] focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && handlePriceConfirm()}
              autoFocus
            />
            <button
              type="button"
              onClick={handlePriceConfirm}
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setEditingPrice(false)}
              className="rounded-lg border border-[var(--cb-border)] px-2.5 py-1 text-[11px] text-[var(--cb-text-muted)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingPrice(true);
              setPriceInput(position.currentPrice.toFixed(2));
            }}
            className="rounded-lg border border-[var(--cb-border)] px-2.5 py-1 text-[11px] text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]"
          >
            Update price
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowTimeline(v => !v)}
          className="ml-auto flex items-center gap-1 text-[11px] text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
        >
          {showTimeline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Timeline ({position.timeline.length})
        </button>
      </div>

      {/* Timeline */}
      {showTimeline && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--cb-border)] pt-3">
          {position.timeline.map(event => (
            <div key={event.id} className="flex gap-3 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--cb-text-muted)]">
                {fmtDate(event.date)}
              </span>
              <span className="text-[var(--cb-text-secondary)]">{event.description}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
