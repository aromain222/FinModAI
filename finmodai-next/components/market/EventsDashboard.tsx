'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCcw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { computeProbabilities, type ScenarioProbabilities } from '@/lib/probabilityModel';
import { MACRO_CALENDAR, isPastEntry, type MacroCalendarEntry } from '@/lib/macroCalendar';
import {
  calendarReadThrough,
  computeEventSurprise,
  expectedMarketReaction,
  interpretEvent,
  preReleaseSetup,
} from '@/lib/events/interpretation';
import {
  marketEventsApiResponseSchema,
  type MarketEvent,
  type MarketEventsApiResponse,
  type MarketEventsView,
} from '@/lib/news/marketEventsTypes';

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_FILTERS: Array<{ label: string; value: MarketEvent['eventType'] | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Geopolitics', value: 'Geopolitics' },
  { label: 'Macro', value: 'Macro' },
  { label: 'Central Bank', value: 'CentralBank' },
  { label: 'Conflict', value: 'Conflict' },
  { label: 'Sanctions', value: 'Sanctions' },
  { label: 'Systemic Risk', value: 'SystemicRisk' },
  { label: 'Regulatory Shock', value: 'RegulatoryShock' },
  { label: 'Earnings', value: 'EarningsMegaCap' },
];

const EVENT_TYPE_STYLES: Record<MarketEvent['eventType'], string> = {
  Geopolitics:     'border-sky-500/30 bg-sky-500/10 text-sky-200',
  Macro:           'border-violet-500/30 bg-violet-500/10 text-violet-200',
  CentralBank:     'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
  Conflict:        'border-rose-500/30 bg-rose-500/10 text-rose-200',
  Sanctions:       'border-amber-500/30 bg-amber-500/10 text-amber-200',
  EarningsMegaCap: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  SystemicRisk:    'border-red-500/30 bg-red-500/10 text-red-200',
  RegulatoryShock: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
};

const TYPE_ABBR: Record<MarketEvent['eventType'], string> = {
  Geopolitics:     'GEO',
  Macro:           'MACRO',
  CentralBank:     'CB',
  Conflict:        'CONFLICT',
  Sanctions:       'SANCT',
  EarningsMegaCap: 'EARN',
  SystemicRisk:    'SYS',
  RegulatoryShock: 'REG',
};

const ASSET_KEYS: Array<keyof MarketEvent['marketImpact']> = ['equities', 'rates', 'fx', 'oil', 'credit'];
const ASSET_LABELS: Record<keyof MarketEvent['marketImpact'], string> = {
  equities: 'EQ', rates: 'RT', fx: 'FX', oil: 'OIL', credit: 'CR', sectors: 'SEC',
};

