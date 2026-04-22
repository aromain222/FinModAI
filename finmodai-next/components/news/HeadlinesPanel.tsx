'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type NewsRange, type NewsTopic } from '@/lib/news/types';
import type { ServerHeadlinesPayload } from '@/lib/news/fetchHeadlinesServer';
import {
  EmptyState,
  ErrorState,
  FeedSummaryBanner,
  HeadlineCard,
  HeadlinesPanelHeader,
  LoadingState,
  type HeadlinePanelItem,
} from '@/components/news/HeadlinesPanelParts';

type NewsItem = HeadlinePanelItem;

type NewsSuccessResponse = {
  ok?: true;
  items: NewsItem[];
  provider?: 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'demo' | 'none';
};

type NewsErrorResponse = {
  ok?: false;
  error: string;
  details?: Record<string, unknown>;
};

function providerLabel(provider?: string): string {
  const map: Record<string, string> = {
    perigon: 'Perigon',
    benzinga: 'Benzinga',
    newsapi: 'NewsAPI',
    supabase: 'CapitalBase',
    demo: 'CapitalBase',
    none: 'CapitalBase',
  };
  return provider ? map[provider] ?? 'Unknown' : 'Unknown';
}

function errorDisplay(error: NewsErrorResponse): string {
  const env = typeof error.details?.env === 'string' ? error.details.env : null;
  return env ? `${error.error} (${env})` : error.error;
}

