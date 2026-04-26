'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import { useEventImpact, type EventImpactResult } from '@/lib/useEventImpact';
import { useModelAssumptions } from '@/lib/modelAssumptionsStore';
import { useEventStack } from '@/lib/useEventStack';
import { useTradingSignal } from '@/lib/useTradingSignal';
import { computeEv } from '@/lib/eventStackEngine';
import EventTimeline from '@/components/events/EventTimeline';
import TradingSignalCard, { TradingSignalSkeleton } from '@/components/TradingSignalCard';
import type { CurrentModel } from '@/lib/applyEventMutation';

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

  // ── Model mutation state ──────────────────────────────────────────────────
  const { modelAssumptions, updateScenarioValue } = useModelAssumptions();
  const { analyze: analyzeImpact } = useEventImpact();
  const [impactLoadingId, setImpactLoadingId] = useState<string | null>(null);

  // Capture base model once on mount — stacking works from this snapshot.
  const baseModelRef = useRef<CurrentModel | null>(null);
  if (baseModelRef.current === null) {
    baseModelRef.current = {
      revenue_growth:    modelAssumptions.revenueGrowth    / 100,
      ebitda_margin:     modelAssumptions.ebitdaMargin     / 100,
      wacc:              modelAssumptions.wacc             / 100,
      terminal_growth:   modelAssumptions.terminalGrowth   / 100,
      capex_pct_revenue: modelAssumptions.capexPctRevenue  / 100,
    };
  }

  const {
    stack,
    activeModel,
    currentModel,
    totalDeltaPct,
    timelineIndex,
    isPlaying,
    isReplaying,
    addEvent,
    removeEvent: stackRemoveEvent,
    clearStack,
    playTimeline,
    stopPlayback,
    exitReplay,
    jumpToIndex,
  } = useEventStack(baseModelRef.current);

  // ── Trading signal ────────────────────────────────────────────────────────
  const { loading: signalLoading, signal, analyze: analyzeSignal, reset: resetSignal } = useTradingSignal();

  // Recompute signal whenever the visible event set changes — debounced 600ms.
  // The hook handles AbortController (cancels in-flight requests) and deduplication
  // (skips re-call if valuation gap change < 0.5% with same ticker + event count).
  useEffect(() => {
    if (stack.events.length === 0) {
      resetSignal();
      return;
    }

    // Visible slice: all events when live, prefix slice when replaying
    const activeEvents =
      timelineIndex === null
        ? stack.events
        : stack.events.slice(0, timelineIndex + 1);

    if (activeEvents.length === 0) return;

    const baseVal    = computeEv(stack.base_model);
    const updatedVal = computeEv(activeModel);

    // Cumulative delta of the last visible event for scenario construction
    const lastEvent      = activeEvents[activeEvents.length - 1];
    const cumulativeDelta = lastEvent.cumulative_valuation_delta_pct;

    // Use the most recently stacked ticker as the signal ticker
    const ticker = lastEvent.ticker ?? 'MARKET';

    const tid = setTimeout(() => {
      void analyzeSignal({
        ticker,
        current_price:     baseVal,   // market is assumed priced at base
        base_valuation:    baseVal,
        updated_valuation: updatedVal,
        event_stack: activeEvents.map((e) => ({
          headline:                       e.headline,
          ticker:                         e.ticker,
          timestamp:                      e.timestamp,
          marginal_valuation_delta_pct:   e.marginal_valuation_delta_pct,
          cumulative_valuation_delta_pct: e.cumulative_valuation_delta_pct,
          impact_summary:                 e.impact_summary,
        })),
        scenarios: {
          base:     { valuation_delta_pct: cumulativeDelta },
          upside:   { valuation_delta_pct: cumulativeDelta * 1.5 },
          downside: { valuation_delta_pct: cumulativeDelta * 0.5 },
        },
      });
    }, 600);

    return () => clearTimeout(tid);
  // analyzeSignal is stable (useCallback []); activeModel identity changes with stack
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.events.length, timelineIndex, activeModel]);

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

  // Analyze impact using the stacked activeModel as the starting point.
  const handleAnalyzeImpact = useCallback(
    async (item: NewsItem) => {
      const alreadyStacked = stack.events.some((e) => e.headline === item.title);
      if (alreadyStacked || impactLoadingId === item.id) return;
      setImpactLoadingId(item.id);

      const enrichment = enrichMap[item.id];
      const ticker  = enrichment?.impacted_tickers?.[0]?.ticker ?? 'MARKET';
      const company = enrichment?.impacted_tickers?.[0]?.ticker
        ? `${enrichment.impacted_tickers[0].ticker} (${enrichment.impacted_sectors?.[0]?.sector ?? 'Market'})`
        : 'Broad Market';

      // Use activeModel (stacked) so each event layers on prior events.
      const result = await analyzeImpact({
        company,
        ticker,
        headline: item.title,
        context:  item.description ?? undefined,
        current_model: activeModel,
      });

      if (result) {
        addEvent(
          item.title,
          ticker,
          result.assumption_deltas,
          result.impact_summary
            ? {
                primary_driver: result.impact_summary.primary_driver ?? '',
                direction: result.impact_summary.direction,
                magnitude: result.impact_summary.magnitude,
              }
            : undefined
        );
      }
      setImpactLoadingId(null);
    },
    [analyzeImpact, enrichMap, impactLoadingId, activeModel, addEvent, stack.events]
  );

  // Apply an individual event's updated_model back to the scenario store.
  const handleApplyToModel = useCallback(
    (updatedModel: EventImpactResult['updated_model']) => {
      updateScenarioValue('base', 'revenueGrowth',    updatedModel.revenue_growth    * 100);
      updateScenarioValue('base', 'ebitdaMargin',     updatedModel.ebitda_margin     * 100);
      updateScenarioValue('base', 'wacc',             updatedModel.wacc              * 100);
      updateScenarioValue('base', 'terminalGrowth',   updatedModel.terminal_growth   * 100);
      updateScenarioValue('base', 'capexPctRevenue',  updatedModel.capex_pct_revenue * 100);
    },
    [updateScenarioValue]
  );

  // Apply the full stacked currentModel to the scenario store.
  const handleApplyStackedModel = useCallback(() => {
    updateScenarioValue('base', 'revenueGrowth',    currentModel.revenue_growth    * 100);
    updateScenarioValue('base', 'ebitdaMargin',     currentModel.ebitda_margin     * 100);
    updateScenarioValue('base', 'wacc',             currentModel.wacc              * 100);
    updateScenarioValue('base', 'terminalGrowth',   currentModel.terminal_growth   * 100);
    updateScenarioValue('base', 'capexPctRevenue',  currentModel.capex_pct_revenue * 100);
  }, [currentModel, updateScenarioValue]);

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

  // Track which headlines have already been stacked.
  const stackedHeadlines = useMemo(
    () => new Set(stack.events.map((e) => e.headline)),
    [stack.events]
  );

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

      {/* Event timeline — visible once at least one headline has been stacked */}
      {stack.events.length > 0 && (
        <div className="space-y-3">
          <EventTimeline
            stack={stack}
            timelineIndex={timelineIndex}
            isPlaying={isPlaying}
            isReplaying={isReplaying}
            totalDeltaPct={totalDeltaPct}
            onJumpToIndex={jumpToIndex}
            onRemoveEvent={stackRemoveEvent}
            onClearStack={clearStack}
            onPlayTimeline={playTimeline}
            onStopPlayback={stopPlayback}
            onExitReplay={exitReplay}
          />

          {/* Trading signal — auto-updates as events stack */}
          {signalLoading && <TradingSignalSkeleton />}
          {!signalLoading && signal && <TradingSignalCard signal={signal} />}

          <button
            onClick={handleApplyStackedModel}
            className="w-full rounded-lg border border-cyan-700 bg-cyan-950/50 py-2 text-xs font-semibold text-cyan-300 hover:border-cyan-500 hover:bg-cyan-900/50 hover:text-cyan-100 transition-colors"
          >
            Apply Stacked Model to Scenarios
          </button>
        </div>
      )}

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
              const isStacked = stackedHeadlines.has(item.title);
              const stackedEvent = isStacked
                ? stack.events.find((e) => e.headline === item.title) ?? null
                : null;
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
                  onAnalyzeImpact={isStacked ? undefined : () => { void handleAnalyzeImpact(item); }}
                  impactLoading={impactLoadingId === item.id}
                  impactResult={
                    stackedEvent
                      ? {
                          company: 'Broad Market',
                          ticker: stackedEvent.ticker,
                          headline: stackedEvent.headline,
                          current_model: stack.base_model,
                          assumption_deltas: stackedEvent.deltas,
                          updated_model: stackedEvent.resulting_model,
                          scenarios: {
                            base:     { valuation_delta_pct: stackedEvent.marginal_valuation_delta_pct },
                            upside:   { valuation_delta_pct: stackedEvent.marginal_valuation_delta_pct * 1.5 },
                            downside: { valuation_delta_pct: stackedEvent.marginal_valuation_delta_pct * 0.5 },
                          },
                          impact_summary: stackedEvent.impact_summary ?? {
                            primary_driver: '',
                            direction: 'mixed' as const,
                            magnitude: 'low' as const,
                          },
                          mechanism: [],
                        }
                      : null
                  }
                  onApplyToModel={handleApplyToModel}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
