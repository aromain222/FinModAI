'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  getPositions,
  updateCurrentPrice,
  updatePositionMonitor,
  exitPosition,
  removePosition,
  batchUpdatePrices,
  PORTFOLIO_EVENT,
} from '@/lib/portfolio/storage';
import type { ActivePosition } from '@/lib/portfolio/types';
import type { StockQuote } from '@/app/api/quotes/route';
import type { ClassifiedNewsItem, NewsItem } from '@/lib/portfolio/newsClassify';
import { classifyHeadline, sortByPriority } from '@/lib/portfolio/newsClassify';
import { PositionCard } from './PositionCard';
import { PortfolioRiskDashboard } from './PortfolioRiskDashboard';

export function PortfolioPanel() {
  const [positions,  setPositions]  = useState<ActivePosition[]>([]);
  const [quotes,     setQuotes]     = useState<Map<string, StockQuote>>(new Map());
  const [newsMap,    setNewsMap]    = useState<Map<string, ClassifiedNewsItem[]>>(new Map());
  const [monitoring, setMonitoring] = useState<Set<string>>(new Set());
  const [showExited, setShowExited] = useState(false);

  // Sync from storage
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

  const activeTickers = useMemo(
    () => positions.filter(p => p.status !== 'exited').map(p => p.ticker),
    [positions],
  );

  // Auto-fetch live quotes every 60s
  useEffect(() => {
    if (activeTickers.length === 0) return;

    async function fetchLivePrices() {
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(activeTickers.join(','))}`);
        if (!res.ok) return;
        const data = await res.json() as { quotes: StockQuote[] };
        const map = new Map<string, StockQuote>();
        const updates: Record<string, number> = {};
        for (const q of data.quotes) {
          map.set(q.ticker, q);
          if (typeof q.price === 'number') updates[q.ticker] = q.price;
        }
        setQuotes(map);
        if (Object.keys(updates).length > 0) setPositions(batchUpdatePrices(updates));
      } catch { /* silent */ }
    }

    fetchLivePrices();
    const interval = window.setInterval(fetchLivePrices, 60_000);
    return () => window.clearInterval(interval);
  }, [activeTickers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch news for active tickers (once per ticker, no polling)
  useEffect(() => {
    if (activeTickers.length === 0) return;

    async function fetchAllNews() {
      const results = await Promise.allSettled(
        activeTickers.map(async (ticker) => {
          const res = await fetch(`/api/company-info?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
          if (!res.ok) return { ticker, items: [] };
          const data = await res.json() as { news?: NewsItem[] };
          const raw: NewsItem[] = Array.isArray(data.news) ? data.news : [];
          const classified = sortByPriority(raw.map(classifyHeadline)).slice(0, 4);
          return { ticker, items: classified };
        }),
      );
      const map = new Map<string, ClassifiedNewsItem[]>();
      for (const r of results) {
        if (r.status === 'fulfilled') map.set(r.value.ticker, r.value.items);
      }
      setNewsMap(map);
    }

    fetchAllNews();
  }, [activeTickers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const active  = positions.filter(p => p.status !== 'exited');
  const exited  = positions.filter(p => p.status === 'exited');
  const visible = showExited ? positions : active;

  const handleUpdatePrice = (id: string, price: number) => setPositions(updateCurrentPrice(id, price));
  const handleExit        = (id: string) => setPositions(exitPosition(id));
  const handleRemove      = (id: string) => setPositions(removePosition(id));
  const handleRefreshMonitor = async (position: ActivePosition) => {
    setMonitoring(prev => new Set(prev).add(position.id));
    try {
      const res = await fetch('/api/portfolio/monitor', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position,
          quote: quotes.get(position.ticker) ?? null,
          news:  newsMap.get(position.ticker) ?? [],
          horizonWeeks: 6,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { monitor?: ActivePosition['latestMonitor'] };
      if (data.monitor) setPositions(updatePositionMonitor(position.id, data.monitor));
    } finally {
      setMonitoring(prev => {
        const next = new Set(prev);
        next.delete(position.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <PortfolioRiskDashboard positions={positions} quotes={quotes} newsMap={newsMap} />

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
          <div className="text-base font-semibold text-[var(--cb-text-primary)]">No tracked ideas yet</div>
          <p className="mt-2 text-sm text-[var(--cb-text-muted)]">
            Open a ranked stock in the Analyst Chat, review the thesis, then paper track it to monitor it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(position => (
            <PositionCard
              key={position.id}
              position={position}
              quote={quotes.get(position.ticker)}
              news={newsMap.get(position.ticker)}
              onUpdatePrice={handleUpdatePrice}
              onRefreshMonitor={handleRefreshMonitor}
              isRefreshingMonitor={monitoring.has(position.id)}
              onExit={handleExit}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