export default function HeadlinesPanel({
  range,
  topic,
  initialHeadlines,
  onRangeChange,
  onTopicChange,
}: {
  range: NewsRange;
  topic: NewsTopic;
  initialHeadlines: ServerHeadlinesPayload;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  const [isRefreshing, startRefresh] = useTransition();
  const [items, setItems] = useState<NewsItem[]>(initialHeadlines.items);
  const [provider, setProvider] = useState<NewsSuccessResponse['provider']>(initialHeadlines.provider);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NewsErrorResponse | null>(
    initialHeadlines.error ? { error: initialHeadlines.error.error, details: initialHeadlines.error.details } : null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enrichLoadingId, setEnrichLoadingId] = useState<string | null>(null);
  const [enrichMap, setEnrichMap] = useState<Record<string, HeadlineEnrichment>>({});

  const loadHeadlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        range,
        topic,
        limit: '20',
      });
      const response = await fetch(`/api/news/headlines?${query.toString()}`, { cache: 'no-store' });
      const raw = await response.json();
      if (!response.ok || typeof raw?.error === 'string') {
        setItems([]);
        setProvider(raw?.provider);
        setError({
          error: typeof raw?.error === 'string' ? raw.error : 'Failed to load headlines.',
          details: raw?.details && typeof raw.details === 'object' ? raw.details : undefined,
        });
        return;
      }

      const nextItems = Array.isArray(raw?.items)
        ? raw.items.filter((item: unknown): item is NewsItem => {
            if (!item || typeof item !== 'object') return false;
            const row = item as Record<string, unknown>;
            return (
              typeof row.id === 'string' &&
              typeof row.title === 'string' &&
              typeof row.url === 'string' &&
              typeof row.source === 'string' &&
              typeof row.publishedAt === 'string'
            );
          })
        : [];

      setItems(nextItems);
      setProvider(raw?.provider);
      setError(null);
    } catch (requestError) {
      setItems([]);
      setError({
        error: requestError instanceof Error ? requestError.message : 'Failed to load headlines.',
      });
    } finally {
      setLoading(false);
    }
  }, [range, topic]);

  const buildLocalFallback = useCallback((headline: NewsItem): HeadlineEnrichment => {
    const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
    const mentionsRates = /(fed|minutes|yield|rates?|cpi|inflation|treasury)/i.test(text);
    const mentionsEnergy = /(oil|wti|brent|energy|opec)/i.test(text);
    const mentionsFx = /(dollar|usd|dxy|fx|yen|euro|currency)/i.test(text);
    const sectors = [
      mentionsRates
        ? { sector: 'Financials', direction: 'up' as const, rationale: 'Banks tend to benefit when rates rise.' }
        : { sector: 'Technology', direction: 'mixed' as const, rationale: 'Tech stocks are sensitive to rate expectations.' },
      mentionsEnergy
        ? { sector: 'Energy', direction: 'up' as const, rationale: 'Higher oil prices help energy companies.' }
        : { sector: 'Industrials', direction: 'mixed' as const, rationale: 'Industrial companies are sensitive to economic conditions.' },
    ];

    const summary = headline.description ? `${headline.title}. ${headline.description}` : headline.title;
    const whyMarketsCare = mentionsRates
      ? 'This matters because policy-rate expectations can quickly reprice yields, discount rates, and USD demand.'
      : mentionsEnergy
        ? 'This matters because energy shocks can feed inflation expectations and pressure margin assumptions across exposed sectors.'
        : mentionsFx
          ? 'This matters because FX moves can change imported inflation and multinational earnings translation.'
          : 'This matters if follow-up reporting turns the headline into a real change in policy, earnings, or risk sentiment.';
    const marketImpact = mentionsRates
      ? ['Rate-sensitive equities: mildly bearish if yields keep rising', 'Financials: relatively better if higher rates support net interest income', 'USD: relatively positive if policy expectations stay firm']
      : mentionsEnergy
        ? ['Energy producers: relatively positive if oil stays elevated', 'Consumer and transport names: mildly bearish if fuel costs stay high', 'Broad equities: selective pressure if inflation concerns broaden']
        : mentionsFx
          ? ['USD-sensitive multinationals: mixed on translation effects', 'Domestic earners: relatively better if FX volatility rises', 'Risk assets: selective reaction unless rates move with the currency signal']
          : ['Most equities: limited immediate reaction unless the story broadens', 'Policy-sensitive sectors: first to move if follow-up reporting raises the stakes'];
    const watchItems = mentionsRates
      ? ['2Y Treasury yield', 'Fed funds futures', 'Management commentary on demand sensitivity']
      : mentionsEnergy
        ? ['Oil price follow-through', 'Margin commentary from exposed sectors', 'Any policy or supply response']
        : mentionsFx
          ? ['DXY follow-through', 'EURUSD / USDJPY reaction', 'Management guidance on FX impact']
          : ['Size of the development', 'Whether follow-up reporting broadens the scope', 'Management response or regulator clarification'];
    const horizon = mentionsRates ? 'Near-term reaction, confidence low.' : 'Near-term sentiment hit, confidence low.';
    const whyItMatters = [
      'SUMMARY',
      `- ${headline.title}`,
      '',
      'WHY IT MATTERS',
      `- ${whyMarketsCare}`,
      '',
      'MARKET IMPACT',
      ...marketImpact.map((item) => `- ${item}`),
      '',
      'TIME HORIZON',
      `- ${horizon}`,
      '',
      'WATCH ITEMS',
      ...watchItems.map((item) => `- ${item}`),
    ].join('\n');

    return headlineEnrichmentSchema.parse({
      ai_summary: summary,
      why_it_matters: whyItMatters,
      impacted_sectors: sectors,
      impacted_tickers: [],
      confidence: 'low',
    });
  }, []);

  useEffect(() => {
    setItems(initialHeadlines.items);
    setProvider(initialHeadlines.provider);
    setError(
      initialHeadlines.error ? { error: initialHeadlines.error.error, details: initialHeadlines.error.details } : null
    );
    setLoading(false);
  }, [initialHeadlines]);

  useEffect(() => {
    if (initialHeadlines.items.length > 0 || initialHeadlines.error) return;
    void loadHeadlines();
  }, [initialHeadlines.error, initialHeadlines.items.length, loadHeadlines]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

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
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );
  const selectedEnrichment = selectedItem ? enrichMap[selectedItem.id] : null;

  useEffect(() => {
    if (!selectedItem) return;
    if (!selectedEnrichment && enrichLoadingId !== selectedItem.id) {
      void loadEnrichment(selectedItem);
    }
  }, [selectedEnrichment, selectedItem, enrichLoadingId, loadEnrichment]);

  return (
    <div className="space-y-5">
      <HeadlinesPanelHeader
        itemCount={items.length}
        providerLabel={resolvedProviderLabel}
        range={range}
        topic={topic}
        loading={loading}
        refreshing={isRefreshing}
        onRefresh={() =>
          startRefresh(() => {
            void loadHeadlines();
          })
        }
        onRangeChange={onRangeChange}
        onTopicChange={onTopicChange}
      />

      <div className="space-y-3">
        <FeedSummaryBanner itemCount={items.length} />

        <div className="space-y-3">
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={errorDisplay(error)} />}
          {!loading && !error && items.length === 0 && <EmptyState />}

          {!loading &&
            !error &&
            items.map((item) => {
              const enrichment = enrichMap[item.id];
              const isSelected = selectedItem?.id === item.id;
              return (
                <HeadlineCard
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  enrichment={enrichment}
                  enrichLoading={enrichLoadingId === item.id}
                  onToggle={() => {
                    setSelectedId(isSelected ? null : item.id);
                    if (!enrichment) void loadEnrichment(item);
                  }}
                  onRetry={() => void loadEnrichment(item)}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
