'use client';

import { useState } from 'react';
import { Calendar, Globe, Zap, BarChart2, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { getUpcomingMacroEvents, daysUntil, fmtEventDate } from '@/lib/ranking/macroCal';
import type { RankedCatalyst, RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

const CHANNEL_STYLE: Record<string, { bg: string; text: string }> = {
  estimate:    { bg: 'bg-amber-500/15',   text: 'text-amber-300' },
  multiple:    { bg: 'bg-purple-500/15',  text: 'text-purple-300' },
  positioning: { bg: 'bg-blue-500/15',    text: 'text-blue-300' },
  risk:        { bg: 'bg-rose-500/15',    text: 'text-rose-300' },
  macro:       { bg: 'bg-slate-500/15',   text: 'text-slate-300' },
};

const KIND_ICON: Record<string, React.ElementType> = {
  earnings:     Calendar,
  macro:        Globe,
  company_news: Zap,
  event:        BarChart2,
};

const DIRECTION_COLOR: Record<string, string> = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  neutral:  'text-[var(--cb-text-muted)]',
};

function importanceLevel(catalyst: RankedCatalyst): 'high' | 'medium' | 'low' {
  const score = (catalyst.rankScore ?? 0) + Math.abs(catalyst.impactPct) / 10 + (catalyst.confidence ?? 0.5);
  if (score >= 2.0) return 'high';
  if (score >= 1.2) return 'medium';
  return 'low';
}

const IMPORTANCE_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high:   'border-amber-400/40 bg-amber-500/8',
  medium: 'border-slate-400/25 bg-slate-500/8',
  low:    'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)]',
};

function urgencyColor(days: number): string {
  if (days <= 7)  return 'text-amber-300';
  if (days <= 21) return 'text-[var(--cb-text-secondary)]';
  return 'text-[var(--cb-text-muted)]';
}

function CatalystCard({
  catalyst, onClick, disabled,
}: {
  catalyst: RankedCatalyst;
  onClick: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const ch         = CHANNEL_STYLE[catalyst.channel] ?? { bg: 'bg-white/5', text: 'text-[var(--cb-text-muted)]' };
  const Icon       = KIND_ICON[catalyst.kind] ?? Zap;
  const sign       = catalyst.impactPct >= 0 ? '+' : '';
  const label      = catalyst.channel.charAt(0).toUpperCase() + catalyst.channel.slice(1);
  const importance = importanceLevel(catalyst);
  const hasDetail  = !!(catalyst.reason || catalyst.estimateRisk || catalyst.horizon);

  return (
    <div className={cn('rounded-lg border transition-colors', IMPORTANCE_STYLE[importance])}>
      <button
        type="button"
        disabled={disabled && !hasDetail}
        onClick={() => hasDetail ? setExpanded(v => !v) : onClick()}
        className="w-full cursor-pointer p-3 text-left disabled:cursor-not-allowed"
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Icon className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', ch.bg, ch.text)}>
            {label}
          </span>
          <span className={cn('text-[10px] font-semibold tabular-nums', DIRECTION_COLOR[catalyst.direction])}>
            {catalyst.direction === 'positive' ? '↑' : catalyst.direction === 'negative' ? '↓' : '→'}
            {' '}{sign}{catalyst.impactPct.toFixed(1)}%
          </span>
          {catalyst.horizon && (
            <span className="ml-auto text-[9px] text-[var(--cb-text-muted)]">{catalyst.horizon}</span>
          )}
          {hasDetail && (
            <span className="ml-auto shrink-0 text-[var(--cb-text-muted)]">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--cb-text-primary)]">
          {catalyst.title}
        </p>
      </button>
      {expanded && hasDetail && (
        <div className="border-t border-[var(--cb-border-subtle)] px-3 pb-3 pt-2 space-y-1.5">
          {catalyst.reason && (
            <p className="text-[10px] leading-snug text-[var(--cb-text-muted)]">{catalyst.reason}</p>
          )}
          {catalyst.estimateRisk && (
            <p className="text-[10px] leading-snug text-amber-300/70">
              <span className="font-semibold">Estimate risk: </span>{catalyst.estimateRisk}
            </p>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-secondary)] disabled:opacity-50"
          >
            Discuss catalyst →
          </button>
        </div>
      )}
    </div>
  );
}

type Props = {
  stock: RankedStock;
  onCatalystClick: (text: string) => void;
  disabled: boolean;
};

export function CatalystTimeline({ stock, onCatalystClick, disabled }: Props) {
  const catalysts    = (stock.meta.catalysts ?? []).slice(0, 4);
  const brief        = getCompanyBrief(stock.ticker);
  const macroEvents  = getUpcomingMacroEvents(60);

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)] px-4 py-3 space-y-4">

      {/* ── Upcoming events calendar ── */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Clock className="h-3 w-3 text-[var(--cb-text-muted)]" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
            Upcoming Events
          </span>
        </div>

        <div className="space-y-1">
          {macroEvents.map((evt) => {
            const days   = daysUntil(evt.date);
            const ch     = CHANNEL_STYLE[evt.channel] ?? CHANNEL_STYLE.macro;
            const urgent = days <= 7;
            return (
              <button
                key={evt.date + evt.abbr}
                type="button"
                disabled={disabled}
                onClick={() => onCatalystClick(
                  `How does ${evt.name} on ${fmtEventDate(evt.date)} affect ${stock.ticker}? ${evt.description}`
                )}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-[var(--cb-border-strong)] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60',
                  urgent
                    ? 'border-amber-400/25 bg-amber-500/5'
                    : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)]',
                )}
              >
                {/* Days until badge */}
                <div className={cn('shrink-0 w-10 text-center', urgencyColor(days))}>
                  <div className="text-base font-bold tabular-nums leading-none">{days}</div>
                  <div className="text-[8px] leading-tight opacity-70">days</div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-[var(--cb-border)]" />

                {/* Event details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('rounded px-1.5 py-px text-[9px] font-bold tracking-wide', ch.bg, ch.text)}>
                      {evt.abbr}
                    </span>
                    <span className="text-[10px] text-[var(--cb-text-muted)]">{fmtEventDate(evt.date)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--cb-text-primary)]">
                    {evt.name}
                  </p>
                  <p className="truncate text-[10px] text-[var(--cb-text-muted)]">{evt.description}</p>
                </div>

                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Company catalysts ── */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
            Company Catalysts
          </span>
          {catalysts.length === 0 && (
            <span className="text-[9px] text-[var(--cb-text-muted)]">No live catalysts loaded</span>
          )}
        </div>

        {catalysts.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {catalysts.map((c, i) => (
              <CatalystCard
                key={i}
                catalyst={c}
                disabled={disabled}
                onClick={() => onCatalystClick(`Tell me more about this catalyst: ${c.title}`)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {brief.watchItems.slice(0, 4).map((item, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onCatalystClick(`What's the latest on ${item} and how does it affect ${stock.ticker}?`)}
                className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3 text-left transition-colors hover:border-[var(--cb-border)] disabled:opacity-60"
              >
                <div className="mb-1">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                    Watch
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[var(--cb-text-primary)]">{item}</p>
                <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">
                  Monitor for estimate, multiple, or positioning impact.
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
