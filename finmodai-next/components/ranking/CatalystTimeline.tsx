'use client';

import { useState } from 'react';
import { Calendar, Globe, Zap, BarChart2, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { getUpcomingMacroEvents, daysUntil, fmtEventDate, type MacroEvent } from '@/lib/ranking/macroCal';
import type { RankedCatalyst, RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

type EventInsight = {
  importance: string;
  likelyOutcome: string;
  ifSurprises: string;
};

const EVENT_INSIGHT: Partial<Record<string, EventInsight>> = {
  CPI: {
    importance:    'The single most market-moving data point. Inflation prints directly reprice rate expectations, which drives equity multiples — especially growth names.',
    likelyOutcome: 'Market consensus anchors around the prior trend. A read in-line with expectations is typically a non-event; the tail scenarios move markets.',
    ifSurprises:   'Hot print (above est.) → rate cut hopes fade → multiple compression in growth/tech. Cool print (below est.) → rate cut odds rise → multiple expansion, especially in duration-sensitive sectors.',
  },
  FOMC: {
    importance:    'The Fed\'s rate decision resets the discount rate for all assets. The dot plot and press conference often matter more than the decision itself.',
    likelyOutcome: 'Markets price in the expected move well in advance. The reaction usually hinges on the tone — hawkish surprise compresses multiples; dovish pivot sparks a relief rally.',
    ifSurprises:   'Hawkish hold or hike → growth names sell off, financials benefit. Dovish hold or cut → risk assets rally, REITs and tech lead. Neutral decision with hawkish language can still be negative.',
  },
  NFP: {
    importance:    'Payroll strength signals labor market health, which feeds directly into Fed rate path expectations and consumer spending outlook.',
    likelyOutcome: 'A strong beat (100K+ above est.) historically triggers a risk-off reaction as it reduces odds of near-term rate cuts. A miss raises cut expectations.',
    ifSurprises:   'Strong beat → yields up, growth stocks down, financials up. Weak miss → yields down, growth stocks rally, defensive rotation. "Goldilocks" range (near consensus) → minimal market reaction.',
  },
  PPI: {
    importance:    'Producer prices lead consumer inflation by 1-2 months. A rising PPI signals margin pressure is coming for companies unable to pass costs through.',
    likelyOutcome: 'Watch the core PPI ex-food and energy. Services PPI is increasingly relevant for Fed inflation models.',
    ifSurprises:   'Hot PPI → margin compression warnings for consumer-facing names; rate-cut timeline pushed out. Cool PPI → margin relief expected in forward guidance; supports estimates.',
  },
  GDP: {
    importance:    'GDP confirms or revises the macro growth narrative. A sharp downgrade can trigger recession fear repricing across cyclicals.',
    likelyOutcome: 'Second and final estimates rarely surprise significantly vs. advance read. Market focus shifts to consumption and investment components.',
    ifSurprises:   'Downward revision signals economic slowdown → defensive rotation, rate cut odds rise. Upward revision → cyclicals lead, financials benefit, rate cut timeline extends.',
  },
  'Fed Minutes': {
    importance:    'The minutes reveal disagreement within the committee and the reasoning behind the last decision — useful for gauging future policy flexibility.',
    likelyOutcome: 'Markets look for signs of division: any hawk/dove split on rate path or balance sheet can move yields and reprice equities.',
    ifSurprises:   'Hawkish tone (discussed rate hike, concerned about inflation) → yields up, multiples compress. Dovish tone (discussed cuts, worried about growth) → risk-on, growth names rally.',
  },
  'Jackson Hole': {
    importance:    'The Fed Chair\'s annual speech at Jackson Hole often signals major policy shifts. It\'s one of the highest-impact macro events of the calendar year.',
    likelyOutcome: 'Markets position for a policy signal. The speech can reprice the entire rate curve if the Fed Chair pivots from prior messaging.',
    ifSurprises:   'Any pivot language (hawkish or dovish) relative to market pricing triggers outsized moves. Neutral/expected speech → relief rally as uncertainty clears.',
  },
  'GDP Final': {
    importance:    'The final GDP estimate closes the book on the quarter and sets the official macro narrative for the period.',
    likelyOutcome: 'Rarely diverges materially from the second estimate. Focus shifts to components: strong capex and consumption are positive for corporate earnings.',
    ifSurprises:   'Downward revision to prior quarter growth → macro bears gain confidence, defensives lead. Upward revision → confirms expansion, cyclicals outperform.',
  },
};

function getInsight(evt: MacroEvent): EventInsight {
  return EVENT_INSIGHT[evt.abbr] ?? {
    importance:    evt.description,
    likelyOutcome: 'Watch for consensus vs. actual divergence as the key market-moving signal.',
    ifSurprises:   `A significant surprise on ${evt.name} can shift sector rotation and near-term risk appetite.`,
  };
}

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
  onClick?: () => void;
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
        onClick={() => hasDetail ? setExpanded(v => !v) : onClick?.()}
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
            disabled={disabled || !onClick}
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
  onCatalystClick?: (text: string) => void;
  disabled?: boolean;
};

function MacroEventRow({ evt, stock }: { evt: MacroEvent; stock: RankedStock }) {
  const [open, setOpen] = useState(false);
  const days    = daysUntil(evt.date);
  const ch      = CHANNEL_STYLE[evt.channel] ?? CHANNEL_STYLE.macro;
  const urgent  = days <= 7;
  const insight = getInsight(evt);

  return (
    <div className={cn(
      'overflow-hidden rounded-lg border transition-colors',
      urgent ? 'border-amber-400/25 bg-amber-500/5' : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)]',
    )}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
      >
        {/* Days until badge */}
        <div className={cn('shrink-0 w-10 text-center', urgencyColor(days))}>
          <div className="text-base font-bold tabular-nums leading-none">{days}</div>
          <div className="text-[8px] leading-tight opacity-70">days</div>
        </div>

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
        </div>

        {open
          ? <ChevronDown className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />
        }
      </button>

      {open && (
        <div className="border-t border-[var(--cb-border-subtle)] px-3 pb-3 pt-2.5 space-y-2.5">
          <div>
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--cb-text-muted)]">Why it matters</div>
            <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{insight.importance}</p>
          </div>
          <div>
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--cb-text-muted)]">What to expect</div>
            <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{insight.likelyOutcome}</p>
          </div>
          <div>
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/70">If it surprises</div>
            <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{insight.ifSurprises}</p>
          </div>
          <div className="pt-0.5 text-[10px] text-[var(--cb-text-muted)]">
            Applies to <span className="font-semibold text-[var(--cb-text-primary)]">{stock.ticker}</span> via{' '}
            <span className={cn('font-medium', ch.text)}>{evt.channel}</span> channel.
          </div>
        </div>
      )}
    </div>
  );
}

export function CatalystTimeline({ stock, onCatalystClick, disabled = false }: Props) {
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
          {macroEvents.map((evt) => (
            <MacroEventRow key={evt.date + evt.abbr} evt={evt} stock={stock} />
          ))}
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
                onClick={onCatalystClick ? () => onCatalystClick(`Tell me more about this catalyst: ${c.title}`) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {brief.watchItems.slice(0, 4).map((item, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled || !onCatalystClick}
                onClick={() => onCatalystClick?.(`What's the latest on ${item} and how does it affect ${stock.ticker}?`)}
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
