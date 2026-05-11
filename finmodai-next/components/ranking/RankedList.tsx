'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import type { RankedStock, RankResponse } from '@/lib/ranking/types';
import { InvestmentChat } from './InvestmentChat';
import { cn } from '@/lib/utils';

type Props = {
  initial: RankResponse;
};

const SIGNAL_FILTERS = ['all', 'green', 'yellow', 'red'] as const;
type SignalFilter = (typeof SIGNAL_FILTERS)[number];
type MovedStock = {
  ticker: string;
  delta: number;
  fromSignal: RankedStock['signal'];
  toSignal: RankedStock['signal'];
};

const SIGNAL_DOT: Record<string, string> = {
  green:  'bg-emerald-400',
  yellow: 'bg-amber-400',
  red:    'bg-rose-400',
};

export function RankedList({ initial }: Props) {
  const [stocks,   setStocks]   = useState<RankedStock[]>(initial.stocks);
  const [loading,  setLoading]  = useState(false);
  const [scoredAt, setScoredAt] = useState(initial.scoredAt);
  const [filter,   setFilter]   = useState<SignalFilter>('all');
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<RankedStock | null>(initial.stocks[0] ?? null);
  const [movedStock, setMovedStock] = useState<MovedStock | null>(null);
  const highlightTimeout = useRef<number | null>(null);

  const updateStock = useCallback((updated: RankedStock) => {
    const previous = stocks.find(stock => stock.ticker === updated.ticker);
    const previousScore = previous?.score ?? updated.score;
    const previousSignal = previous?.signal ?? updated.signal;
    setStocks(prev =>
      prev
        .map(stock => stock.ticker === updated.ticker ? updated : stock)
        .sort((a, b) => b.score - a.score),
    );
    setSelected(updated);
    setMovedStock({
      ticker: updated.ticker,
      delta: updated.score - previousScore,
      fromSignal: previousSignal,
      toSignal: updated.signal,
    });
    if (highlightTimeout.current !== null) window.clearTimeout(highlightTimeout.current);
    highlightTimeout.current = window.setTimeout(() => setMovedStock(null), 2400);
  }, [stocks]);

  useEffect(() => {
    return () => {
      if (highlightTimeout.current !== null) window.clearTimeout(highlightTimeout.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rank', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data: RankResponse = await res.json();
        setStocks(data.stocks);
        setScoredAt(data.scoredAt);
        setSelected(prev =>
          prev
            ? (data.stocks.find(s => s.ticker === prev.ticker) ?? data.stocks[0] ?? null)
            : data.stocks[0] ?? null,
        );
      }
    } catch {
      // silent — keep current data
    } finally {
      setLoading(false);
    }
  }, []);

  const visible = useMemo(
    () =>
      stocks.filter(s => {
        if (filter !== 'all' && s.signal !== filter) return false;
        if (query) {
          const q = query.toUpperCase();
          return s.ticker.includes(q) || s.primaryReason.toUpperCase().includes(q);
        }
        return true;
      }),
    [stocks, filter, query],
  );

  const peers = useMemo(
    () =>
      stocks
        .filter(s => s.ticker !== selected?.ticker)
        .slice(0, 5)
        .map(({ ticker, score, signal, primaryReason, mainRisk, breakdown }) => ({
          ticker, score, signal, primaryReason, mainRisk, breakdown,
        })),
    [stocks, selected?.ticker],
  );

  const scored = useMemo(() => {
    const ts = new Date(scoredAt);
    return isNaN(ts.getTime())
      ? '—'
      : ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [scoredAt]);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)] lg:flex-row">

      {/* ── Left: compact ranked list ── */}
      <div className="flex max-h-[34vh] w-full shrink-0 flex-col overflow-hidden border-b border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r xl:w-64">

        {/* Toolbar */}
        <div className="shrink-0 space-y-2 border-b border-[var(--cb-border)] px-3 py-3">
          {/* Signal filter tabs */}
          <div className="flex overflow-hidden rounded-md border border-[var(--cb-border)]">
            {SIGNAL_FILTERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'flex-1 py-1 text-[10px] font-medium capitalize transition-colors',
                  filter === f
                    ? 'bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)]'
                    : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Ticker search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--cb-text-muted)]" />
            <input
              type="text"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-7 w-full rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] pl-6 pr-6 text-xs text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Stock rows — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--cb-text-muted)]">
              No stocks match.
            </p>
          ) : (
            visible.map(stock => {
              const rank     = stocks.indexOf(stock) + 1;
              const isActive = selected?.ticker === stock.ticker;
              const justMoved = movedStock?.ticker === stock.ticker;
              const movedDelta = movedStock?.delta ?? 0;
              const movedUp = movedDelta >= 0;
              const signalChanged = Boolean(
                justMoved && movedStock && movedStock.fromSignal !== movedStock.toSignal,
              );
              return (
                <button
                  key={stock.ticker}
                  type="button"
                  onClick={() => setSelected(stock)}
                  className={cn(
                    'flex w-full items-start gap-2 border-l-2 px-3 py-2.5 text-left transition-all duration-300',
                    isActive
                      ? 'border-l-[var(--cb-green)] bg-[var(--cb-surface)]'
                      : 'border-l-transparent hover:bg-[var(--cb-surface)]',
                    justMoved && (movedUp
                      ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/30'
                      : 'bg-rose-500/10 ring-1 ring-inset ring-rose-400/30'),
                    signalChanged && movedUp && 'animate-pulse shadow-[0_0_28px_rgba(52,211,153,0.16)]',
                    signalChanged && !movedUp && 'animate-pulse shadow-[0_0_28px_rgba(251,113,133,0.16)]',
                  )}
                >
                  {/* Rank number */}
                  <span className="mt-0.5 w-4 shrink-0 text-[10px] tabular-nums text-[var(--cb-text-muted)]">
                    {rank}
                  </span>

                  {/* Signal dot */}
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      SIGNAL_DOT[stock.signal],
                    )}
                  />

                  {/* Ticker + score + reason */}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[var(--cb-text-primary)]">
                        {stock.ticker}
                      </span>
                      {/* Momentum arrow */}
                      <span className={cn(
                        'text-[10px] font-semibold tabular-nums leading-none',
                        stock.breakdown.momentum >= 6.5 ? 'text-emerald-400'
                          : stock.breakdown.momentum <= 3.5 ? 'text-rose-400'
                          : 'text-[var(--cb-text-muted)]',
                      )}>
                        {stock.breakdown.momentum >= 6.5 ? '↑' : stock.breakdown.momentum <= 3.5 ? '↓' : '→'}
                      </span>
                      <span className={cn(
                        'rounded px-1 text-[10px] tabular-nums transition-all duration-300',
                        justMoved
                          ? movedUp
                            ? 'bg-emerald-400/15 font-semibold text-emerald-300'
                            : 'bg-rose-400/15 font-semibold text-rose-300'
                          : 'text-[var(--cb-text-muted)]',
                      )}>
                        {stock.score.toFixed(1)}
                      </span>
                      {justMoved && (
                        <span className={cn(
                          'rounded px-1 text-[9px] font-semibold',
                          movedUp ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300',
                        )}>
                          {movedDelta >= 0 ? '+' : ''}{movedDelta.toFixed(1)}
                        </span>
                      )}
                      {signalChanged && (
                        <span className="rounded bg-white/10 px-1 text-[9px] font-semibold text-[var(--cb-text-primary)] ring-1 ring-white/15">
                          signal
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {stock.meta.forecastReturnPct != null && (
                        <span className={cn(
                          'shrink-0 rounded px-1 text-[9px] font-semibold tabular-nums',
                          stock.meta.forecastReturnPct >= 4  ? 'bg-emerald-500/10 text-emerald-300'
                            : stock.meta.forecastReturnPct <= -4 ? 'bg-rose-500/10 text-rose-300'
                            : 'bg-white/5 text-[var(--cb-text-muted)]',
                        )}>
                          {stock.meta.forecastReturnPct >= 0 ? '+' : ''}{stock.meta.forecastReturnPct.toFixed(1)}%
                        </span>
                      )}
                      <span className="truncate text-[10px] leading-tight text-[var(--cb-text-muted)]">
                        {stock.primaryReason}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer: scored time + refresh */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--cb-border)] px-3 py-2">
          <span className="text-[10px] text-[var(--cb-text-muted)]">
            {scored}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-secondary)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Right: Investment Chat ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <InvestmentChat stock={selected} peers={peers} onStockUpdate={updateStock} />
      </div>

    </div>
  );
}
