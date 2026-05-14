'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import type { RankedStock, RankResponse } from '@/lib/ranking/types';
import type { StockQuote } from '@/app/api/quotes/route';
import { InvestmentChat } from './InvestmentChat';
import { setupLabel } from '@/lib/ranking/chatHelpers';
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

const SIGNAL_CHIP: Record<string, string> = {
  green:  'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20',
  yellow: 'bg-amber-500/10 text-amber-300 ring-amber-400/20',
  red:    'bg-rose-500/10 text-rose-300 ring-rose-400/20',
};

const FILTER_LABEL: Record<SignalFilter, string> = {
  all:    'All',
  green:  'Ready',
  yellow: 'Work Up',
  red:    'Repair',
};

const AI_ACTION_STYLE: Record<string, string> = {
  buy:   'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40',
  cover: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  hold:  'bg-amber-500/15  text-amber-300   ring-amber-400/30',
  short: 'bg-rose-500/20   text-rose-300    ring-rose-400/40',
  sell:  'bg-rose-500/20   text-rose-300    ring-rose-400/40',
};

function parseAiAction(reason: string): string | null {
  if (!reason.startsWith('AI: ')) return null;
  const word = reason.slice(4).split(/[\s(]/)[0]?.toLowerCase() ?? '';
  return AI_ACTION_STYLE[word] ? word : null;
}

const SCORE_TIERS = [
  { label: 'Any',    min: 0 },
  { label: '5+',     min: 5 },
  { label: '7+',     min: 7 },
  { label: 'Elite',  min: 8.5 },
] as const;
type ScoreTierMin = (typeof SCORE_TIERS)[number]['min'];

export function RankedList({ initial }: Props) {
  const [stocks,   setStocks]   = useState<RankedStock[]>(initial.stocks);
  const [loading,  setLoading]  = useState(false);
  const [scoredAt, setScoredAt] = useState(initial.scoredAt);
  const [filter,   setFilter]   = useState<SignalFilter>('all');
  const [scoreMin, setScoreMin] = useState<ScoreTierMin>(0);
  const [sectorFilter, setSectorFilter] = useState('all');
  const [subsectorFilter, setSubsectorFilter] = useState('all');
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<RankedStock | null>(initial.stocks[0] ?? null);
  const [movedStock, setMovedStock] = useState<MovedStock | null>(null);
  const [quotes,   setQuotes]   = useState<Map<string, StockQuote>>(new Map());
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
        if (scoreMin > 0 && s.score < scoreMin) return false;
        if (sectorFilter !== 'all' && (s.meta.sector ?? 'Other') !== sectorFilter) return false;
        if (subsectorFilter !== 'all' && (s.meta.subsector ?? 'General') !== subsectorFilter) return false;
        if (query) {
          const q = query.toUpperCase();
          return (
            s.ticker.includes(q) ||
            s.primaryReason.toUpperCase().includes(q) ||
            (s.meta.sector ?? '').toUpperCase().includes(q) ||
            (s.meta.subsector ?? '').toUpperCase().includes(q) ||
            (s.meta.companyName ?? '').toUpperCase().includes(q)
          );
        }
        return true;
      }),
    [stocks, filter, scoreMin, sectorFilter, subsectorFilter, query],
  );

  const sectorOptions = useMemo(() => (
    Array.from(new Set(stocks.map(s => s.meta.sector ?? 'Other')))
      .filter(Boolean)
      .sort()
  ), [stocks]);

  const subsectorOptions = useMemo(() => (
    Array.from(new Set(stocks
      .filter(s => sectorFilter === 'all' || (s.meta.sector ?? 'Other') === sectorFilter)
      .map(s => s.meta.subsector ?? 'General')))
      .filter(Boolean)
      .sort()
  ), [stocks, sectorFilter]);

  const quoteSymbols = useMemo(() => {
    const symbols = new Set<string>();
    for (const stock of visible.slice(0, 200)) symbols.add(stock.ticker);
    if (selected?.ticker) symbols.add(selected.ticker);
    return Array.from(symbols);
  }, [visible, selected?.ticker]);

  // Fetch quotes only for the visible slice, not the full 2,000-3,000 name universe.
  useEffect(() => {
    if (quoteSymbols.length === 0) return;

    async function fetchQuotes() {
      const CHUNK = 50;
      const map = new Map<string, StockQuote>();
      for (let i = 0; i < quoteSymbols.length; i += CHUNK) {
        const syms = quoteSymbols.slice(i, i + CHUNK).join(',');
        try {
          const res = await fetch(`/api/quotes?symbols=${syms}`);
          if (!res.ok) continue;
          const data = await res.json() as { quotes: StockQuote[] };
          for (const q of data.quotes) map.set(q.ticker, q);
        } catch { /* silent */ }
      }
      setQuotes(prev => new Map([...prev, ...map]));
    }

    fetchQuotes();
    const interval = window.setInterval(fetchQuotes, 60_000);
    return () => window.clearInterval(interval);
  }, [quoteSymbols]);

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
    <div className="grid h-full min-h-0 w-full overflow-hidden rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)] [grid-template-columns:1fr] [grid-template-rows:minmax(0,40vh)_minmax(0,1fr)] lg:[grid-template-columns:280px_minmax(0,1fr)] lg:[grid-template-rows:1fr]">

      {/* ── Left: compact ranked list ── */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] lg:border-b-0 lg:border-r">

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
                  'flex-1 py-1 text-[10px] font-medium transition-colors',
                  filter === f
                    ? 'bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)]'
                    : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
                )}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>

          {/* Score tier filter */}
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Score</span>
            <div className="flex flex-1 overflow-hidden rounded-md border border-[var(--cb-border)]">
              {SCORE_TIERS.map(tier => (
                <button
                  key={tier.min}
                  type="button"
                  onClick={() => setScoreMin(tier.min)}
                  className={cn(
                    'flex-1 py-1 text-[10px] font-medium transition-colors',
                    scoreMin === tier.min
                      ? 'bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)]'
                      : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
                  )}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticker search + count */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
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
            <span className="shrink-0 rounded bg-[var(--cb-surface)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--cb-text-muted)]">
              {visible.length}/{stocks.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={sectorFilter}
              onChange={(event) => {
                setSectorFilter(event.target.value);
                setSubsectorFilter('all');
              }}
              className="h-7 min-w-0 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 text-[10px] font-medium text-[var(--cb-text-secondary)] focus:border-[var(--cb-border-strong)] focus:outline-none"
            >
              <option value="all">All sectors</option>
              {sectorOptions.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
            <select
              value={subsectorFilter}
              onChange={(event) => setSubsectorFilter(event.target.value)}
              className="h-7 min-w-0 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 text-[10px] font-medium text-[var(--cb-text-secondary)] focus:border-[var(--cb-border-strong)] focus:outline-none"
            >
              <option value="all">All subsectors</option>
              {subsectorOptions.map(subsector => (
                <option key={subsector} value={subsector}>{subsector}</option>
              ))}
            </select>
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
                      <span className="flex items-baseline gap-1">
                        <span className="text-xs font-bold text-[var(--cb-text-primary)]">
                          {stock.ticker}
                        </span>
                        {stock.meta.companyName && (
                          <span className="max-w-[72px] truncate text-[9px] text-[var(--cb-text-muted)]">
                            {stock.meta.companyName.replace(/, Inc\.$/, '').replace(/ Inc\.$/, '').replace(/ Corp\.$/, '').replace(/ Corporation$/, '').replace(/ Technologies$/, ' Tech').replace(/ Holdings$/, '')}
                          </span>
                        )}
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
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ring-1',
                        SIGNAL_CHIP[stock.signal],
                      )}>
                        {setupLabel(stock.signal)}
                      </span>
                      {justMoved && (
                        <span className={cn(
                          'rounded px-1 text-[9px] font-semibold',
                          movedUp ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300',
                        )}>
                          {movedDelta >= 0 ? '+' : ''}{movedDelta.toFixed(1)}
                        </span>
                      )}
                      {/* AI verdict badge — shown when hedge fund has run */}
                      {(() => {
                        const action = stock.meta.aiHedgeFund?.action.toLowerCase() ?? parseAiAction(stock.primaryReason);
                        if (!action) return null;
                        return (
                          <span className={cn(
                            'rounded px-1 text-[9px] font-bold uppercase tracking-wide ring-1',
                            AI_ACTION_STYLE[action],
                          )}>
                            AI {action}
                          </span>
                        );
                      })()}
                      {signalChanged && (
                        <span className="rounded bg-white/10 px-1 text-[9px] font-semibold text-[var(--cb-text-primary)] ring-1 ring-white/15">
                          {setupLabel(stock.signal)}
                        </span>
                      )}
                      {/* Real-time price */}
                      {(() => {
                        const q = quotes.get(stock.ticker);
                        if (!q?.price) return null;
                        const up = (q.changePct ?? 0) >= 0;
                        return (
                          <span className="ml-auto flex shrink-0 items-baseline gap-1">
                            <span className="text-[10px] font-semibold tabular-nums text-[var(--cb-text-primary)]">
                              ${q.price.toFixed(2)}
                            </span>
                            {q.changePct != null && (
                              <span className={cn('text-[9px] tabular-nums font-medium', up ? 'text-emerald-400' : 'text-rose-400')}>
                                {up ? '+' : ''}{q.changePct.toFixed(2)}%
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {(stock.meta.subsector || stock.meta.sector) && (
                        <span className="shrink-0 rounded px-1 text-[8px] font-medium text-[var(--cb-text-muted)] ring-1 ring-[var(--cb-border)]">
                          {stock.meta.subsector ?? stock.meta.sector}
                        </span>
                      )}
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
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <InvestmentChat stock={selected} peers={peers} onStockUpdate={updateStock} />
      </div>

    </div>
  );
}
