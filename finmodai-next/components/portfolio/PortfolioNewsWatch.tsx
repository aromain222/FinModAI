'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActivePosition } from '@/lib/portfolio/types';
import type { ClassifiedNewsItem, NewsItem } from '@/lib/portfolio/newsClassify';
import { classifyHeadline, sortByPriority, LABEL_STYLE } from '@/lib/portfolio/newsClassify';
import { cn } from '@/lib/utils';

type TickerNews = {
  ticker: string;
  notionalUsd: number | null;
  items: ClassifiedNewsItem[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `$${Math.round(value).toLocaleString('en-US')} tracked`;
}

export function PortfolioNewsWatch({ positions }: { positions: ActivePosition[] }) {
  const [rows, setRows]     = useState<TickerNews[]>([]);
  const [loading, setLoading] = useState(false);

  const tickers = useMemo(
    () =>
      Array.from(
        new Set(positions.filter(p => p.status !== 'exited').map(p => p.ticker)),
      ).slice(0, 8),
    [positions],
  );

  useEffect(() => {
    if (tickers.length === 0) { setRows([]); return; }
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      tickers.map(async (ticker): Promise<TickerNews> => {
        const position = positions.find(p => p.ticker === ticker && p.status !== 'exited');
        const response = await fetch(`/api/company-info?ticker=${encodeURIComponent(ticker)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = response.ok ? await response.json().catch(() => null) : null;
        const raw: NewsItem[] = Array.isArray(payload?.news)
          ? payload.news.filter((item: unknown): item is NewsItem => {
              if (!item || typeof item !== 'object') return false;
              const row = item as Record<string, unknown>;
              return typeof row.title === 'string' && typeof row.url === 'string';
            })
          : [];
        const items = sortByPriority(raw.map(classifyHeadline)).slice(0, 3);
        return { ticker, notionalUsd: position?.notionalUsd ?? null, items };
      }),
    )
      .then(setRows)
      .catch(err => { if ((err as Error).name !== 'AbortError') setRows([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [positions, tickers]);

  if (tickers.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">
            Portfolio News Watch
          </h2>
          <p className="mt-0.5 text-xs text-[var(--cb-text-muted)]">
            Headlines mapped to Estimate · Multiple · Positioning · Risk channels.
          </p>
        </div>
        {loading && (
          <span className="text-xs text-[var(--cb-text-muted)]">Loading headlines…</span>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {rows.map(row => {
          const notional = formatMoney(row.notionalUsd);
          return (
            <div
              key={row.ticker}
              className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[var(--cb-text-primary)]">{row.ticker}</span>
                {notional && (
                  <span className="text-[10px] tabular-nums text-[var(--cb-text-muted)]">{notional}</span>
                )}
              </div>

              {row.items.length === 0 ? (
                <p className="text-xs text-[var(--cb-text-muted)]">
                  No fresh headline loaded yet. Monitor the next catalyst.
                </p>
              ) : (
                <div className="space-y-2">
                  {row.items.map(item => {
                    const { label, reason } = item;
                    const style = LABEL_STYLE[label];
                    return (
                      <a
                        key={item.url}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-2.5 transition-colors hover:border-[var(--cb-border-strong)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                              style.border,
                              style.text,
                              style.bg,
                            )}
                          >
                            {label}
                          </span>
                          <span className="text-[10px] text-[var(--cb-text-muted)]">
                            {item.source || item.provider || 'News'} · {formatDate(item.publishedAt)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium leading-5 text-[var(--cb-text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--cb-text-muted)]">
                          {reason}
                        </p>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
