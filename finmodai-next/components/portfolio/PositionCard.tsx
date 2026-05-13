'use client';

import { useState } from 'react';
import { Trash2, LogOut, ChevronDown, ChevronUp, Zap, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ActivePosition, PositionStatus, ThesisDrift } from '@/lib/portfolio/types';
import type { StockQuote } from '@/app/api/quotes/route';
import type { ClassifiedNewsItem } from '@/lib/portfolio/newsClassify';
import { LABEL_STYLE } from '@/lib/portfolio/newsClassify';
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
  quote?: StockQuote;
  news?: ClassifiedNewsItem[];
  onUpdatePrice: (id: string, price: number) => void;
  onRefreshMonitor: (position: ActivePosition) => void;
  isRefreshingMonitor: boolean;
  onExit:        (id: string) => void;
  onRemove:      (id: string) => void;
};

function actionBadge(action: NonNullable<ActivePosition['latestMonitor']>['action']): string {
  if (action === 'Add')  return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (action === 'Hold') return 'border-blue-400/30 bg-blue-500/10 text-blue-300';
  if (action === 'Trim') return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  if (action === 'Exit') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]';
}

function actionTone(action: NonNullable<ActivePosition['latestMonitor']>['action']): string {
  if (action === 'Add')  return 'border-emerald-400/30 bg-emerald-500/10';
  if (action === 'Hold') return 'border-blue-400/30 bg-blue-500/10';
  if (action === 'Trim') return 'border-amber-400/30 bg-amber-500/10';
  if (action === 'Exit') return 'border-rose-400/30 bg-rose-500/10';
  return 'border-[var(--cb-border-subtle)] bg-black/10';
}

function actionLabel(action: NonNullable<ActivePosition['latestMonitor']>['action']): string {
  if (action === 'Add') return 'Add / press';
  if (action === 'Hold') return 'Hold';
  if (action === 'Trim') return 'Trim risk';
  if (action === 'Exit') return 'Exit watch';
  return 'Watch';
}

function monitorSummary(monitor: ActivePosition['latestMonitor']): string {
  if (!monitor) return 'Checking whether price, score, news, and agents still support the original thesis.';
  if (monitor.action === 'Add') return 'Thesis is improving and risk checks are not blocking.';
  if (monitor.action === 'Hold') return 'Thesis is intact; keep monitoring the next catalyst.';
  if (monitor.action === 'Trim') return 'Upside is less clean or the position is extended; harvest some risk.';
  if (monitor.action === 'Exit') return 'Original thesis is no longer supported by score, news, or agents.';
  return 'No clean add or exit signal yet; wait for confirmation.';
}

