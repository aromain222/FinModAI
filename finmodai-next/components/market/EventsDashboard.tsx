'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSpecificEventFallbackImage } from '@/lib/macroEventImageQueries';
import {
  marketEventsApiResponseSchema,
  type MarketEvent,
  type MarketEventsApiResponse,
  type MarketEventsProvider,
  type MarketEventsView,
} from '@/lib/news/marketEventsTypes';

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

const MARKET_IMPACT_ORDER: Array<keyof MarketEvent['marketImpact']> = [
  'equities',
  'rates',
  'fx',
  'oil',
  'credit',
  'sectors',
];

const imageLoader = ({ src }: { src: string }) => src;

function tabButtonClass(active: boolean): string {
  return active
    ? 'rounded-xl border border-zinc-600 bg-zinc-800 text-zinc-100'
    : 'rounded-xl border border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200';
}

function severityBadgeClass(severity: number): string {
  if (severity >= 85) return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (severity >= 70) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
}

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

function finalScore(event: MarketEvent): number {
  return event.severity;
}

function InfoChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${className ?? 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}
    >
      {children}
    </span>
  );
}

function EventImage({
  src,
  alt,
  fallbackSrc,
  className,
}: {
  src?: string;
  alt: string;
  fallbackSrc: string;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
  }, [src]);

  if (!src || hidden) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-zinc-800/70 ${className ?? ''}`}>
        <Image
          loader={imageLoader}
          unoptimized
          fill
          sizes="160px"
          src={fallbackSrc}
          alt={alt}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? ''}`}>
      <Image
        loader={imageLoader}
        unoptimized
        fill
        sizes="160px"
        src={src}
        alt={alt}
        className="object-cover"
        onError={() => setHidden(true)}
      />
    </div>
  );
}

function shortSummary(event: MarketEvent): string {
  if (event.drivers[0]) return event.drivers[0];
  const firstImpact = MARKET_IMPACT_ORDER.find((key) => Boolean(event.marketImpact[key]));
  if (firstImpact && event.marketImpact[firstImpact]) return event.marketImpact[firstImpact] as string;
  return 'No summary available.';
}

