'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActivePosition } from '@/lib/portfolio/types';

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string | null;
  provider?: string;
};

type TickerNews = {
  ticker: string;
  notionalUsd: number | null;
  items: NewsItem[];
};

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Notional not set';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function classifyHeadline(item: NewsItem): { label: string; reason: string } {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  if (/\b(earnings|guidance|revenue|margin|bookings|orders|gmv|growth|forecast|outlook|estimate)\b/.test(text)) {
    return {
      label: 'Estimate',
      reason: 'Watch for estimate revisions or guidance changes.',
    };
  }
  if (/\b(regulat|antitrust|lawsuit|probe|investigation|ban|tariff|policy|labor ruling|court)\b/.test(text)) {
    return {
      label: 'Risk',
      reason: 'Can change risk premium before numbers move.',
    };
  }
  if (/\b(upgrade|downgrade|price target|stake|flows|etf|short interest|rotation|activist)\b/.test(text)) {
    return {
      label: 'Positioning',
      reason: 'Can move fast-money positioning and sentiment.',
    };
  }
  if (/\b(valuation|multiple|moat|competition|market share|pricing power)\b/.test(text)) {
    return {
      label: 'Multiple',
      reason: 'Can change what investors pay for the same earnings stream.',
    };
  }
  return {
    label: 'Watch',
    reason: 'Relevant headline; monitor whether it changes estimates, multiple, or risk.',
  };
}

export function PortfolioNewsWatch({ positions }: { positions: ActivePosition[] }) {
  const [rows, setRows] = useState<TickerNews[]>([]);
  const [loading, setLoading] = useState(false);
  const tickers = useMemo(
    () => Array.from(new Set(positions.filter(p => p.status !== 'exited').map(p => p.ticker))).slice(0, 8),
    [positions],
  );

  useEffect(() => {
    if (tickers.length === 0) {
      setRows([]);
      return;
    }
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
        const items = Array.isArray(payload?.news)
          ? payload.news
              .filter((item: unknown): item is NewsItem => {
                if (!item || typeof item !== 'object') return false;
                const row = item as Record<string, unknown>;
                return typeof row.title === 'string' && typeof row.url === 'string';
              })
              .slice(0, 3)
          : [];
        return {
          ticker,
          notionalUsd: position?.notionalUsd ?? null,
          items,
        };
      }),
    )
      .then(setRows)
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [positions, tickers]);

  if (tickers.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">Portfolio News Watch</h2>
          <p className="mt-0.5 text-xs text-[var(--cb-text-muted)]">
            Perigon-backed headlines mapped to estimate, multiple, positioning, and risk channels.
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-[var(--cb-text-muted)]">Refreshing headlines...</span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {rows.map(row => (
          <div key={row.ticker} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-[var(--cb-text-primary)]">{row.ticker}</div>
              <div className="text-xs tabular-nums text-[var(--cb-text-muted)]">{formatMoney(row.notionalUsd)}</div>
            </div>
            {row.items.length === 0 ? (
              <p className="text-xs text-[var(--cb-text-muted)]">No current headline loaded yet. Watch the next catalyst and score drift.</p>
            ) : (
              <div className="space-y-2">
                {row.items.map(item => {
                  const channel = classifyHeadline(item);
                  return (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-2 transition-colors hover:border-[var(--cb-border-strong)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                          {channel.label}
                        </span>
                        <span className="text-[10px] text-[var(--cb-text-muted)]">
                          {item.source || item.provider || 'Perigon'} · {formatDate(item.publishedAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-medium leading-5 text-[var(--cb-text-primary)]">{item.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-[var(--cb-text-muted)]">{channel.reason}</div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
