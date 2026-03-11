'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCcw } from 'lucide-react';
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

function buildInterpretation(event: MarketEvent): string[] {
  const lines: string[] = [];
  const primaryDriver = event.drivers[0] ? asSentence(event.drivers[0]) : '';
  const secondaryDriver = event.drivers[1] ? asSentence(event.drivers[1]) : '';
  const firstPath = event.transmissionPath[0] ? asSentence(event.transmissionPath[0]) : '';
  const firstImpacts = MARKET_IMPACT_ORDER
    .filter((key) => Boolean(event.marketImpact[key]))
    .slice(0, 2)
    .map((key) => `${formatImpactLabel(key)}: ${event.marketImpact[key]}`)
    .join(' ');

  if (primaryDriver || secondaryDriver) {
    lines.push([primaryDriver, secondaryDriver].filter(Boolean).join(' '));
  }

  if (firstPath) {
    lines.push(`The market is trading the event through this path: ${firstPath}`);
  }

  if (firstImpacts) {
    lines.push(`Immediate read-through: ${asSentence(firstImpacts)}`);
  }

  return lines.filter(Boolean);
}

function buildConfirmationNote(event: MarketEvent): string {
  const firstWatch = event.watchNext[0] ? asSentence(event.watchNext[0]) : '';
  const secondWatch = event.watchNext[1] ? asSentence(event.watchNext[1]) : '';
  const severityText =
    event.severity >= 85
      ? 'This is a high-priority setup that should move quickly if the next trigger confirms it.'
      : event.severity >= 70
        ? 'This is a meaningful setup, but it still needs confirmation from the next catalyst.'
        : 'This setup matters, but follow-through will depend on whether the next catalyst validates the move.';

  return [severityText, firstWatch, secondWatch].filter(Boolean).join(' ');
}

type StockMover = {
  ticker: string;
  direction: 'up' | 'down';
  rationale: string;
};

function inferStockMovers(event: MarketEvent): { rising: StockMover[]; falling: StockMover[] } {
  const title = event.title.toLowerCase();
  const drivers = event.drivers.join(' ').toLowerCase();
  const transmission = event.transmissionPath.join(' ').toLowerCase();
  const combined = `${title} ${drivers} ${transmission}`;

  const rising: StockMover[] = [];
  const falling: StockMover[] = [];

  const pushUnique = (bucket: StockMover[], candidate: StockMover) => {
    if (!bucket.some((item) => item.ticker === candidate.ticker)) {
      bucket.push(candidate);
    }
  };

  const addDefenseTheme = () => {
    pushUnique(rising, { ticker: 'PLTR', direction: 'up', rationale: 'Defense software and mission analytics tend to re-rate when procurement urgency rises.' });
    pushUnique(rising, { ticker: 'LMT', direction: 'up', rationale: 'Missile defense and replenishment programs benefit from higher defense spending expectations.' });
    pushUnique(rising, { ticker: 'NOC', direction: 'up', rationale: 'ISR, aerospace, and missile systems gain from multi-year backlog visibility.' });
    pushUnique(falling, { ticker: 'QQQ', direction: 'down', rationale: 'Risk-off geopolitical tape can pressure long-duration growth and broad tech multiples.' });
  };

  const addEnergyTheme = () => {
    pushUnique(rising, { ticker: 'XOM', direction: 'up', rationale: 'Higher geopolitical risk usually supports crude-linked cash flow expectations.' });
    pushUnique(rising, { ticker: 'CVX', direction: 'up', rationale: 'Integrated energy names tend to benefit when oil risk premia rise.' });
    pushUnique(falling, { ticker: 'XLY', direction: 'down', rationale: 'Higher fuel costs and a risk-off tone pressure discretionary demand sensitivity.' });
  };

  const addRatesTheme = () => {
    pushUnique(rising, { ticker: 'UUP', direction: 'up', rationale: 'Higher-for-longer messaging usually supports the U.S. dollar.' });
    pushUnique(rising, { ticker: 'XLF', direction: 'up', rationale: 'Banks can get near-term support from firmer front-end rates and better NII expectations.' });
    pushUnique(falling, { ticker: 'TLT', direction: 'down', rationale: 'Long-duration Treasuries are pressured when yields stay supported.' });
    pushUnique(falling, { ticker: 'QQQ', direction: 'down', rationale: 'Higher discount rates weigh on long-duration growth equities.' });
    pushUnique(falling, { ticker: 'VNQ', direction: 'down', rationale: 'Rate-sensitive real estate underperforms when financing costs stay elevated.' });
  };

  const addSemisTheme = () => {
    pushUnique(rising, { ticker: 'SMH', direction: 'up', rationale: 'AI capex momentum usually lifts the semiconductor complex.' });
    pushUnique(rising, { ticker: 'NVDA', direction: 'up', rationale: 'Strong AI infrastructure demand supports the highest-quality GPU exposure.' });
    pushUnique(falling, { ticker: 'KWEB', direction: 'down', rationale: 'China-linked tech can weaken if export controls tighten or retaliation risk rises.' });
  };

  if (
    event.eventType === 'Geopolitics' ||
    event.eventType === 'Conflict' ||
    combined.includes('defense') ||
    combined.includes('military') ||
    combined.includes('middle east') ||
    combined.includes('isr')
  ) {
    addDefenseTheme();
    addEnergyTheme();
  }

  if (
    event.eventType === 'CentralBank' ||
    event.eventType === 'Macro' ||
    combined.includes('fed') ||
    combined.includes('rates') ||
    combined.includes('inflation') ||
    combined.includes('yield')
  ) {
    addRatesTheme();
  }

  if (
    event.eventType === 'RegulatoryShock' ||
    event.eventType === 'EarningsMegaCap' ||
    combined.includes('ai') ||
    combined.includes('chip') ||
    combined.includes('semiconductor')
  ) {
    addSemisTheme();
  }

  return {
    rising: rising.slice(0, 4),
    falling: falling.slice(0, 4),
  };
}

