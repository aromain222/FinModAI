'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExpandableCard from '@/components/news/ExpandableCard';
import ImpactChips from '@/components/news/ImpactChips';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type NewsRange, type NewsTopic } from '@/lib/news/types';

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

type NewsItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
};

type NewsSuccessResponse = {
  ok?: true;
  items: NewsItem[];
  provider?: 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'none';
};

type NewsErrorResponse = {
  ok?: false;
  error: string;
  details?: Record<string, unknown>;
};

type MarketImpactSections = {
  lead: string | null;
  drivers: string[];
  winnersLosers: string[];
  monitoringAnchors: string[];
  invalidationTrigger: string | null;
  fallback: string;
};

function providerLabel(provider?: 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'none'): string {
  if (provider === 'perigon') return 'Perigon';
  if (provider === 'benzinga') return 'Benzinga';
  if (provider === 'newsapi') return 'NewsAPI';
  if (provider === 'supabase') return 'Supabase';
  if (provider === 'none') return 'None';
  return 'Unknown';
}

function parseResponse(payload: unknown): NewsSuccessResponse | NewsErrorResponse {
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_response', details: { message: 'Response is not an object' } };
  }

  const data = payload as Record<string, unknown>;
  if (typeof data.error === 'string') {
    return {
      error: data.error,
      details: data.details && typeof data.details === 'object' ? (data.details as Record<string, unknown>) : undefined,
    };
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        typeof row.title !== 'string' ||
        typeof row.url !== 'string' ||
        typeof row.source !== 'string' ||
        typeof row.publishedAt !== 'string'
      ) {
        return null;
      }

      return {
        id: row.id,
        title: row.title,
        description: typeof row.description === 'string' ? row.description : null,
        url: row.url,
        source: row.source,
        publishedAt: row.publishedAt,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
      } satisfies NewsItem;
    })
    .filter((item) => item != null) as NewsItem[];

  const provider =
    data.provider === 'perigon' ||
    data.provider === 'benzinga' ||
    data.provider === 'newsapi' ||
    data.provider === 'supabase' ||
    data.provider === 'none'
      ? data.provider
      : undefined;
  return { items, provider };
}

function errorDisplay(error: NewsErrorResponse): string {
  const env = typeof error.details?.env === 'string' ? error.details.env : null;
  if (env) return `${error.error} (${env})`;
  return error.error;
}

function cleanImpactText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*([,;:.])\s*/g, '$1 ').replace(/\s+/g, ' ').trim();
}

