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
  stockImpact: string;
};

type StaticInsight = Omit<EventInsight, 'stockImpact'>;

const EVENT_INSIGHT: Partial<Record<string, StaticInsight>> = {
  CPI: {
    importance:    'The highest-frequency rate-expectations repricing event. A 0.1pp surprise above consensus has historically moved S&P 500 futures 0.8–1.5% within 30 minutes of the print.',
    likelyOutcome: 'Consensus expects the current trend to hold. In-line reads are near non-events (±0.3% on S&P). The tails move markets: three consecutive hot prints have historically preceded 8–12% drawdowns in growth names.',
    ifSurprises:   'Hot (+0.2pp above est.): 2Y yields typically jump 10–18bps → P/E compression of 1–2 turns in growth. Cool (−0.2pp): 2Y yields drop 8–14bps → tech/growth leads the bounce, rate-sensitive sectors (REITs, utilities) rally 2–4%.',
  },
  FOMC: {
    importance:    'Resets the risk-free rate anchor for all equity valuations. The dot plot and press conference carry more weight than the decision itself — the market prices the decision; it doesn\'t price the nuance.',
    likelyOutcome: 'The expected decision is fully in the price. Watch for dot plot shifts of ≥25bps from prior projection, which have historically triggered ±1.5–2.5% intraday moves in rate-sensitive equities.',
    ifSurprises:   'Hawkish surprise (fewer cuts in dot plot, hawkish Q&A): financials and energy lead; growth/tech sells off 2–4% same day. Dovish pivot: growth rallies hard — tech outperformed S&P by 3–5% in the 5 sessions after each of the last 3 dovish FOMC pivots.',
  },
  NFP: {
    importance:    'The labor market read is the Fed\'s single most-watched input. A 100K+ beat vs. consensus has pushed 2-year Treasury yields up ~12bps on average and priced out roughly 0.5 expected rate cuts in the next 6 months.',
    likelyOutcome: 'Recent prints have beat by an average of ~40K. A read within ±50K of consensus (the "Goldilocks" band) typically produces a muted reaction — S&P moves ±0.4%. Outside that band, sector rotation is material.',
    ifSurprises:   'Strong beat (+100K+): 2Y yields up 10–15bps → rate-cut odds drop ~20pp → growth/tech sells 1.5–3%; financials outperform. Miss (−75K or worse): recession fears trigger defensive rotation; utilities and consumer staples outperform growth by 2–4% in the following week.',
  },
  PPI: {
    importance:    'Producer prices lead consumer inflation by 6–8 weeks and flow directly into corporate margin guidance. Services PPI (ex-trade) is the Fed\'s preferred leading indicator for sticky inflation — a 0.3pp surprise changes the CPI baseline meaningfully.',
    likelyOutcome: 'Core PPI ex-food and energy is the key line. Hot services PPI has prompted forward guidance reductions of 3–8% on EPS estimates for consumer-facing and labor-intensive businesses in the quarter following the print.',
    ifSurprises:   'Hot PPI (core ex-food/energy +0.4%+): analyst margin assumptions come under pressure → EPS estimates cut 3–6% for pass-through-sensitive names; rate timeline extends. Cool PPI (flat or negative): margin relief narrative builds → gross margin estimates revised up, supports next quarter\'s guide.',
  },
  GDP: {
    importance:    'GDP second estimate rarely diverges more than ±0.3pp from advance. The market-moving content is in the components: consumption (70% of GDP), business investment, and the implicit price deflator — all reprice earnings growth expectations.',
    likelyOutcome: 'If consumption holds near prior read, expect muted reaction (S&P ±0.5%). A downward revision to real final sales of −0.5pp or more has historically triggered defensive rotation of 2–4% vs. cyclicals in the following 5 sessions.',
    ifSurprises:   'Downward revision ≥−0.5pp: cyclical slowdown narrative gains traction → consumer discretionary, industrials underperform; rate-cut odds rise 15–25pp → defensives and REITs benefit. Upward revision with strong capex: confirms expansion → cyclicals lead; cuts priced out → financials outperform.',
  },
  'Fed Minutes': {
    importance:    'The minutes surface committee-level disagreement that the statement obscures. Count the dissents and hawkish/dovish language shifts. Two or more dissenters on rate path have moved 10-year yields 8–15bps on the release.',
    likelyOutcome: 'Watch for three signals: any discussion of additional hikes, language around balance sheet pace, and disagreement on inflation trajectory. The market reaction is usually asymmetric — hawkish surprises in minutes trigger larger moves than dovish ones.',
    ifSurprises:   'Hawkish tone (hike discussion, inflation "not convinced" language): 10Y yields +8–12bps → valuation multiples compress 1–2 turns for high-duration names. Dovish tone (growth concerns, earlier cut discussion): risk assets rally; growth outperforms by 1.5–3% in the following week.',
  },
  'Jackson Hole': {
    importance:    'The single highest-impact discretionary macro event of the year. Powell\'s 2022 Jackson Hole speech triggered a 3.4% S&P decline same day. In 2023, the market moved 1.5% off a single sentence about rates staying "higher for longer."',
    likelyOutcome: 'The speech is prepared in advance and vetted — any pivot from prior Fed messaging is deliberate. Markets typically position cautiously ahead of it, compressing vol and sector moves until the speech drops (~10am ET Friday).',
    ifSurprises:   'Any hawkish pivot vs. market pricing: growth/tech sell-off 2–5%, yields spike. Dovish signal (earlier cuts, growth concerns): risk-on — tech and growth outperform by 3–6% in the week following. "No change" speech typically sparks a relief rally of 0.5–1%.',
  },
  'GDP Final': {
    importance:    'Closes the quarter\'s GDP accounting. Rarely moves markets on the headline (divergence from second estimate averages ±0.1pp), but the component mix — particularly corporate profits — gives a direct read on earnings quality for the quarter.',
    likelyOutcome: 'Corporate profits component (released alongside) is the watchlist item. Profits contracting q/q while revenue grew signals margin compression incoming. Expansionary profits in a slowing-headline GDP quarter is historically bullish for earnings revision cycles.',
    ifSurprises:   'Material downward revision (−0.4pp+): recession narrative strengthens → cyclicals underperform defensives by 2–4% the following week; rate-cut timeline pulled forward. Upward revision with strong profits: confirms cycle durability → cyclicals lead; analysts raise earnings growth assumptions.',
  },
};