const IMPORTANCE_DOT: Record<MacroCalendarEntry['importance'], string> = {
  high:   'bg-rose-500',
  medium: 'bg-amber-500',
  low:    'bg-zinc-500',
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function deriveEventProbabilities(severity: number): ScenarioProbabilities {
  const valuation_gap = -(severity / 100) * 0.15;
  return computeProbabilities({
    valuation_gap,
    event_scores:  [severity / 100],
    scenario_skew: -valuation_gap,
    volatility:    0.5,
  });
}

function parseImpactDirection(text: string | undefined): 'up' | 'down' | 'neutral' {
  if (!text) return 'neutral';
  if (/↑|rise|higher|positive|rally|support|boost/i.test(text)) return 'up';
  if (/↓|fall|lower|negative|pressure|sell|weaken/i.test(text)) return 'down';
  return 'neutral';
}

function deriveRegime(avgSeverity: number | null): 'risk_off' | 'risk_on' | 'neutral' {
  if (avgSeverity === null) return 'neutral';
  if (avgSeverity > 75) return 'risk_off';
  if (avgSeverity < 40) return 'risk_on';
  return 'neutral';
}

function sevTextColor(s: number) {
  return s >= 85 ? 'text-red-400' : s >= 70 ? 'text-amber-400' : 'text-sky-400';
}
function sevBarColor(s: number) {
  return s >= 85 ? 'bg-red-500' : s >= 70 ? 'bg-amber-500' : 'bg-sky-500';
}

function formatCalendarValue(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—';
}

function formatCalendarDetailValue(value: string | null | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

function formatSurprise(event: MacroCalendarEntry): string {
  if (!event.actual) return 'Watch actual vs forecast';
  const surprise = computeEventSurprise(event);
  if (surprise === null) return 'Not comparable';
  const sign = surprise > 0 ? '+' : '';
  const suffix = event.actual.includes('%') || event.forecast?.includes('%') ? 'ppt' : '';
  return `${sign}${surprise.toFixed(2)}${suffix}`;
}

function formatActualStatus(entry: MacroCalendarEntry, isPast: boolean): string {
  if (entry.actual) return formatCalendarValue(entry.actual);
  return isPast ? 'Actual unavailable' : 'Not released yet';
}

function formatSurpriseStatus(entry: MacroCalendarEntry, isPast: boolean): string {
  if (entry.actual) return formatSurprise(entry);
  return isPast ? 'Provider missing actual' : 'Watch actual vs forecast';
}

function calendarBiasClass(bias: 'hawkish' | 'dovish' | 'neutral'): string {
  if (bias === 'hawkish') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (bias === 'dovish') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  return 'border-zinc-700/50 bg-zinc-900/70 text-zinc-300';
}

function calendarImportanceClass(importance: MacroCalendarEntry['importance'], isOpen: boolean): string {
  if (importance === 'high') {
    return isOpen
      ? 'border-amber-500/40 bg-amber-500/[0.08]'
      : 'border-amber-500/20 bg-zinc-950/40 hover:bg-amber-500/[0.04]';
  }
  return isOpen
    ? 'border-zinc-700/70 bg-zinc-900/50'
    : 'border-zinc-800/40 bg-zinc-950/30 hover:bg-zinc-900/35';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MarketRegimeBar({
  regime, avgSeverity, eventCount, onRefresh, loading, isDemo,
}: {
  regime: 'risk_off' | 'risk_on' | 'neutral';
  avgSeverity: number | null;
  eventCount: number;
  onRefresh: () => void;
  loading: boolean;
  isDemo: boolean;
}) {
  const cfg = {
    risk_off: { label: 'RISK OFF', dot: 'bg-rose-400 animate-pulse',    border: 'border-rose-500/30',    bg: 'bg-rose-500/5',    text: 'text-rose-300' },
    risk_on:  { label: 'RISK ON',  dot: 'bg-emerald-400',               border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300' },
    neutral:  { label: 'NEUTRAL',  dot: 'bg-zinc-400',                  border: 'border-zinc-700/50',    bg: 'bg-zinc-900/40',   text: 'text-zinc-300' },
  }[regime];

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
        <span className={`text-xs font-mono font-bold tracking-[0.2em] ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="h-3.5 w-px bg-zinc-700/50" />
      <span className="text-[10px] font-mono text-zinc-500">
        AVG SEVERITY: <span className="tabular-nums text-zinc-300">{avgSeverity !== null ? avgSeverity : '—'}</span>
      </span>
      <div className="h-3.5 w-px bg-zinc-700/50" />
      <span className="text-[10px] font-mono text-zinc-500">
        <span className="tabular-nums text-zinc-300">{eventCount}</span> ACTIVE EVENTS
      </span>
      {isDemo && (
        <>
          <div className="h-3.5 w-px bg-zinc-700/50" />
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wide text-amber-400">
            DEMO DATA
          </span>
        </>
      )}
      <div className="ml-auto">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-900/50 px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        >
          <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function AssetImpactCell({ marketImpact }: { marketImpact: MarketEvent['marketImpact'] }) {
  return (
    <div className="flex items-center gap-1">
      {ASSET_KEYS.map((key) => {
        const dir = parseImpactDirection(marketImpact[key] ?? undefined);
        const s = {
          up:      { cls: 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400', sym: '↑' },
          down:    { cls: 'bg-rose-500/15 border-rose-500/20 text-rose-400',          sym: '↓' },
          neutral: { cls: 'bg-zinc-800/60 border-zinc-700/30 text-zinc-600',          sym: '→' },
        }[dir];
        return (
          <div
            key={key}
            title={`${ASSET_LABELS[key]}: ${marketImpact[key] ?? 'No data'}`}
            className={`flex h-5 w-7 items-center justify-center rounded border text-[8px] font-mono font-bold ${s.cls}`}
          >
            {s.sym}
          </div>
        );
      })}
    </div>
  );
}

function firstAvailableImpact(event: MarketEvent): string {
  const key = ASSET_KEYS.find((assetKey) => Boolean(event.marketImpact[assetKey]));
  return key && event.marketImpact[key]
    ? `${ASSET_LABELS[key]}: ${event.marketImpact[key]}`
    : event.drivers[0] ?? 'Market impact absorbed; no fresh cross-asset signal.';
}

function resolvedReadThrough(event: MarketEvent): {
  outcome: string;
  whatChanged: string;
  watch: string;
} {
  const sourceLabel = event.sources[0]?.name ? ` Source: ${event.sources[0].name}.` : '';
  const outcome =
    event.drivers[0] ??
    `${event.eventType} event has moved out of the active tape; the immediate market impulse has faded.`;
  const whatChanged =
    firstAvailableImpact(event).replace(/\s+/g, ' ').trim() ||
    'The market absorbed the headline without a clear new pricing channel.';
  const watch =
    event.watchNext[0] ??
    'Watch whether the same theme returns with new data, policy language, or price action.';

  return {
    outcome: `${outcome}${sourceLabel}`,
    whatChanged,
    watch,
  };
}

function ScenarioProbCell({ probs }: { probs: ScenarioProbabilities }) {
  const bars = [
    { label: 'B↑', color: 'bg-[#00e387]', textColor: 'text-[#00e387]', value: probs.bull_prob },
    { label: 'B=', color: 'bg-zinc-500',   textColor: 'text-zinc-400',  value: probs.base_prob },
    { label: 'B↓', color: 'bg-rose-500',   textColor: 'text-rose-400',  value: probs.bear_prob },
  ] as const;
  return (
    <div className="space-y-0.5">
      {bars.map(({ label, color, textColor, value }) => (
        <div key={label} className="flex items-center gap-1">
          <span className={`w-5 shrink-0 text-[8px] font-mono ${textColor}`}>{label}</span>
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
          </div>
          <span className={`w-7 shrink-0 text-right text-[8px] font-mono tabular-nums ${textColor}`}>
            {Math.round(value * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function EventMonitorRow({
  event, probs, view,
}: {
  event: MarketEvent;
  probs: ScenarioProbabilities;
  view: MarketEventsView;
}) {
  if (view === 'resolved') {
    const readThrough = resolvedReadThrough(event);
    return (
      <Link
        href={`/events/${encodeURIComponent(event.id)}?view=${view}`}
        className="grid grid-cols-[80px_48px_minmax(220px,1.1fr)_minmax(220px,1fr)_minmax(180px,0.8fr)] items-center gap-2 border-b border-zinc-800/40 px-3 py-3 transition-colors hover:bg-zinc-900/30"
      >
        <div>
          <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wide ${EVENT_TYPE_STYLES[event.eventType]}`}>
            {TYPE_ABBR[event.eventType]}
          </span>
        </div>
        <div className="text-right">
          <div className={`text-xs font-mono font-semibold tabular-nums ${sevTextColor(event.severity)}`}>
            {event.severity}
          </div>
          <div className="mt-0.5 h-0.5 w-full rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${sevBarColor(event.severity)}`} style={{ width: `${event.severity}%` }} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-zinc-200">{event.title}</div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-500">{readThrough.outcome}</div>
        </div>
        <div className="min-w-0 text-[11px] leading-4 text-zinc-300">
          {readThrough.whatChanged}
        </div>
        <div className="min-w-0 text-[10px] leading-4 text-zinc-500">
          {readThrough.watch}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/events/${encodeURIComponent(event.id)}?view=${view}`}
      className="grid grid-cols-[80px_48px_1fr_90px_175px_190px] items-center gap-2 border-b border-zinc-800/40 px-3 py-3 transition-colors hover:bg-zinc-900/30"
    >
      <div>
        <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wide ${EVENT_TYPE_STYLES[event.eventType]}`}>
          {TYPE_ABBR[event.eventType]}
        </span>
      </div>
      <div className="text-right">
        <div className={`text-xs font-mono font-semibold tabular-nums ${sevTextColor(event.severity)}`}>
          {event.severity}
        </div>
        <div className="mt-0.5 h-0.5 w-full rounded-full bg-zinc-800">
          <div className={`h-full rounded-full ${sevBarColor(event.severity)}`} style={{ width: `${event.severity}%` }} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-zinc-200">{event.title}</div>
        {event.drivers[0] && (
          <div className="mt-0.5 truncate text-[10px] text-zinc-500">{event.drivers[0]}</div>
        )}
      </div>
      <div>
        <span className="inline-flex rounded border border-zinc-700/40 bg-zinc-900/60 px-2 py-0.5 text-[9px] font-mono text-zinc-400">
          {event.horizon}
        </span>
      </div>
      <AssetImpactCell marketImpact={event.marketImpact} />
      <ScenarioProbCell probs={probs} />
    </Link>
  );
}

function EventMonitorGrid({
  events, probabilities, view, loading, error,
}: {
  events: MarketEvent[];
  probabilities: Record<string, ScenarioProbabilities>;
  view: MarketEventsView;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/40">
      {view === 'resolved' ? (
        <div className="grid grid-cols-[80px_48px_minmax(220px,1.1fr)_minmax(220px,1fr)_minmax(180px,0.8fr)] gap-2 border-b border-zinc-800/60 bg-zinc-950/60 px-3 py-2">
          {['TYPE', 'SEV', 'OUTCOME', 'WHAT CHANGED', 'WATCH NEXT'].map((col) => (
            <div key={col} className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">{col}</div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[80px_48px_1fr_90px_175px_190px] gap-2 border-b border-zinc-800/60 bg-zinc-950/60 px-3 py-2">
          {['TYPE', 'SEV', 'EVENT', 'HORIZON', 'ASSETS', 'PROBS'].map((col) => (
            <div key={col} className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">{col}</div>
          ))}
        </div>
      )}
      {loading && (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse border-b border-zinc-800/30 bg-zinc-900/20" />
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="border border-rose-500/20 bg-rose-500/5 px-4 py-3 font-mono text-xs text-rose-300">
          {error}
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="px-4 py-8 text-center font-mono text-xs tracking-widest text-zinc-700">
          NO MARKET-MOVING EVENTS DETECTED
        </div>
      )}
      {!loading && !error && events.map((event) => (
        <EventMonitorRow
          key={event.id}
          event={event}
          probs={probabilities[event.id]}
          view={view}
        />
      ))}
    </div>
  );
}

type CalendarActual = { actual: string; estimate: string | null; surpriseNum: number | null };

function surpriseLabel(
  surpriseNum: number | null,
  type: MacroCalendarEntry['type'],
): string {
  if (surpriseNum === null) return 'Not comparable';
  if (Math.abs(surpriseNum) < 0.005) return 'In-line';
  const sign = surpriseNum > 0 ? '+' : '';
  if (type === 'NFP') return `${sign}${Math.round(surpriseNum)}K vs consensus`;
  return `${sign}${surpriseNum.toFixed(2)}ppt vs consensus`;
}

function surprisePillClass(surpriseNum: number | null, type: MacroCalendarEntry['type']): string {
  if (surpriseNum === null) return 'border-zinc-700/40 text-zinc-500';
  // For inflation/rates, higher = hawkish = bad for equities → amber; lower = dovish = good → emerald
  const hawkishOnHigher = type === 'CPI' || type === 'PCE' || type === 'FOMC' || type === 'ECB' || type === 'BOJ';
  if (Math.abs(surpriseNum) < 0.005) return 'border-zinc-600/40 text-zinc-400';
  if (hawkishOnHigher) {
    return surpriseNum > 0
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  // For NFP / GDP: higher = positive
  return surpriseNum > 0
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/30 bg-rose-500/10 text-rose-300';
}

function EconomicCalendar({ today }: { today: Date }) {
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const in7Days = useMemo(() => new Date(today.getTime() + 7 * 86_400_000), [today]);

  const defaultExpandedId = useMemo(() => {
    const upcomingHigh = MACRO_CALENDAR.find((entry) => {
      const entryDate = new Date(entry.date + 'T12:00:00');
      return entry.importance === 'high' && entryDate >= today && entryDate <= in7Days;
    });
    return upcomingHigh?.id ?? null;
  }, [in7Days, today]);

  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(defaultExpandedId);
  const [actuals, setActuals]     = useState<Record<string, CalendarActual>>({});
  const [actualsLoaded, setActualsLoaded] = useState(false);

  useEffect(() => {
    setExpandedEntryId((current) => current ?? defaultExpandedId);
  }, [defaultExpandedId]);

  useEffect(() => {
    fetch('/api/economic-calendar', { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<{ actuals: Record<string, CalendarActual> }> : { actuals: {} })
      .then(data => setActuals(data.actuals ?? {}))
      .catch(() => setActuals({}))
      .finally(() => setActualsLoaded(true));
  }, []);

  // Merge static calendar with API actuals
  const enrichedCalendar = useMemo(() =>
    MACRO_CALENDAR.map(entry => {
      const fetched = actuals[entry.id];
      return fetched
        ? { ...entry, actual: entry.actual ?? fetched.actual, _apiActual: fetched }
        : { ...entry, _apiActual: null as CalendarActual | null };
    }),
    [actuals],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/40">
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">Economic Calendar</span>
        {!actualsLoaded && (
          <span className="text-[9px] font-mono text-zinc-700 animate-pulse">Loading results…</span>
        )}
      </div>
      <div className="grid grid-cols-[80px_1fr_minmax(220px,1.25fr)_170px_90px] gap-2 border-b border-zinc-800/50 bg-zinc-950/60 px-4 py-2">
        {['DATE', 'EVENT', 'SETUP / RESULT', 'WATCH', 'IMPORTANCE'].map((col) => (
          <div key={col} className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">{col}</div>
        ))}
      </div>

      {enrichedCalendar.map((entry) => {
        const entryDate   = new Date(entry.date + 'T12:00:00');
        const isPast      = isPastEntry(entry, today);
        const isUpcoming  = !isPast && entryDate <= in7Days;
        const isOpen      = expandedEntryId === entry.id;
        const apiActual   = entry._apiActual;
        const hasActual   = Boolean(entry.actual);
        const setup       = hasActual ? null : preReleaseSetup(entry);
        const readThrough = calendarReadThrough(entry);
        const interpretation = interpretEvent(entry);
        const marketReaction = expectedMarketReaction(entry, interpretation);

        // Surprise display logic
        const surpriseDisplay = (() => {
          if (apiActual?.surpriseNum !== null && apiActual?.surpriseNum !== undefined) {
            return surpriseLabel(apiActual.surpriseNum, entry.type);
          }
          return formatSurpriseStatus(entry, isPast);
        })();

        const actualDisplay = (() => {
          if (entry.actual) return formatCalendarValue(entry.actual);
          if (apiActual?.actual) return apiActual.actual;
          if (isPast && actualsLoaded) return 'Result not loaded';
          if (isPast) return 'Loading…';
          return 'Not yet released';
        })();

        const forecastDisplay = (() => {
          if (entry.forecast) return formatCalendarValue(entry.forecast);
          if (apiActual?.estimate) return apiActual.estimate;
          return 'Consensus pending';
        })();

        return (
          <div
            key={entry.id}
            className={`border-b border-zinc-800/30 px-2 py-1.5 last:border-b-0 ${isPast && !hasActual ? 'opacity-60' : ''}`}
          >
            <div className={`overflow-hidden rounded-lg border transition-colors duration-200 ${calendarImportanceClass(entry.importance, isOpen)}`}>
              <button
                type="button"
                onClick={() => setExpandedEntryId((current) => (current === entry.id ? null : entry.id))}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[80px_1fr_minmax(220px,1.25fr)_170px_90px] items-center gap-2 px-2 py-2 text-left"
              >
                {/* Date */}
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                    ▸
                  </span>
                  {isUpcoming && <span className="text-[8px] text-amber-400">★</span>}
                  <span className="text-[10px] font-mono tabular-nums text-zinc-400">{fmt.format(entryDate)}</span>
                </div>

                {/* Event name + result pill for past */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200">{entry.event}</span>
                    {entry.notes && (
                      <span className="text-[9px] text-zinc-600">{entry.notes}</span>
                    )}
                    {entry.importance === 'high' && (
                      <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-amber-300">
                        high signal
                      </span>
                    )}
                  </div>
                  {/* Result badges for past events */}
                  {isPast && (entry.actual ?? apiActual?.actual) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="rounded border border-zinc-700/50 bg-zinc-800/60 px-1.5 py-0.5 text-[9px] font-mono text-zinc-200">
                        {entry.actual ?? apiActual!.actual}
                      </span>
                      {apiActual?.surpriseNum !== null && apiActual?.surpriseNum !== undefined && (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${surprisePillClass(apiActual.surpriseNum, entry.type)}`}>
                          {surpriseLabel(apiActual.surpriseNum, entry.type)}
                        </span>
                      )}
                    </div>
                  )}
                  {isPast && !entry.actual && !apiActual?.actual && actualsLoaded && (
                    <div className="mt-0.5 text-[9px] font-mono text-zinc-700">result not loaded</div>
                  )}
                </div>

                {/* Setup / Post-release read */}
                <div className="min-w-0 pr-2 text-[11px] leading-4 text-zinc-300">
                  {readThrough.setup}
                </div>

                {/* Watch */}
                <div className="text-[10px] leading-4 text-zinc-500">
                  {readThrough.marketWatch}
                </div>

                {/* Importance */}
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[entry.importance]}`} />
                  <span className="text-[9px] font-mono uppercase tracking-wide text-zinc-500">{entry.importance}</span>
                </div>
              </button>

              {/* Expanded detail */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mx-2 mb-2 rounded-lg border border-zinc-700/50 bg-zinc-900/70 p-4">

                    {/* Actual / Forecast / Prior / Surprise grid */}
                    <div className="grid gap-3 sm:grid-cols-4">
                      {[
                        ['Actual',   actualDisplay],
                        ['Forecast', forecastDisplay],
                        ['Prior',    formatCalendarDetailValue(entry.prior, 'Prior unavailable')],
                        ['Surprise', surpriseDisplay],
                      ].map(([label, value]) => (
                        <div
                          key={`${entry.id}-${label}`}
                          className={`rounded-md border px-3 py-2 ${
                            label === 'Actual' && hasActual
                              ? 'border-emerald-800/50 bg-emerald-950/30'
                              : 'border-zinc-800/60 bg-zinc-950/45'
                          }`}
                        >
                          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-600">{label}</div>
                          <div className={`mt-1 text-xs font-mono tabular-nums ${
                            label === 'Actual' && hasActual ? 'text-emerald-200' : 'text-zinc-200'
                          }`}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pre-release setup (future/no-actual events only) */}
                    {setup && (
                      <div className="mt-3 grid gap-2 lg:grid-cols-4">
                        {[
                          ['Base case',        setup.baseCase],
                          ['Bullish surprise', setup.upsideSurprise],
                          ['Bearish surprise', setup.downsideSurprise],
                          ['Watch after',      setup.watchAfterRelease],
                        ].map(([label, value]) => (
                          <div key={`${entry.id}-${label}`} className="rounded-md border border-zinc-800/50 bg-zinc-950/35 px-3 py-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600">{label}</div>
                            <div className="mt-1 text-[11px] leading-4 text-zinc-300">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Why it matters */}
                    <div className="mt-3 rounded-md border border-zinc-800/50 bg-zinc-950/35 px-3 py-2">
                      <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600">Why it matters</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-300">{readThrough.whyItMatters}</div>
                    </div>

                    {/* Interpretation + Market Impact */}
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="rounded-md border border-zinc-800/60 bg-zinc-950/35 px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
                            {hasActual ? 'Post-release read' : 'Interpretation'}
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide ${calendarBiasClass(interpretation.bias)}`}>
                            {interpretation.bias}
                          </span>
                        </div>
                        <div className="text-xs leading-5 text-zinc-300">{interpretation.summary}</div>
                      </div>

                      <div className="rounded-md border border-zinc-800/60 bg-zinc-950/35 px-3 py-3">
                        <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
                          {hasActual ? 'Market read-through' : 'Market Impact'}
                        </div>
                        <div className="text-xs leading-5 text-zinc-300">{marketReaction}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventsDashboard() {
  const [view, setView]               = useState<MarketEventsView>('active');
  const [eventFilter, setEventFilter] = useState<MarketEvent['eventType'] | 'all'>('all');
  const [events, setEvents]           = useState<MarketEvent[]>([]);
  const [debugMode, setDebugMode]     = useState(false);
  const [warning, setWarning]         = useState<string | null>(null);
  const [message, setMessage]         = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<MarketEventsApiResponse['diagnostics']>(undefined);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [isDemo, setIsDemo]           = useState(false);

  const today = useMemo(() => new Date(), []);

  const fetchEvents = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setMessage(null);
    setIsDemo(false);
    try {
      const query = new URLSearchParams({ view, limit: '20', provider: 'live' });
      if (debugMode) query.set('debug', '1');
      if (opts?.force) query.set('force', '1');

      const response = await fetch(`/api/market/events?${query.toString()}`, { cache: 'no-store' });
      const raw = await readJsonResponse(response);
      if (!raw.ok) {
        setEvents([]);
        setDiagnostics(undefined);
        setError(raw.message);
        return;
      }

      const parsed = marketEventsApiResponseSchema.safeParse(raw.data);

      if (!response.ok || !parsed.success) {
        setEvents([]);
        setDiagnostics(undefined);
        setError(parsed.success ? parsed.data.error || 'Failed to load events.' : 'Invalid events payload.');
        return;
      }

      setEvents(parsed.data.events);
      setWarning(parsed.data.warning || null);
      setMessage(parsed.data.message || null);
      setDiagnostics(parsed.data.diagnostics);
    } catch (requestError) {
      setEvents([]);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [debugMode, view]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    const selected = eventFilter === 'all' ? events : events.filter((e) => e.eventType === eventFilter);
    return selected
      .slice()
      .sort((a, b) => b.severity - a.severity || new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
  }, [eventFilter, events]);

  const avgSeverity = useMemo(() => {
    if (filteredEvents.length === 0) return null;
    return Math.round(filteredEvents.reduce((s, e) => s + e.severity, 0) / filteredEvents.length);
  }, [filteredEvents]);

  const regime = useMemo(() => deriveRegime(avgSeverity), [avgSeverity]);

  const eventProbabilities = useMemo(
    () => Object.fromEntries(filteredEvents.map((e) => [e.id, deriveEventProbabilities(e.severity)])),
    [filteredEvents]
  );

  const filterBtn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors ${
      active
        ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
        : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
    }`;

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4 pb-8">

        {/* Header */}
        <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/80 px-5 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-mono font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]">
                  CapitalBase
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Event Monitor</h1>
                <p className="mt-1 text-xs text-zinc-500">
                  Market-moving events · Scenario probabilities · Macro calendar
                </p>
              </div>
              <button
                onClick={() => setDebugMode((d) => !d)}
                className={`rounded-lg border px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${
                  debugMode
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:text-zinc-400'
                }`}
              >
                Debug
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setView('active')}   className={filterBtn(view === 'active')}>ACTIVE</button>
              <button onClick={() => setView('resolved')} className={filterBtn(view === 'resolved')}>RESOLVED</button>
              <div className="h-4 w-px bg-zinc-800" />
              {EVENT_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEventFilter(opt.value)}
                  className={filterBtn(eventFilter === opt.value)}
                >
                  {opt.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Regime bar */}
        <MarketRegimeBar
          regime={regime}
          avgSeverity={avgSeverity}
          eventCount={filteredEvents.length}
          onRefresh={() => void fetchEvents({ force: true })}
          loading={loading}
          isDemo={isDemo}
        />

        {/* Event monitor grid */}
        <EventMonitorGrid
          events={filteredEvents}
          probabilities={eventProbabilities}
          view={view}
          loading={loading}
          error={error}
        />

        {(warning ?? message) && !loading && !error && (
          <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/30 px-4 py-2 font-mono text-[10px] text-zinc-500">
            {warning ?? message}
          </div>
        )}

        {/* Economic calendar */}
        <EconomicCalendar today={today} />

        {/* Debug panel */}
        {debugMode && diagnostics && (
          <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-amber-400">
                Pipeline Diagnostics
              </span>
            </div>
            <div className="grid gap-2 font-mono text-xs text-zinc-300 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ['Fetched',    diagnostics.fetched],
                  ['Deduped',    diagnostics.deduped ?? 0],
                  ['Gated',      diagnostics.gated],
                  ['Clustered',  diagnostics.clustered],
                  ['Classified', diagnostics.classified],
                  ['Returned',   diagnostics.returned ?? 0],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</div>
                  <div className="mt-1 text-zinc-200">{value}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