function buildStockReadThrough(event: MarketEvent, movers: { rising: StockMover[]; falling: StockMover[] }): string[] {
  const lines: string[] = [];

  if (movers.rising.length > 0) {
    lines.push(
      `Likely relative winners are ${movers.rising
        .map((item) => item.ticker)
        .join(', ')}, where the setup most directly supports near-term positioning and earnings visibility.`
    );
  }

  if (movers.falling.length > 0) {
    lines.push(
      `Likely relative laggards are ${movers.falling
        .map((item) => item.ticker)
        .join(', ')}, where the event raises discount-rate, fuel-cost, or risk-off pressure.`
    );
  }

  const firstSectorImpact = event.marketImpact.sectors ? asSentence(event.marketImpact.sectors) : '';
  if (firstSectorImpact) {
    lines.push(`Sector read-through: ${firstSectorImpact}`);
  }

  return lines;
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
  const interpretation = event ? buildInterpretation(event) : [];
  const confirmationNote = event ? buildConfirmationNote(event) : '';
  const stockMovers = useMemo(() => (event ? inferStockMovers(event) : { rising: [], falling: [] }), [event]);
  const stockReadThrough = useMemo(
    () => (event ? buildStockReadThrough(event, stockMovers) : []),
    [event, stockMovers]
  );

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

            {interpretation.length > 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Why This Matters Now</div>
                <div className="mt-2 space-y-3">
                  {interpretation.map((line, idx) => (
                    <p key={`${event.id}-interpretation-${idx}`} className="text-sm leading-7 text-zinc-300">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {confirmationNote && (
              <div className="mt-5 rounded-2xl border border-zinc-800/70 bg-zinc-950/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">What Confirms Or Changes It</div>
                <p className="mt-2 text-sm leading-7 text-zinc-300">{confirmationNote}</p>
              </div>
            )}

            {stockReadThrough.length > 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">How Stocks Usually Trade This</div>
                <div className="mt-2 space-y-3">
                  {stockReadThrough.map((line, idx) => (
                    <p key={`${event.id}-stock-read-${idx}`} className="text-sm leading-7 text-zinc-300">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="space-y-5">
                {(stockMovers.rising.length > 0 || stockMovers.falling.length > 0) && (
                  <section>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Rising / Falling Stocks</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {stockMovers.rising.length > 0 && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Likely Rising</div>
                          <ul className="mt-2 space-y-2">
                            {stockMovers.rising.map((item) => (
                              <li key={`${event.id}-rise-${item.ticker}`} className="text-sm leading-7 text-zinc-200">
                                <span className="font-semibold text-zinc-100">{item.ticker}</span>
                                <span className="text-zinc-400"> — {item.rationale}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {stockMovers.falling.length > 0 && (
                        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300">Likely Falling</div>
                          <ul className="mt-2 space-y-2">
                            {stockMovers.falling.map((item) => (
                              <li key={`${event.id}-fall-${item.ticker}`} className="text-sm leading-7 text-zinc-200">
                                <span className="font-semibold text-zinc-100">{item.ticker}</span>
                                <span className="text-zinc-400"> — {item.rationale}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Drivers</div>
                  <ul className="space-y-2">
                    {event.drivers.map((driver, idx) => (
                      <li
                        key={`${event.id}-driver-${idx}`}
                        className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-sm leading-7 text-zinc-200"
                      >
                        {driver}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Transmission Path</div>
                  <ul className="space-y-2">
                    {event.transmissionPath.map((path, idx) => (
                      <li
                        key={`${event.id}-path-${idx}`}
                        className="flex items-start gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-4 py-3 text-sm leading-7 text-zinc-300"
                      >
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--cb-green)]" />
                        <span>{path}</span>
                      </li>
                    ))}
                  </ul>
                </section>

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

              <div className="space-y-5">
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Market Impact</div>
                  <div className="space-y-3">
                    {MARKET_IMPACT_ORDER.filter((key) => Boolean(event.marketImpact[key])).map((key) => (
                      <div
                        key={`${event.id}-impact-${key}`}
                        className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          {formatImpactLabel(key)}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-zinc-200">{event.marketImpact[key]}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Watch Next</div>
                  <ul className="space-y-2">
                    {event.watchNext.map((item, idx) => (
                      <li
                        key={`${event.id}-watch-${idx}`}
                        className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-sm leading-7 text-zinc-200"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