function getInsight(evt: MacroEvent, stock: RankedStock): EventInsight {
  const base = EVENT_INSIGHT[evt.abbr];
  const bd = stock.breakdown;
  const sector = stock.meta?.sector ?? stock.meta?.subsector ?? '';
  const sectorNote = sector ? ` (${sector})` : '';

  const stockImpact = (() => {
    switch (evt.channel) {
      case 'estimate': {
        const earningsScore = bd.earningsSetup.toFixed(1);
        const weak = bd.earningsSetup < 5;
        return weak
          ? `${stock.ticker}${sectorNote} has a weak earnings setup (${earningsScore}/10) — a cost-pressure surprise here hits estimates with limited cushion. Watch for forward guidance cuts.`
          : `${stock.ticker}${sectorNote} has a solid earnings setup (${earningsScore}/10) — but a hot print can still reprice forward margins. The catalyst strength score (${bd.catalystStrength.toFixed(1)}/10) determines how fast the street reprices.`;
      }
      case 'multiple': {
        const valScore = bd.valuationSignal.toFixed(1);
        const highForecast = bd.forecastSignal >= 6.5;
        return highForecast
          ? `${stock.ticker}${sectorNote} carries a growth premium (forecast signal ${bd.forecastSignal.toFixed(1)}/10). Rate-driven multiple compression hits growth-priced names hardest — a hawkish surprise can compress the P/E 1–2 turns directly.`
          : `${stock.ticker}'s valuation signal is ${valScore}/10 — a rate surprise reprices this name through the discount rate. ${bd.valuationSignal >= 6 ? 'Cheap valuation provides some buffer against multiple compression.' : 'Limited valuation support amplifies downside if sentiment turns.'}`;
      }
      case 'macro': {
        const momScore = bd.momentum.toFixed(1);
        const highMom = bd.momentum >= 6.5;
        return highMom
          ? `${stock.ticker}${sectorNote} has strong price momentum (${momScore}/10) — macro shocks that break the trend historically trigger 1.5–3x the index move as longs unwind. The risk/vol score (${bd.riskAdjustment.toFixed(1)}/10) sets the stop distance.`
          : `${stock.ticker}'s momentum score is ${momScore}/10. A macro re-rating event could be the catalyst to reprice this setup — the direction of the surprise determines whether it accelerates or reverses the current trend.`;
      }
      case 'risk': {
        const riskScore = bd.riskAdjustment.toFixed(1);
        return `${stock.ticker}'s risk/vol factor scores ${riskScore}/10. Macro risk events directly update this input — a volatile surprise typically widens the bid/ask and compresses sizing for risk-managed portfolios.`;
      }
      default:
        return `Applies to ${stock.ticker} via the ${evt.channel} scoring channel — watch for estimate and multiple revisions in the session following the print.`;
    }
  })();

  if (!base) {
    return {
      importance:    evt.description,
      likelyOutcome: 'Watch for consensus vs. actual divergence as the key market-moving signal.',
      ifSurprises:   `A significant surprise on ${evt.name} can shift sector rotation and near-term risk appetite.`,
      stockImpact,
    };
  }

  return { ...base, stockImpact };
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
  const insight = getInsight(evt, stock);

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
          <div className={cn('rounded-md border px-2.5 py-2', ch.bg, 'border-current/10')}>
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'inherit', opacity: 0.6 }}>
              <span className={ch.text}>For {stock.ticker}</span>
            </div>
            <p className={cn('text-[11px] leading-snug', ch.text)} style={{ opacity: 0.85 }}>{insight.stockImpact}</p>
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