function EventListItem({
  event,
  href,
}: {
  event: MarketEvent;
  href: string;
}) {
  const leadSource = event.sources.find((source) => typeof source.imageUrl === 'string' && source.imageUrl.trim());
  const isDemoSeed = event.sources.some((source) => source.name === 'Demo Seed');
  const heroImage = isDemoSeed ? undefined : leadSource?.imageUrl;
  const fallbackImage = getSpecificEventFallbackImage(event.title, event.eventType, 'thumb');

  return (
    <Link
      href={href}
      className="block w-full rounded-3xl border border-zinc-800/70 bg-zinc-950/70 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/40"
    >
      <div className="flex items-start gap-4">
        <EventImage
          src={heroImage}
          alt={event.title}
          fallbackSrc={fallbackImage}
          className="aspect-[16/10] w-36 shrink-0 rounded-2xl lg:w-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <InfoChip className={EVENT_TYPE_STYLES[event.eventType]}>{event.eventType}</InfoChip>
            <InfoChip className={severityBadgeClass(event.severity)}>Severity {event.severity}</InfoChip>
            <InfoChip>{event.horizon}</InfoChip>
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-7 text-zinc-100 lg:text-xl">{event.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">{shortSummary(event)}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              {event.status} · Updated {formatTime(event.lastUpdatedAt)}
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300">
              View event
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function EventsDashboard() {
  const [view, setView] = useState<MarketEventsView>('active');
  const [eventFilter, setEventFilter] = useState<MarketEvent['eventType'] | 'all'>('all');
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [provider, setProvider] = useState<MarketEventsProvider>('demo-seed');
  const [providerMode, setProviderMode] = useState<MarketEventsProvider>('demo-seed');
  const [debugMode, setDebugMode] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<MarketEventsApiResponse['diagnostics']>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setDiagnostics(undefined);
        setError(parsed.success ? parsed.data.error || 'Failed to load events.' : 'Invalid events payload.');
        return;
      }

      setEvents(parsed.data.events);
      setProvider(parsed.data.provider || 'live');
      setWarning(parsed.data.warning || null);
      setMessage(parsed.data.message || null);
      setDiagnostics(parsed.data.diagnostics);
    } catch (requestError) {
      setEvents([]);
      setProvider('live');
      setDiagnostics(undefined);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [debugMode, providerMode, view]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    const selected = eventFilter === 'all' ? events : events.filter((event) => event.eventType === eventFilter);
    return selected
      .slice()
      .sort(
        (a, b) =>
          finalScore(b) - finalScore(a) ||
          new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
      );
  }, [eventFilter, events]);
  const averageSeverity = filteredEvents.length
    ? Math.round(filteredEvents.reduce((sum, event) => sum + event.severity, 0) / filteredEvents.length)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-zinc-800/70 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(135deg,rgba(9,12,18,1),rgba(8,10,15,0.96))] p-5 lg:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]">
                  CapitalBase
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 lg:text-4xl">Events</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
                  Scan the event list, then open one thread at a time for the full transmission path and market impact.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {provider}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">
                    {filteredEvents.length} threads
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Avg Severity
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">
                    {averageSeverity !== null ? averageSeverity : '—'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl border-zinc-700 bg-zinc-950/70 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
                  onClick={() => void fetchEvents({ force: true })}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className={`h-9 px-4 text-sm ${tabButtonClass(providerMode === 'live')}`}
                onClick={() => setProviderMode('live')}
              >
                Live
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`h-9 px-4 text-sm ${tabButtonClass(providerMode === 'demo-seed')}`}
                onClick={() => setProviderMode('demo-seed')}
              >
                Demo Seed
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`h-9 px-4 text-sm ${tabButtonClass(view === 'active')}`}
                onClick={() => setView('active')}
              >
                Active
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`h-9 px-4 text-sm ${tabButtonClass(view === 'resolved')}`}
                onClick={() => setView('resolved')}
              >
                Resolved
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`h-9 px-4 text-sm ${tabButtonClass(debugMode)}`}
                onClick={() => setDebugMode((current) => !current)}
              >
                Debug {debugMode ? 'On' : 'Off'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {EVENT_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant="outline"
                  className={`h-9 px-4 text-sm ${tabButtonClass(eventFilter === option.value)}`}
                  onClick={() => setEventFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-5 pb-6">

            {loading && (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-48 animate-pulse rounded-3xl border border-zinc-800/60 bg-zinc-900/40"
                  />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
                {error}
              </div>
            )}

            {!loading && !error && provider === 'live' && filteredEvents.length === 0 && (
              <div className="rounded-3xl border border-zinc-800/70 bg-zinc-950/60 p-6">
                <h2 className="text-xl font-semibold text-zinc-100">No market-moving events detected</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-400">
                  {message || warning || 'No events passed the current live filters.'} If you want to preview the
                  structured examples you specified, switch the provider to Demo Seed.
                </p>
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl border-zinc-700 bg-zinc-950/70 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
                    onClick={() => setProviderMode('demo-seed')}
                  >
                    Show Demo Seed Events
                  </Button>
                </div>
              </div>
            )}

            {!loading && !error && filteredEvents.length > 0 && (
              <section className="space-y-4">
                  {filteredEvents.map((event) => (
                    <EventListItem
                      key={event.id}
                      event={event}
                      href={`/events/${encodeURIComponent(event.id)}?provider=${providerMode}&view=${view}`}
                    />
                  ))}
              </section>
            )}
            {debugMode && diagnostics && (
              <section className="rounded-3xl border border-zinc-800/70 bg-zinc-950/60 p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
                    <Activity className="h-4 w-4 text-[var(--cb-green)]" />
                  </div>
                  <h2 className="text-sm font-semibold text-zinc-100">Diagnostics</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm text-zinc-300">
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Fetched</span><div>{diagnostics.fetched}</div></div>
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Deduped</span><div>{diagnostics.deduped ?? 0}</div></div>
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Gated</span><div>{diagnostics.gated}</div></div>
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Clustered</span><div>{diagnostics.clustered}</div></div>
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Classified</span><div>{diagnostics.classified}</div></div>
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"><span className="text-zinc-500">Returned</span><div>{diagnostics.returned ?? 0}</div></div>
                </div>
              </section>
            )}
        </div>
      </div>
    </div>
  );
}