export function PositionCard({
  position,
  quote,
  news,
  onUpdatePrice,
  onRefreshMonitor,
  isRefreshingMonitor,
  onExit,
  onRemove,
}: Props) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput,   setPriceInput]   = useState('');

  const livePrice   = quote?.price ?? position.currentPrice;
  const pctChange   = ((livePrice - position.entryPrice) / position.entryPrice) * 100;
  const dollarPnL   =
    typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd)
      ? position.notionalUsd * (pctChange / 100)
      : null;
  const scoreDelta  = position.currentScore - position.entryScore;
  const drift       = driftBadge(position.thesisDrift);
  const todayPct    = quote?.changePct ?? null;
  const isLive      = quote?.price != null;
  const monitor     = position.latestMonitor;

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
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusBadge(position.status))}>
            {STATUS_LABELS[position.status]}
          </span>
          <span className={cn('text-[11px] font-medium', drift.cls)}>{drift.label}</span>
          {typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd) && position.notionalUsd > 0 && (
            <span className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--cb-text-muted)]">
              {fmtUsd(position.notionalUsd)} tracked
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400/70">
              <Zap className="h-2.5 w-2.5" />
              LIVE
            </span>
          )}
        </div>

        {/* P&L + actions */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            {/* Since-entry return */}
            <div className={cn('text-lg font-bold tabular-nums', pnlColor(pctChange))}>
              {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
            </div>
            {dollarPnL !== null && (
              <div className={cn('text-xs font-semibold tabular-nums', pnlColor(dollarPnL))}>
                {dollarPnL >= 0 ? '+' : ''}{fmtUsd(dollarPnL)}
              </div>
            )}
            {/* Today's move */}
            {todayPct != null && (
              <div className={cn('text-[10px] tabular-nums text-[var(--cb-text-muted)]')}>
                today{' '}
                <span className={cn('font-semibold', pnlColor(todayPct))}>
                  {todayPct >= 0 ? '+' : ''}{todayPct.toFixed(2)}%
                </span>
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
          Entry <span className="tabular-nums text-[var(--cb-text-primary)]">${position.entryPrice.toFixed(2)}</span>
        </span>
        <span className="text-[var(--cb-text-muted)]">
          Now{' '}
          <span className={cn('tabular-nums font-semibold', isLive ? pnlColor(pctChange) : 'text-[var(--cb-text-primary)]')}>
            ${livePrice.toFixed(2)}
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
        <span className="text-[var(--cb-text-muted)]">Since {fmtDate(position.entryDate)}</span>
      </div>

      {/* Body grid */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">PM View</div>
          <p className="mt-0.5 text-sm font-medium text-[var(--cb-text-primary)]">{position.currentStance}</p>
          <p className="mt-0.5 text-[11px] text-[var(--cb-text-muted)]">{position.thesisSummary}</p>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Next Catalyst</div>
          <p className="mt-0.5 text-sm text-[var(--cb-text-primary)]">{position.nextCatalyst}</p>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Watch Items</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {position.watchItems.map(item => (
              <span
                key={item}
                className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-0.5 text-[10px] text-[var(--cb-text-secondary)]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Main Risk</div>
          <p className="mt-0.5 text-[11px] text-amber-100/80">{position.keyRisks}</p>
        </div>
      </div>

      {/* Position monitor */}
      <div className={cn('mt-3 rounded-xl border p-3 transition-colors', monitor ? actionTone(monitor.action) : 'border-[var(--cb-border-subtle)] bg-black/10')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-300" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">PM Monitor</div>
              <div className="text-xs text-[var(--cb-text-muted)]">Price + score + news + AI agent checks</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRefreshMonitor(position)}
            disabled={isRefreshingMonitor || position.status === 'exited'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cb-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--cb-text-secondary)] transition-colors hover:border-blue-400/40 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshingMonitor && 'animate-spin')} />
            {isRefreshingMonitor ? 'Checking' : monitor ? 'Recheck thesis' : 'Check thesis'}
          </button>
        </div>

        {monitor ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', actionBadge(monitor.action))}>
                {actionLabel(monitor.action)}
              </span>
              <span className="text-[11px] text-[var(--cb-text-muted)]">
                {monitor.confidence}% confidence · {new Date(monitor.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{monitorSummary(monitor)}</p>
            <p className="text-[11px] leading-snug text-[var(--cb-text-muted)]">{monitor.exitTrigger}</p>
            <div className="grid gap-2 text-[11px] text-[var(--cb-text-muted)] sm:grid-cols-2">
              <div>
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Price</div>
                <p>{monitor.priceRead}</p>
              </div>
              <div>
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Score</div>
                <p>{monitor.scoreRead}</p>
              </div>
              <div>
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">News</div>
                <p>{monitor.newsRead}</p>
              </div>
              <div>
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Agents</div>
                <p>{monitor.agentRead}</p>
              </div>
            </div>
            {monitor.riskFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {monitor.riskFlags.map(flag => (
                  <span key={flag} className="rounded-full border border-rose-400/20 bg-rose-500/5 px-2 py-0.5 text-[10px] text-rose-200/80">
                    {flag}
                  </span>
                ))}
              </div>
            )}
            {monitor.agentReads.length > 0 && (
              <div className="grid gap-1.5 sm:grid-cols-3">
                {monitor.agentReads.map(read => (
                  <div key={read.source} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2.5 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--cb-text-secondary)]">
                      {read.source.replace('_', ' ')} · {read.stance}
                    </div>
                    <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-[var(--cb-text-muted)]">{read.read}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-[var(--cb-text-muted)]">
            {isRefreshingMonitor
              ? 'Running the first thesis check now.'
              : 'This will auto-check after news and price context load, or run it now to judge whether the original thesis is still intact.'}
          </p>
        )}
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
              setPriceInput(livePrice.toFixed(2));
            }}
            className="rounded-lg border border-[var(--cb-border)] px-2.5 py-1 text-[11px] text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]"
          >
            {isLive ? 'Override price' : 'Update price'}
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

      {/* News */}
      {news && news.length > 0 && (
        <div className="mt-3 border-t border-[var(--cb-border)] pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            News
          </div>
          <div className="space-y-1.5">
            {news.map(item => {
              const style = LABEL_STYLE[item.label];
              const date  = new Date(item.publishedAt);
              const dateStr = Number.isNaN(date.getTime())
                ? 'Recent'
                : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 px-2.5 py-2 transition-colors hover:border-[var(--cb-border-strong)]"
                >
                  <span className={cn(
                    'mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                    style.border, style.text, style.bg,
                  )}>
                    {item.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium leading-4 text-[var(--cb-text-primary)]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--cb-text-muted)]">
                      {item.source || item.provider || 'News'} · {dateStr}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {news && news.length === 0 && (
        <div className="mt-3 border-t border-[var(--cb-border)] pt-3">
          <p className="text-[11px] text-[var(--cb-text-muted)]">No recent headlines for {position.ticker}.</p>
        </div>
      )}

      {/* Timeline */}
      {showTimeline && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--cb-border)] pt-3">
          {position.timeline.map(event => (
            <div key={event.id} className="flex gap-3 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--cb-text-muted)]">{fmtDate(event.date)}</span>
              <span className="text-[var(--cb-text-secondary)]">{event.description}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
