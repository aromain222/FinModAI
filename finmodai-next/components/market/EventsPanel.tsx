'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExpandableCard from '@/components/news/ExpandableCard';
import { buildMarketEventModelCreateHref } from '@/lib/model-events/marketEventPrefill';
import {
  buildCompactModelImpactPreview,
  formatSuggestionChip,
  transcribeEventForModeling,
} from '@/lib/model-events/transcribeEventForModeling';
import {
  marketEventsApiResponseSchema,
  type MarketEventsApiResponse,
  type MarketEventsProvider,
  type MarketEvent,
  type MarketEventsView,
} from '@/lib/news/marketEventsTypes';

const VIEW_OPTIONS: Array<{ key: MarketEventsView; label: string }> = [
  { key: 'active', label: 'Active Events' },
  { key: 'resolved', label: 'Resolved' },
];

const EVENT_FILTERS: Array<{ label: string; value: MarketEvent['eventType'] | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Geopolitics', value: 'Geopolitics' },
  { label: 'Macro', value: 'Macro' },
  { label: 'Central Bank', value: 'CentralBank' },
  { label: 'Conflict', value: 'Conflict' },
  { label: 'Sanctions', value: 'Sanctions' },
  { label: 'Systemic Risk', value: 'SystemicRisk' },
  { label: 'Regulatory Shock', value: 'RegulatoryShock' },
  { label: 'Earnings (Mega-cap)', value: 'EarningsMegaCap' },
];

const EVENT_TYPE_STYLES: Record<MarketEvent['eventType'], string> = {
  Geopolitics: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  Macro: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
  CentralBank: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
  Conflict: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  Sanctions: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  EarningsMegaCap: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  SystemicRisk: 'border-red-500/30 bg-red-500/10 text-red-200',
  RegulatoryShock: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
};

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function severityBadgeClass(severity: number): string {
  if (severity >= 85) return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (severity >= 70) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
}

function finalScore(event: MarketEvent): number {
  return event.severity;
}

function tabButtonClass(active: boolean): string {
  return active
    ? 'h-7 border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-2 text-xs'
    : 'h-7 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800/60 px-2 text-xs';
}

const MARKET_IMPACT_ORDER: Array<keyof MarketEvent['marketImpact']> = [
  'equities',
  'rates',
  'fx',
  'oil',
  'credit',
  'sectors',
];

