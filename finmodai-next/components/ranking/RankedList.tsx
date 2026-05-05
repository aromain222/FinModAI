'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import type { RankedStock, RankResponse } from '@/lib/ranking/types';
import { RankedListRow } from './RankedListRow';
import { cn } from '@/lib/utils';

type Props = {
  initial: RankResponse;
};

const SIGNAL_FILTERS = ['all', 'green', 'yellow', 'red'] as const;
type SignalFilter = (typeof SIGNAL_FILTERS)[number];

export function RankedList({ initial }: Props) {
  const [stocks,     setStocks]     = useState<RankedStock[]>(initial.stocks);
  const [loading,    setLoading]    = useState(false);
  const [scoredAt,   setScoredAt]   = useState(initial.scoredAt);
  const [filter,     setFilter]     = useState<SignalFilter>('all');
  const [query,      setQuery]      = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rank', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data: RankResponse = await res.json();
        setStocks(data.stocks);
        setScoredAt(data.scoredAt);
      }
    } catch {
      // silent — keep current data
    } finally {
      setLoading(false);
    }
  }, []);

  const visible = stocks.filter(s => {
    if (filter !== 'all' && s.signal !== filter) return false;
    if (query) {
      const q = query.toUpperCase();
      return s.ticker.includes(q) || s.primaryReason.toUpperCase().includes(q);
    }
    return true;
  });

  const ts = new Date(scoredAt);
  const scored = isNaN(ts.getTime())
    ? '—'
    : ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Signal filters */}
        <div className="flex rounded-lg border border-[var(--cb-border)] overflow-hidden">
          {SIGNAL_FILTERS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
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
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cb-text-muted)]" />
          <input
            type="text"
            placeholder="Search ticker…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-8 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] pl-8 pr-8 text-xs text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Scored at + refresh */}
        <span className="hidden text-xs text-[var(--cb-text-muted)] sm:inline">
          Scored {scored}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--cb-border)] px-3 text-xs font-medium text-[var(--cb-text-muted)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-secondary)] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Results count ── */}
      <p className="text-xs text-[var(--cb-text-muted)]">
        {visible.length} of {stocks.length} opportunities
      </p>

      {/* ── List ── */}
      <div className="space-y-2">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-10 text-center">
            <p className="text-sm text-[var(--cb-text-muted)]">No stocks match the current filter.</p>
          </div>
        ) : (
          visible.map((stock, i) => (
            <RankedListRow key={stock.ticker} stock={stock} rank={i + 1} />
          ))
        )}
      </div>
    </div>
  );
}