function splitListItems(value: string): string[] {
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-*]\s*/g, '')
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/\s*;\s*|\s*\|\s*/g)
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function parseMarketImpactSections(raw: string | null | undefined): MarketImpactSections | null {
  if (!raw || typeof raw !== 'string') return null;
  const fallback = cleanImpactText(raw);
  if (!fallback) return null;

  const text = fallback.replace(/^market impact:\s*/i, '').trim();

  const winnersMatch = text.match(
    /likely winners\/losers:\s*([\s\S]*?)(?=(monitoring anchors:|invalidation trigger:|$))/i
  );
  const monitoringMatch = text.match(/monitoring anchors:\s*([\s\S]*?)(?=(invalidation trigger:|$))/i);
  const invalidationMatch = text.match(/invalidation trigger:\s*([\s\S]*)$/i);

  const markers = [
    winnersMatch?.index ?? Infinity,
    monitoringMatch?.index ?? Infinity,
    invalidationMatch?.index ?? Infinity,
  ];
  const firstMarker = Math.min(...markers);
  const core = Number.isFinite(firstMarker) ? text.slice(0, firstMarker).trim() : text;

  const coreSentences = core
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const lead = coreSentences.length > 0 ? coreSentences[0] : null;
  const drivers = coreSentences.slice(1);
  const winnersLosers = splitListItems(winnersMatch?.[1] ?? '');
  const monitoringRaw = (monitoringMatch?.[1] ?? '')
    .replace(/ and /gi, ', ')
    .replace(/\//g, '/');
  const monitoringAnchors = monitoringRaw
    .split(/\s*[;,]\s*/g)
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const invalidationTrigger = invalidationMatch?.[1]?.trim() || null;

  return {
    lead,
    drivers,
    winnersLosers,
    monitoringAnchors,
    invalidationTrigger,
    fallback,
  };
}

function MarketImpactBlock({ text }: { text: string }) {
  const parsed = parseMarketImpactSections(text);
  if (!parsed) {
    return <p className="text-sm leading-6 text-zinc-300">Additional context unavailable.</p>;
  }

  return (
    <div className="space-y-3">
      {parsed.lead && (
        <div className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-3 py-2">
          <p className="text-sm font-medium leading-6 text-zinc-200">{parsed.lead}</p>
        </div>
      )}

      {parsed.drivers.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Drivers</div>
          <div className="space-y-1">
            {parsed.drivers.map((driver, idx) => (
              <p key={`driver-${idx}`} className="text-sm leading-6 text-zinc-300">
                {driver}
              </p>
            ))}
          </div>
        </div>
      )}

      {parsed.winnersLosers.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Likely Winners / Losers</div>
          <ul className="space-y-1">
            {parsed.winnersLosers.map((item, idx) => (
              <li key={`wl-${idx}`} className="text-sm leading-6 text-zinc-300">
                {item}
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
                key={`anchor-${idx}`}
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
        parsed.drivers.length === 0 &&
        parsed.winnersLosers.length === 0 &&
        parsed.monitoringAnchors.length === 0 &&
        !parsed.invalidationTrigger && (
          <p className="text-sm leading-6 text-zinc-300">{parsed.fallback}</p>
        )}
    </div>
  );
}

export default function HeadlinesPanel({
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
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'none' | undefined>(
    undefined
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NewsErrorResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enrichLoadingId, setEnrichLoadingId] = useState<string | null>(null);
  const [enrichMap, setEnrichMap] = useState<Record<string, HeadlineEnrichment>>({});

  const extractHeadlineTerms = useCallback((headline: NewsItem): string[] => {
    const text = `${headline.title} ${headline.description ?? ''}`;
    const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,5}|CPI|GDP|PCE|FOMC|DXY|VIX)\b/g) ?? [];
    const blacklist = new Set(['The', 'And', 'For', 'With', 'US', 'USA', 'EU', 'ECB', 'FED']);
    return Array.from(new Set(matches.map((item) => item.trim()).filter((item) => !blacklist.has(item)))).slice(0, 3);
  }, []);

  const buildLocalFallback = useCallback((headline: NewsItem): HeadlineEnrichment => {
    const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
    const mentionsRates = /(fed|minutes|yield|rates?|cpi|inflation|treasury)/i.test(text);
    const mentionsEnergy = /(oil|wti|brent|energy|opec)/i.test(text);
    const mentionsFx = /(dollar|usd|dxy|fx|yen|euro|currency)/i.test(text);
    const terms = extractHeadlineTerms(headline);
    const catalyst = terms.length > 0 ? terms.join(', ') : headline.title;

    const sectors = [
      mentionsRates
        ? { sector: 'Financials', direction: 'up' as const, rationale: 'Rate sensitivity channel.' }
        : { sector: 'Technology', direction: 'mixed' as const, rationale: 'Duration sensitivity depends on rates path.' },
      mentionsEnergy
        ? { sector: 'Energy', direction: 'up' as const, rationale: 'Commodity linkage.' }
        : { sector: 'Industrials', direction: 'mixed' as const, rationale: 'Macro demand and cost pass-through.' },
    ];

    return headlineEnrichmentSchema.parse({
      ai_summary:
        `${headline.title}. Headline-specific catalyst is ${catalyst}. ` +
        `Base case over 1-5 sessions is a tactical move through ${mentionsRates ? 'rates and valuation duration' : mentionsEnergy ? 'commodity pass-through and inflation expectations' : mentionsFx ? 'FX and global liquidity translation' : 'risk premium and positioning channels'}. ` +
        `Early confirmation should come from ${mentionsRates ? '2Y/10Y and Fed path pricing' : mentionsEnergy ? 'WTI/Brent and breakevens' : mentionsFx ? 'DXY and real-rate differentials' : 'rates, USD, and credit spreads'}. ` +
        `If those anchors diverge from price action tied to ${catalyst}, treat this as low-conviction.`,
      why_it_matters:
        `Market impact: near-term direction for this catalyst (${catalyst}) is ${mentionsRates ? 'equities down / rates up / USD up' : mentionsEnergy ? 'equities mixed / rates up / USD mixed' : mentionsFx ? 'equities mixed / rates mixed / USD directional' : 'mixed across equities, rates, and USD'}. ` +
        `The first-order channel is ${mentionsRates ? 'policy-rate repricing into discount rates and factor leadership' : mentionsEnergy ? 'commodity-to-inflation transmission into margins and rates' : mentionsFx ? 'FX translation and liquidity repricing' : 'macro risk-premium repricing'} rather than broad beta alone. ` +
        `Sector impact should be expressed through ${sectors.map((s) => s.sector).join(' and ')} rather than broad beta alone. ` +
        `What to watch: ${mentionsRates ? '2Y/10Y and Fed path' : mentionsEnergy ? 'WTI/Brent and breakevens' : mentionsFx ? 'DXY and real rates' : '2Y/10Y and DXY'}, plus VIX and IG/HY spreads; invalidate if those anchors diverge from equity price action on this headline.`,
      impacted_sectors: sectors,
      impacted_tickers: [],
      confidence: 'low',
    });
  }, [extractHeadlineTerms]);

  const fetchHeadlines = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news?range=${range}&topic=${topic}&limit=20`, {
        cache: 'no-store',
      });
      const raw = await response.json();
      const payload = parseResponse(raw);

      if (!response.ok || 'error' in payload) {
        setItems([]);
        setProvider(undefined);
        setError('error' in payload ? payload : { error: 'request_failed' });
        return;
      }

      setItems(payload.items);
      setProvider(payload.provider);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load headlines';
      setItems([]);
      setProvider(undefined);
      setError({ error: message });
    } finally {
      setLoading(false);
    }
  }, [range, topic]);

  useEffect(() => {
    void fetchHeadlines();
  }, [fetchHeadlines]);

  const loadEnrichment = useCallback(
    async (headline: NewsItem) => {
      if (enrichMap[headline.id]) return;

      setEnrichLoadingId(headline.id);
      try {
        const response = await fetch('/api/news/headlines/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline: {
              id: headline.id,
              title: headline.title,
              description: headline.description,
              source: headline.source,
              published_at: headline.publishedAt,
              url: headline.url,
              tags: [],
            },
          }),
        });

        if (!response.ok) {
          setEnrichMap((current) => ({ ...current, [headline.id]: buildLocalFallback(headline) }));
            return;
        }
        const raw = await response.json();
        const parsed = headlineEnrichmentSchema.safeParse(raw);
        const payload = parsed.success ? parsed.data : buildLocalFallback(headline);
        setEnrichMap((current) => ({ ...current, [headline.id]: payload }));
      } catch {
        setEnrichMap((current) => ({ ...current, [headline.id]: buildLocalFallback(headline) }));
      } finally {
        setEnrichLoadingId(null);
      }
    },
    [buildLocalFallback, enrichMap]
  );

  const resolvedProviderLabel = useMemo(() => providerLabel(provider), [provider]);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-zinc-800/40 bg-zinc-900/20">
      <div className="border-b border-zinc-800/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Headlines</h2>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
              <span>Provider: {resolvedProviderLabel}</span>
              <span>•</span>
              <span>{items.length}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void fetchHeadlines()}>
            Refresh
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={`head-range-${option}`}
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
              key={`head-topic-${option.key}`}
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
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/25" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-xs text-rose-200">
            <div className="font-semibold">News API error</div>
            <div className="mt-1">{errorDisplay(error)}</div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-lg border border-zinc-800/40 px-3 py-3 text-xs text-zinc-400">
            0 items returned • provider: {resolvedProviderLabel}
          </div>
        )}

        {!loading &&
          !error &&
          items.map((item) => {
            const isOpen = expandedId === item.id;
            const enrichment = enrichMap[item.id];

            return (
              <ExpandableCard
                key={item.id}
                isOpen={isOpen}
                onToggle={() => {
                  setExpandedId((current) => (current === item.id ? null : item.id));
                  if (!isOpen) void loadEnrichment(item);
                }}
                rightAccessory={
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-zinc-200"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                }
                header={
                  <>
                    <div className="text-[11px] text-zinc-400">
                      {item.source} • {new Date(item.publishedAt).toLocaleString()}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-100">{item.title}</div>
                    <div className="mt-1 line-clamp-1 text-xs leading-relaxed text-zinc-400/80">
                      {item.description || 'No description available'}
                    </div>
                  </>
                }
              >
                {enrichLoadingId === item.id && !enrichment && (
                  <div className="h-14 animate-pulse rounded bg-zinc-800/30" />
                )}
                {enrichment && (
                  <>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">AI Summary</div>
                      <p className="text-sm leading-6 text-zinc-200">
                        {enrichment.ai_summary ?? 'Summary unavailable for this item.'}
                      </p>
                    </div>
                    <ImpactChips title="Impacted Sectors" items={enrichment.impacted_sectors} />
                    <ImpactChips title="Impacted Tickers" items={enrichment.impacted_tickers} />
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">Market Impact</div>
                      <MarketImpactBlock text={enrichment.why_it_matters ?? ''} />
                    </div>
                  </>
                )}

                {!enrichLoadingId && !enrichment && (
                  <div className="rounded-md border border-zinc-800/40 bg-zinc-900/20 p-3 text-xs text-zinc-400">
                    Enrichment unavailable for this headline.
                    <button
                      type="button"
                      className="ml-2 text-zinc-200 underline underline-offset-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        void loadEnrichment(item);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </ExpandableCard>
            );
          })}
      </div>
    </div>
  );
}
