'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSpecificEventFallbackImage } from '@/lib/macroEventImageQueries';
import {
  marketEventsApiResponseSchema,
  type MarketEvent,
  type MarketEventsApiResponse,
  type MarketEventsProvider,
  type MarketEventsView,
} from '@/lib/news/marketEventsTypes';

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

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

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

function shortSummary(event: MarketEvent): string {
  if (event.drivers[0]) return event.drivers[0];
  const firstImpact = MARKET_IMPACT_ORDER.find((key) => Boolean(event.marketImpact[key]));
  if (firstImpact && event.marketImpact[firstImpact]) return event.marketImpact[firstImpact] as string;
  return 'No summary available.';
}

function asSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatSeriesAsSentence(items: string[], fallback: string, maxItems = 3): string {
  const cleaned = items
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, maxItems);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length === 1) return asSentence(cleaned[0]);
  if (cleaned.length === 2) return asSentence(`${cleaned[0]} and ${cleaned[1]}`);
  return asSentence(`${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`);
}

function cleanImpactText(value: string): string {
  return value.replace(/\bTIME\b\.?/gi, '').replace(/\s+/g, ' ').trim();
}

function buildSummaryParagraph(event: MarketEvent): string {
  const lead = asSentence(shortSummary(event));
  const driverSummary = formatSeriesAsSentence(
    event.drivers.slice(1),
    'The event remains driven by the core catalyst outlined above.',
    2
  );
  const timing =
    event.horizon === 'Immediate'
      ? 'The market is likely to treat this as an immediate tape driver rather than a background issue.'
      : event.horizon === 'NearTerm'
        ? 'The read-through looks most relevant over the next several weeks as investors test whether the initial signal broadens.'
        : 'The setup looks more structural than purely tactical, with the market likely to focus on whether the theme persists beyond the first reaction.';

  return [lead, driverSummary, timing].filter(Boolean).join(' ');
}

function buildWhyItMattersParagraph(event: MarketEvent): string {
  const pathLead = formatSeriesAsSentence(
    event.transmissionPath,
    'The key market question is whether this changes the earnings, policy, or liquidity backdrop in a way that deserves a repricing.',
    2
  );
  const marketFields = MARKET_IMPACT_ORDER
    .filter((key) => Boolean(event.marketImpact[key]) && key !== 'sectors')
    .slice(0, 2)
    .map((key) => `${formatImpactLabel(key)} exposure matters because ${cleanImpactText(String(event.marketImpact[key]))}`);

  const fieldNarrative =
    marketFields.length > 0
      ? formatSeriesAsSentence(
          marketFields,
          'The significance depends on whether investors start revising assumptions for growth, inflation, policy, or cross-asset positioning.',
          2
        )
      : 'The significance depends on whether investors start revising assumptions for growth, inflation, policy, or cross-asset positioning.';

  return [pathLead, fieldNarrative].filter(Boolean).join(' ');
}

function buildMarketImpactParagraph(event: MarketEvent): string {
  const directEffects = MARKET_IMPACT_ORDER
    .filter((key) => Boolean(event.marketImpact[key]) && key !== 'sectors')
    .slice(0, 3)
    .map((key) => `${formatImpactLabel(key)} is most exposed through ${cleanImpactText(String(event.marketImpact[key]))}`);
  const directNarrative = formatSeriesAsSentence(
    directEffects,
    'Direct market effects are mixed and will depend on whether follow-through data confirms the initial move.',
    3
  );

  const horizonSentence =
    event.horizon === 'Immediate'
      ? 'In the near term, investors are likely to trade the first-order beneficiaries and losers before moving to second-order balance-sheet and valuation effects.'
      : event.horizon === 'NearTerm'
        ? 'The next leg of the move will likely depend on whether the theme starts changing earnings expectations, funding conditions, or policy language over the coming weeks.'
        : 'The longer-duration question is whether this becomes embedded in forward estimates, discount rates, or capital allocation decisions rather than remaining a short-lived headline effect.';

  return [directNarrative, horizonSentence].filter(Boolean).join(' ');
}

function buildImpactedSectorsParagraph(event: MarketEvent): string {
  if (event.marketImpact.sectors) {
    const cleaned = cleanImpactText(event.marketImpact.sectors);
    return [
      asSentence(cleaned),
      'The most important distinction is between sectors with pricing power or direct exposure to the catalyst and sectors where higher costs, weaker demand, or tighter financing conditions compress expectations.'
    ].join(' ');
  }

  const combined = `${event.title} ${event.drivers.join(' ')} ${event.transmissionPath.join(' ')}`.toLowerCase();
  const sectors: string[] = [];
  if (/(oil|energy|opec|brent|wti)/.test(combined)) sectors.push('Energy');
  if (/(consumer|retail|travel|airline|transport)/.test(combined)) sectors.push('Consumer and transport');
  if (/(rates|yield|bank|financial)/.test(combined)) sectors.push('Financials');
  if (/(chip|semi|ai|software|cloud)/.test(combined)) sectors.push('Technology');
  if (/(defense|military|aerospace)/.test(combined)) sectors.push('Defense and aerospace');
  return sectors.length
    ? `Most exposed sectors include ${sectors.join(', ')}. The read-through is likely to be differentiated rather than market-wide, with relative winners driven by direct exposure to the catalyst and pressured groups driven by cost, demand, or discount-rate sensitivity.`
    : 'Sector exposure is mixed and depends on follow-through in the underlying catalyst. The market is more likely to separate direct beneficiaries from second-order losers than to reprice every sector evenly.';
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
          sizes="(max-width: 1024px) 100vw, 1200px"
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
        sizes="(max-width: 1024px) 100vw, 1200px"
        src={src}
        alt={alt}
        className="object-cover"
        onError={() => setHidden(true)}
      />
    </div>
  );
}

