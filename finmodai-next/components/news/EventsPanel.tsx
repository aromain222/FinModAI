'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import ExpandableCard from '@/components/news/ExpandableCard';
import ImpactChips from '@/components/news/ImpactChips';
import type { EventItem, NewsRange, NewsTopic } from '@/lib/news/types';

const RANGE_OPTIONS: NewsRange[] = ['1D', '3D', '1W', '1M'];
const TOPIC_OPTIONS: Array<{ key: NewsTopic; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'policy', label: 'Policy' },
  { key: 'rates', label: 'Rates' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'energy', label: 'Energy' },
  { key: 'fx', label: 'FX' },
  { key: 'equities', label: 'Equities' },
];

type EventsSuccess = {
  ok?: true;
  events: EventItem[];
  items?: EventItem[];
  provider?: string;
};

type EventsError = {
  ok?: false;
  error: string;
  details?: Record<string, unknown>;
  provider?: string;
  message?: string;
};

type ParsedImpact = {
  lead: string | null;
  winnersLosers: string[];
  monitoringAnchors: string[];
  invalidationTrigger: string | null;
  remainder: string[];
  fallback: string;
};

function providerLabel(provider?: string): string {
  if (!provider) return 'Unknown';
  if (provider === 'supabase') return 'Supabase';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'perigon') return 'Perigon';
  if (provider === 'benzinga') return 'Benzinga';
  if (provider === 'newsapi') return 'NewsAPI';
  if (provider === 'demo') return 'Demo';
  if (provider === 'none') return 'None';
  return provider;
}

function parseResponse(payload: unknown): EventsSuccess | EventsError {
  if (!payload || typeof payload !== 'object') return { error: 'invalid_response' };
  const data = payload as Record<string, unknown>;

  if (typeof data.error === 'string') {
    return {
      error: data.error,
      details: data.details && typeof data.details === 'object' ? (data.details as Record<string, unknown>) : undefined,
      provider: typeof data.provider === 'string' ? data.provider : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
    };
  }

  return {
    events: Array.isArray(data.events) ? (data.events as EventItem[]) : [],
    provider: typeof data.provider === 'string' ? data.provider : undefined,
  };
}

function errorText(error: EventsError): string {
  const details = error.details ? ` ${JSON.stringify(error.details)}` : '';
  const provider = error.provider ? ` (${error.provider})` : '';
  const message = error.message ? ` ${error.message}` : '';
  return `${error.error}${provider}${message}${details}`.trim();
}

