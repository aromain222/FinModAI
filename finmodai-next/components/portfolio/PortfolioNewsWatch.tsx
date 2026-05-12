'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActivePosition } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string | null;
  provider?: string;
};

type LabelKey = 'Estimate' | 'Risk' | 'Positioning' | 'Multiple' | 'Watch';

const LABEL_STYLE: Record<LabelKey, { border: string; text: string; bg: string }> = {
  Estimate:    { border: 'border-amber-400/30',   text: 'text-amber-300',  bg: 'bg-amber-500/10' },
  Risk:        { border: 'border-rose-400/30',    text: 'text-rose-300',   bg: 'bg-rose-500/10' },
  Positioning: { border: 'border-blue-400/30',    text: 'text-blue-300',   bg: 'bg-blue-500/10' },
  Multiple:    { border: 'border-purple-400/30',  text: 'text-purple-300', bg: 'bg-purple-500/10' },
  Watch:       { border: 'border-[var(--cb-border)]', text: 'text-[var(--cb-text-muted)]', bg: '' },
};

const LABEL_PRIORITY: LabelKey[] = ['Estimate', 'Risk', 'Positioning', 'Multiple', 'Watch'];

type Classification = { label: LabelKey; reason: string };

function classifyHeadline(item: NewsItem): Classification {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();

  if (/\b(earnings|guidance|revenue|margin|bookings|orders|gmv|growth rate|forecast|outlook|estimate|beat|miss|consensus|eps|sales|shipments)\b/.test(text)) {
    return {
      label: 'Estimate',
      reason: 'Why this matters: Changes to revenue, margin, or EPS guidance can re-rate the score and trigger position reassessment.',
    };
  }
  if (/\b(regulat|antitrust|lawsuit|probe|investigation|ban|tariff|policy|labor ruling|court|fine|sec|ftc|doj|penalty|compliance)\b/.test(text)) {
    return {
      label: 'Risk',
      reason: 'Why this matters: Regulatory or legal risk can compress the multiple before numbers change — monitor for escalation.',
    };
  }
  if (/\b(upgrade|downgrade|price target|overweight|underweight|stake|flows|etf|short interest|rotation|activist|fund|position|held|owns|bought|sold)\b/.test(text)) {
    return {
      label: 'Positioning',
      reason: 'Why this matters: Fast-money flows and analyst re-ratings can move the stock independently of fundamentals.',
    };
  }
  if (/\b(valuation|multiple|p\/e|ev\/ebitda|moat|competition|market share|pricing power|competitive|disruptive|alternative|substitute)\b/.test(text)) {
    return {
      label: 'Multiple',
      reason: 'Why this matters: Changes to the competitive moat or pricing power can reset what the market pays for earnings.',
    };
  }
  return {
    label: 'Watch',
    reason: 'Why this matters: Monitor whether this develops into an estimate, multiple, or risk catalyst.',
  };
}

function priorityScore(label: LabelKey): number {
  return LABEL_PRIORITY.indexOf(label);
}

type TickerNews = {
  ticker: string;
  notionalUsd: number | null;
  items: NewsItem[];
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
        // Sort by priority then take top 3
        const items = raw
          .map(item => ({ item, cls: classifyHeadline(item) }))
          .sort((a, b) => priorityScore(a.cls.label) - priorityScore(b.cls.label))
          .slice(0, 3)
          .map(({ item }) => item);
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
                    const { label, reason } = classifyHeadline(item);
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
