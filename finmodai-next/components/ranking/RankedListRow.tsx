'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Zap, AlertTriangle } from 'lucide-react';
import type { RankedStock } from '@/lib/ranking/types';
import { WEIGHTS } from '@/lib/ranking/score';
import { OpportunityBadge } from './OpportunityBadge';
import { ScoreBar } from './ScoreBar';
import { cn } from '@/lib/utils';

type Props = {
  stock: RankedStock;
  rank:  number;
};

const COMPONENT_LABELS: Record<keyof typeof WEIGHTS, string> = {
  forecastSignal:   'Forecast Signal',
  catalystStrength: 'Catalysts',
  momentum:         'Momentum',
  earningsSetup:    'Earnings Setup',
  riskAdjustment:   'Risk / Vol',
};

export function RankedListRow({ stock, rank }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chatParams = new URLSearchParams({
    ticker: stock.ticker,
    score: stock.score.toFixed(1),
    signal: stock.signal,
    horizonWeeks: String(stock.horizonWeeks),
    reason: stock.primaryReason,
    risk: stock.mainRisk,
  });

  const returnLine =
    stock.meta.forecastReturnPct != null
      ? `${stock.meta.forecastReturnPct >= 0 ? '+' : ''}${stock.meta.forecastReturnPct.toFixed(1)}%`
      : null;

  return (
    <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)] transition-colors hover:border-[var(--cb-border-strong)]">
      {/* ── Main row ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
        type="button"
        aria-expanded={expanded}
      >
        {/* Rank number */}
        <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-[var(--cb-text-muted)]">
          {rank}
        </span>

        {/* Ticker */}
        <span className="w-16 shrink-0 text-base font-bold text-[var(--cb-text-primary)]">
          {stock.ticker}
        </span>

        {/* Badge */}
        <div className="shrink-0">
          <OpportunityBadge signal={stock.signal} score={stock.score} />
        </div>

        {/* Return forecast pill */}
        {returnLine && (
          <span
            className={cn(
              'hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums sm:inline',
              stock.meta.forecastReturnPct! >= 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-rose-500/10 text-rose-400',
            )}
          >
            {returnLine}
          </span>
        )}

        {/* Primary reason — truncated on mobile */}
        <p className="flex-1 truncate text-sm text-[var(--cb-text-muted)]">
          {stock.primaryReason}
        </p>

        {/* Mock badge */}
        {stock.meta.dataSource === 'mock' && (
          <span className="hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--cb-text-muted)] ring-1 ring-[var(--cb-border)] sm:inline">
            est.
          </span>
        )}

        {/* Expand toggle */}
        <span className="ml-1 shrink-0 text-[var(--cb-text-muted)]">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-[var(--cb-border-subtle)] px-5 pb-5 pt-4">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Score breakdown */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
                Score Breakdown
              </p>
              {(Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map(key => (
                <ScoreBar
                  key={key}
                  label={`${COMPONENT_LABELS[key]} (${Math.round(WEIGHTS[key] * 100)}%)`}
                  value={stock.breakdown[key]}
                />
              ))}
            </div>

            {/* Narrative */}
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
                  Bull Case
                </p>
                <div className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <p className="text-sm text-[var(--cb-text-body)]">{stock.primaryReason}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
                  Key Risk
                </p>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-sm text-[var(--cb-text-body)]">{stock.mainRisk}</p>
                </div>
              </div>
              <div className="rounded-lg bg-[var(--cb-surface-subtle)] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                  Meta
                </p>
                <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
                  {stock.meta.catalystCount} catalyst{stock.meta.catalystCount !== 1 ? 's' : ''} ·{' '}
                  {stock.horizonWeeks}w horizon ·{' '}
                  {stock.meta.dataSource === 'mock' ? 'estimated data' : 'live data'}
                </p>
              </div>
              <Link
                href={`/analyst-chat?${chatParams.toString()}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--cb-border-strong)] bg-[var(--cb-surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--cb-text-primary)] transition-colors hover:bg-[var(--cb-surface)]"
              >
                Open Analyst Chat
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