function dedupeEvents(items: EventItem[]): EventItem[] {
  const byKey = new Map<string, EventItem>();
  for (const event of items) {
    const titleKey = event.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const key = `${event.id}::${titleKey}::${event.published_at}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    const existingTs = new Date(existing.published_at ?? 0).getTime();
    const currentTs = new Date(event.published_at ?? 0).getTime();
    if (currentTs > existingTs) {
      byKey.set(key, event);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime()
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseImpact(text: string | null | undefined): ParsedImpact | null {
  if (!text) return null;
  const fallback = text.replace(/\s+/g, ' ').trim();
  if (!fallback) return null;
  const normalized = fallback.replace(/^market impact:\s*/i, '').trim();

  const winnersMatch = normalized.match(
    /likely winners\/losers:\s*([\s\S]*?)(?=(monitoring anchors:|invalidation trigger:|$))/i
  );
  const monitoringMatch = normalized.match(/monitoring anchors:\s*([\s\S]*?)(?=(invalidation trigger:|$))/i);
  const invalidationMatch = normalized.match(/invalidation trigger:\s*([\s\S]*)$/i);
  const markers = [
    winnersMatch?.index ?? Infinity,
    monitoringMatch?.index ?? Infinity,
    invalidationMatch?.index ?? Infinity,
  ];
  const firstMarker = Math.min(...markers);
  const core = Number.isFinite(firstMarker) ? normalized.slice(0, firstMarker).trim() : normalized;
  const coreSentences = splitSentences(core);

  const winnersLosers = (winnersMatch?.[1] ?? '')
    .split(/\s*;\s*/g)
    .map((entry) => entry.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const monitoringAnchors = (monitoringMatch?.[1] ?? '')
    .replace(/ and /gi, ', ')
    .split(/\s*[;,]\s*/g)
    .map((entry) => entry.trim().replace(/\.$/, ''))
    .filter(Boolean);

  return {
    lead: coreSentences[0] ?? null,
    remainder: coreSentences.slice(1),
    winnersLosers,
    monitoringAnchors,
    invalidationTrigger: invalidationMatch?.[1]?.trim() || null,
    fallback,
  };
}

function SummaryBlock({ text }: { text: string }) {
  const sentences = splitSentences(text).slice(0, 3);
  if (sentences.length === 0) {
    return <p className="text-sm leading-6 text-zinc-200">Summary unavailable.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-3 py-2 text-sm leading-6 text-zinc-200">
        {sentences[0]}
      </p>
      {sentences.slice(1).map((line, idx) => (
        <p key={`evt-sum-${idx}`} className="text-sm leading-6 text-zinc-300">
          {line}
        </p>
      ))}
    </div>
  );
}

function MarketImpactBlock({ text }: { text: string }) {
  const parsed = parseImpact(text);
  if (!parsed) return <p className="text-sm leading-6 text-zinc-300">Additional context unavailable.</p>;

  return (
    <div className="space-y-3">
      {parsed.lead && (
        <div className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-3 py-2">
          <p className="text-sm leading-6 text-zinc-200">{parsed.lead}</p>
        </div>
      )}

      {parsed.remainder.map((line, idx) => (
        <p key={`evt-impact-rem-${idx}`} className="text-sm leading-6 text-zinc-300">
          {line}
        </p>
      ))}

      {parsed.winnersLosers.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Likely Winners / Losers</div>
          <ul className="space-y-1">
            {parsed.winnersLosers.map((entry, idx) => (
              <li key={`evt-impact-wl-${idx}`} className="text-sm leading-6 text-zinc-300">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.monitoringAnchors.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Monitoring Anchors</div>
          <div className="flex flex-wrap gap-1.5">
            {parsed.monitoringAnchors.map((anchor, idx) => (
              <span
                key={`evt-impact-anchor-${idx}`}
                className="rounded-full border border-zinc-700/70 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300"
              >
                {anchor}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.invalidationTrigger && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Invalidation Trigger</div>
          <p className="text-sm leading-6 text-zinc-300">{parsed.invalidationTrigger}</p>
        </div>
      )}

      {!parsed.lead &&
        parsed.remainder.length === 0 &&
        parsed.winnersLosers.length === 0 &&
        parsed.monitoringAnchors.length === 0 &&
        !parsed.invalidationTrigger && (
          <p className="text-sm leading-6 text-zinc-300">{parsed.fallback}</p>
        )}
    </div>
  );
}

export default function EventsPanel({
  range,
  topic,
  onRangeChange,
  onTopicChange,
}: {
  range: NewsRange;
  topic: NewsTopic;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EventsError | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news?type=events&range=${range}&tag=${topic}&limit=30`, {
        cache: 'no-store',
      });
      const raw = await response.json();
      const payload = parseResponse(raw);

      if (!response.ok || 'error' in payload) {
        setEvents([]);
        setProvider(payload.provider);
        setError('error' in payload ? payload : { error: 'request_failed' });
        return;
      }

      setEvents(dedupeEvents(payload.events ?? payload.items ?? []));
      setProvider(payload.provider);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load events';
      setEvents([]);
      setProvider(undefined);
      setError({ error: message });
    } finally {
      setLoading(false);
    }
  }, [range, topic]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const resolvedProviderLabel = useMemo(() => providerLabel(provider), [provider]);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-zinc-800/40 bg-zinc-900/20">
      <div className="border-b border-zinc-800/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Event Intelligence</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
              <span>Provider: {resolvedProviderLabel}</span>
              <span>•</span>
              <span>{events.length}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void fetchEvents()}>
            Refresh
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={`evt-range-${option}`}
              size="sm"
              variant={range === option ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => onRangeChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOPIC_OPTIONS.map((option) => (
            <Button
              key={`evt-topic-${option.key}`}
              size="sm"
              variant={topic === option.key ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => onTopicChange(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/25" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-xs text-rose-200">
            <div className="font-semibold">Events API error</div>
            <div className="mt-1">{errorText(error)}</div>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-lg border border-zinc-800/40 px-3 py-3 text-xs text-zinc-400">
            0 items returned • provider: {resolvedProviderLabel}
          </div>
        )}

        {!loading &&
          !error &&
          events.map((event) => {
            const isOpen = expandedId === event.id;
            return (
              <ExpandableCard
                key={event.id}
                isOpen={isOpen}
                onToggle={() => setExpandedId((current) => (current === event.id ? null : event.id))}
                header={
                  <>
                    <div className="line-clamp-2 text-sm font-semibold text-zinc-100">{event.title}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-zinc-400/80">{event.what_happened}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(event.tags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={`${event.id}-${tag}`}
                          className="rounded-full border border-zinc-700/40 px-2 py-0.5 text-[10px] text-zinc-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </>
                }
              >
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">AI Summary</div>
                  <SummaryBlock text={event.ai_summary} />
                </div>

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Market Impact</div>
                  <MarketImpactBlock text={event.why_it_matters} />
                </div>

                <ImpactChips title="Impacted Sectors" items={event.impacted_sectors} />
                <ImpactChips title="Impacted Tickers" items={event.impacted_tickers} />

                {event.impacted_sectors.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Sector Rationale</div>
                    <div className="space-y-1.5 text-xs text-zinc-300">
                      {event.impacted_sectors
                        .filter((item) => item.rationale)
                        .map((item, idx) => (
                          <p key={`${event.id}-sector-rationale-${idx}`}>
                            <span className="font-medium text-zinc-200">{item.sector}:</span> {item.rationale}
                          </p>
                        ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Watch Items</div>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
                    {event.watch_items.map((item, idx) => (
                      <li key={`${event.id}-watch-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Sources</div>
                  <div className="space-y-1">
                    {event.sources.map((source, idx) => (
                      <a
                        key={`${event.id}-source-${idx}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-sky-300 hover:text-sky-200"
                      >
                        {source.source}: {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              </ExpandableCard>
            );
          })}
      </div>
    </div>
  );
}