export default function EventDetailScreen({
  eventId,
  initialProvider = 'demo-seed',
  initialView = 'active',
}: {
  eventId: string;
  initialProvider?: MarketEventsProvider;
  initialView?: MarketEventsView;
}) {
  const [provider] = useState<MarketEventsProvider>(initialProvider);
  const [view] = useState<MarketEventsView>(initialView);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchEvents = useCallback(async (force?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        provider,
        view,
        limit: '20',
      });
      if (force) query.set('force', '1');

      const response = await fetch(`/api/market/events?${query.toString()}`, { cache: 'no-store' });
      const raw = await response.json();
      const parsed = marketEventsApiResponseSchema.safeParse(raw);

      if (!response.ok || !parsed.success) {
        setEvents([]);
        setError(parsed.success ? parsed.data.error || 'Failed to load event.' : 'Invalid event payload.');
        return;
      }

      setEvents(parsed.data.events);
      setMessage(parsed.data.message || null);
      setWarning(parsed.data.warning || null);
    } catch (requestError) {
      setEvents([]);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }, [provider, view]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const event = useMemo(
    () => events.find((item) => item.id === eventId) ?? null,
    [eventId, events]
  );

  const backHref = `/events?provider=${provider}&view=${view}`;
  const hasDemoSeedSource = event?.sources.some((source) => source.name === 'Demo Seed') ?? false;
  const heroImage = hasDemoSeedSource
    ? undefined
    : event?.sources.find((source) => typeof source.imageUrl === 'string' && source.imageUrl.trim())?.imageUrl;
  const fallbackImage = getSpecificEventFallbackImage(event?.title, event?.eventType ?? 'Macro', 'hero');
  const summaryParagraph = event ? buildSummaryParagraph(event) : '';
  const whyItMattersParagraph = event ? buildWhyItMattersParagraph(event) : '';
  const marketImpactParagraph = event ? buildMarketImpactParagraph(event) : '';
  const impactedSectorsParagraph = event ? buildImpactedSectorsParagraph(event) : '';

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [eventId]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-zinc-950 px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-5 pb-6">
        <section className="rounded-3xl border border-zinc-800/70 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(135deg,rgba(9,12,18,1),rgba(8,10,15,0.96))] p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]">CapitalBase</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 lg:text-4xl">Event Detail</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-400">
                Review the full transmission path, market impact, and follow-up triggers for this event.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={backHref}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl border-zinc-700 bg-zinc-950/70 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Events
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="h-10 gap-2 rounded-xl border-zinc-700 bg-zinc-950/70 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
                onClick={() => void fetchEvents(true)}
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </section>

        {loading && (
          <div className="h-96 animate-pulse rounded-3xl border border-zinc-800/60 bg-zinc-900/40" />
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && !event && (
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-zinc-100">Event not found</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {message || warning || 'This event is not in the current provider/view set.'}
            </p>
            <div className="mt-4">
              <Link href={backHref}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl border-zinc-700 bg-zinc-950/70 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
                >
                  Return to Events
                </Button>
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && event && (
          <section className="rounded-3xl border border-zinc-800/70 bg-zinc-950/70 p-5 lg:p-6">
            <EventImage
              src={heroImage}
              alt={event.title}
              fallbackSrc={fallbackImage}
              className="mb-5 aspect-[16/7] w-full rounded-2xl"
            />

            <div className="flex flex-wrap items-center gap-2">
              <InfoChip className={EVENT_TYPE_STYLES[event.eventType]}>{event.eventType}</InfoChip>
              <InfoChip className={severityBadgeClass(event.severity)}>Severity {event.severity}</InfoChip>
              <InfoChip>{event.horizon}</InfoChip>
              <InfoChip className="border-zinc-800 bg-zinc-950/80 text-zinc-400">{event.status}</InfoChip>
            </div>

            <h2 className="mt-4 text-3xl font-semibold leading-tight text-zinc-100">{event.title}</h2>
            <p className="mt-2 text-sm text-zinc-500">Updated {formatTime(event.lastUpdatedAt)}</p>

            <div className="mt-5 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Summary</div>
              <p className="mt-2 text-base leading-8 text-zinc-200">{shortSummary(event)}</p>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Summary</div>
                <p className="mt-2 text-sm leading-7 text-zinc-200">{summaryParagraph}</p>
              </div>

              <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/35 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Why It Matters</div>
                <p className="mt-2 text-sm leading-7 text-zinc-300">{whyItMattersParagraph}</p>
              </div>

              <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Market Impact</div>
                <p className="mt-2 text-sm leading-7 text-zinc-300">{marketImpactParagraph}</p>
              </div>

              <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Impacted Sectors</div>
                <p className="mt-2 text-sm leading-7 text-zinc-300">{impactedSectorsParagraph}</p>
              </div>

              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Sources</div>
                <div className="space-y-2">
                  {event.sources.slice(0, 4).map((source, idx) => (
                    <a
                      key={`${event.id}-source-${idx}`}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-200">{source.title || source.name}</div>
                        <div className="mt-1 truncate text-xs text-zinc-500">
                          {host(source.url)} · {formatTime(source.publishedAt)}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-zinc-500" />
                    </a>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