function formatImpactLabel(key: keyof MarketEvent['marketImpact']): string {
  switch (key) {
    case 'fx':
      return 'FX';
    case 'oil':
      return 'Oil';
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function buildEventModelImpactPreview(event: MarketEvent) {
  const leadSource = event.sources[0];
  const rawEventText = [
    event.title,
    ...event.drivers,
    ...event.transmissionPath,
    ...MARKET_IMPACT_ORDER.map((key) => String(event.marketImpact[key] ?? '')).filter(Boolean),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');

  const transcription = transcribeEventForModeling({
    event: {
      sourceType: 'feed_item',
      eventId: event.id,
      title: event.title,
      rawEventText,
      publishedAt: leadSource?.publishedAt ?? event.lastUpdatedAt,
      sourceUrl: leadSource?.url ?? null,
      sourceLabel: leadSource?.name ?? leadSource?.title ?? null,
      impactedTickers: [],
      impactedSectors: event.marketImpact.sectors ? [event.marketImpact.sectors] : [],
      horizon: event.horizon,
      severity: event.severity,
    },
  }).transcription;

  return buildCompactModelImpactPreview(transcription);
}

function CompactModelImpactPreview(props: {
  summary: string;
  suggestions: string[];
  impacts: string[];
}) {
  return (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">AI model impact</div>
      <p className="mt-1 text-xs leading-5 text-zinc-200">{props.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {props.impacts.slice(0, 3).map((impact) => (
          <span
            key={impact}
            className="rounded-full border border-zinc-700/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300"
          >
            {impact}
          </span>
        ))}
        {props.suggestions.slice(0, 3).map((suggestion) => (
          <span
            key={suggestion}
            className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200"
          >
            {suggestion}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function EventsPanel() {
  const [view, setView] = useState<MarketEventsView>('active');
  const [eventFilter, setEventFilter] = useState<MarketEvent['eventType'] | 'all'>('all');
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [provider, setProvider] = useState<MarketEventsProvider>('live');
  const [providerMode, setProviderMode] = useState<MarketEventsProvider>('live');
  const [debugMode, setDebugMode] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<MarketEventsApiResponse['diagnostics']>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setMessage(null);
    try {
      const query = new URLSearchParams({
        view,
        limit: '20',
        provider: providerMode,
      });
      if (debugMode) query.set('debug', '1');
      if (opts?.force) query.set('force', '1');

      const response = await fetch(`/api/market/events?${query.toString()}`, { cache: 'no-store' });
      const raw = await response.json();
      const parsed = marketEventsApiResponseSchema.safeParse(raw);

      if (!response.ok || !parsed.success) {
        setEvents([]);
        setProvider('live');
        setFallback(false);
        setDiagnostics(undefined);
        setError(parsed.success ? parsed.data.error || 'Failed to load events.' : 'Invalid events payload.');
        return;
      }

      setEvents(parsed.data.events);
      setProvider(parsed.data.provider || 'live');
      setFallback(Boolean(parsed.data.fallback));
      setWarning(parsed.data.warning || null);
      setMessage(parsed.data.message || null);
      setDiagnostics(parsed.data.diagnostics);
    } catch (requestError) {
      setEvents([]);
      setProvider('live');
      setFallback(false);
      setDiagnostics(undefined);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [view, providerMode, debugMode]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    const selected = eventFilter === 'all' ? events : events.filter((event) => event.eventType === eventFilter);
    return selected
      .slice()
      .sort((a, b) => (b.severity - a.severity) || (new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()));
  }, [eventFilter, events]);

  useEffect(() => {
    if (!filteredEvents.length) {
      setExpandedId(null);
      return;
    }
    setExpandedId((current) => (current && filteredEvents.some((event) => event.id === current) ? current : filteredEvents[0].id));
  }, [filteredEvents]);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-zinc-800/50 bg-zinc-900/25">
      <div className="border-b border-zinc-800/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Market-Moving Events</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
              <span>Provider: {provider}</span>
              <span>•</span>
              <span>{filteredEvents.length} events</span>
              {fallback && (
                <>
                  <span>•</span>
                  <span className="text-amber-300">Demo Seed Mode</span>
                </>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void fetchEvents({ force: true })}>
            Refresh
          </Button>
        </div>

        {provider === 'demo-seed' && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Demo Seed Mode — not live intelligence.
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className={tabButtonClass(providerMode === 'live')}
            onClick={() => setProviderMode('live')}
          >
            Live
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={tabButtonClass(providerMode === 'demo-seed')}
            onClick={() => setProviderMode('demo-seed')}
          >
            Demo Seed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={tabButtonClass(debugMode)}
            onClick={() => setDebugMode((current) => !current)}
          >
            Debug {debugMode ? 'On' : 'Off'}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {VIEW_OPTIONS.map((option) => (
            <Button
              key={`events-view-${option.key}`}
              size="sm"
              variant="outline"
              className={tabButtonClass(view === option.key)}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EVENT_FILTERS.map((option) => (
            <Button
              key={`events-filter-${option.value}`}
              size="sm"
              variant="outline"
              className={tabButtonClass(eventFilter === option.value)}
              onClick={() => setEventFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-20 animate-pulse rounded-md border border-zinc-800/30 bg-zinc-900/25" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && provider === 'live' && filteredEvents.length === 0 && (
          <div className="rounded-md border border-zinc-700/50 bg-zinc-900/50 px-3 py-3 text-xs">
            <div className="font-medium text-zinc-200">No market-moving events detected</div>
            <div className="mt-1 text-zinc-400">{message || warning || 'No events passed filters.'}</div>
            <div className="mt-2 text-zinc-500">
              The 8 structured example events you asked for are available under <span className="text-zinc-300">Demo Seed</span>, not Live mode.
            </div>
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setProviderMode('demo-seed')}
              >
                Show Demo Seed Events
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && provider === 'demo-seed' && filteredEvents.length === 0 && (
          <div className="rounded-md border border-zinc-800/40 px-3 py-2 text-xs text-zinc-400">
            Demo seed returned 0 events for current filters.
          </div>
        )}

        {!loading && !error && debugMode && diagnostics && (
          <details className="rounded-md border border-zinc-800/50 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300">
            <summary className="cursor-pointer font-medium text-zinc-200">Diagnostics</summary>
            <div className="mt-2 space-y-1 text-zinc-400">
              <div>fetched: {diagnostics.fetched}</div>
              <div>deduped: {diagnostics.deduped ?? 0}</div>
              <div>gated: {diagnostics.gated}</div>
              <div>clustered: {diagnostics.clustered}</div>
              <div>classified: {diagnostics.classified}</div>
              <div>stored: {diagnostics.stored}</div>
              <div>returned: {diagnostics.returned ?? 0}</div>
              <div>cacheHit: {String(diagnostics.cacheHit)}</div>
              <div>openaiCallCount: {diagnostics.openaiCallCount}</div>
              <div>schemaParseFailures: {diagnostics.schemaParseFailures}</div>
              {!!diagnostics.openaiErrors?.length && <div>openaiErrors: {diagnostics.openaiErrors.join(' | ')}</div>}
            </div>
          </details>
        )}

        {!loading &&
          !error &&
          filteredEvents.map((event) => {
            const score = finalScore(event);
            const modelImpactPreview = buildEventModelImpactPreview(event);
            return (
              <ExpandableCard
                key={event.id}
                isOpen={expandedId === event.id}
                onToggle={() => setExpandedId((current) => (current === event.id ? null : event.id))}
                header={
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${EVENT_TYPE_STYLES[event.eventType]}`}>
                        {event.eventType}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${severityBadgeClass(event.severity)}`}>
                        Severity {event.severity}
                      </span>
                      <span className="rounded-full border border-zinc-700/60 px-2 py-0.5 text-[10px] text-zinc-300">
                        {event.horizon}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-zinc-100">{event.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span>Score {score}</span>
                      <span>•</span>
                      <span className="capitalize">{event.status}</span>
                      <span>•</span>
                      <span>Updated {formatTime(event.lastUpdatedAt)}</span>
                    </div>
                  </>
                }
              >
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Drivers</div>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
                    {event.drivers.map((bullet, idx) => (
                      <li key={`${event.id}-driver-${idx}`}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <CompactModelImpactPreview
                  summary={modelImpactPreview.summary}
                  impacts={modelImpactPreview.impacts.map((impact) => impact.label)}
                  suggestions={modelImpactPreview.suggestions.map((suggestion) => formatSuggestionChip(suggestion))}
                />

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Market Impact</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MARKET_IMPACT_ORDER.filter((key) => Boolean(event.marketImpact[key])).map((key) => (
                      <div
                        key={`${event.id}-impact-${key}`}
                        className="rounded-md border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-2"
                      >
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                          {formatImpactLabel(key)}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-zinc-300">{event.marketImpact[key]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <details className="rounded-md border border-zinc-800/50 bg-zinc-900/35 px-3 py-2">
                  <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400/70">
                    Transmission Path
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
                    {event.transmissionPath.map((path, idx) => (
                      <li key={`${event.id}-path-${idx}`}>{path}</li>
                    ))}
                  </ul>
                </details>

                <details className="rounded-md border border-zinc-800/50 bg-zinc-900/35 px-3 py-2">
                  <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400/70">
                    Watch Next
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
                    {event.watchNext.map((bullet, idx) => (
                      <li key={`${event.id}-watch-${idx}`}>{bullet}</li>
                    ))}
                  </ul>
                </details>

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Sources</div>
                  <div className="space-y-1">
                    {event.sources.slice(0, 8).map((source, idx) => (
                      <a
                        key={`${event.id}-source-${idx}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-sky-300 hover:text-sky-200"
                        title={source.title}
                      >
                        {host(source.url)} · {source.title || source.name} · {formatTime(source.publishedAt)}
                      </a>
                    ))}
                  </div>
                </div>

                {event.sources[0] && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={buildMarketEventModelCreateHref(event)}
                      className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
                    >
                      Apply to model
                    </Link>
                    <a
                      href={event.sources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                    >
                      Open lead source <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </ExpandableCard>
            );
          })}
      </div>
    </div>
  );
}
