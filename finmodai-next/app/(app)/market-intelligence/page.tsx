'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { RefreshCw, History, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { BenchmarkLine } from '@/components/charts/recharts/BenchmarkLine';
import { computeBreadthFromSectors, determineSentiment } from '@/lib/view_models/marketBriefStats';
import { buildMarketBriefViewModel, type MarketBriefViewModel } from '@/lib/view_models/marketBrief';
import { viewModelToSnapshot } from '@/lib/types/marketBriefSnapshot';
import { saveSnapshot } from '@/lib/storage/marketBriefStorage';
import { MarketBriefHistory } from '@/components/market-brief/MarketBriefHistory';
import type { MarketBriefSnapshot } from '@/lib/types/marketBriefSnapshot';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { tagHeadline } from '@/lib/view_models/headlineTagger';
import { generateMarketImpact } from '@/lib/view_models/headlineImpact';
import { MarketEventsFeed } from '@/components/market-brief/MarketEventsFeed';
import { clusterMarketEvents, type MarketEvent } from '@/lib/view_models/marketEventClustering';
import { getWatchlistTickers } from '@/lib/market/watchlist';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { fetchWithTimeout, safeGet, safeArray, safeNumber, safeString } from '@/lib/utils/safeFetch';
import { DiagnosticsPanel, type DiagnosticEntry } from '@/components/market-brief/DiagnosticsPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeSeries } from '@/lib/charts/normalize';
import type { ChartPoint } from '@/lib/charts/normalizeChartSeries';
import type { RangeKey } from '@/lib/charts/ranges';

type TimeHorizon = '1D' | '1W' | '1M' | '1Y' | '5Y';

/**
 * Local helper to check if chart has enough data points
 * Returns false if series is undefined, empty, or length < 2
 * Returns true otherwise
 */
function chartHasEnoughData(series: any[] | undefined | null, minPoints: number = 2): boolean {
  if (series === undefined || series === null) {
    return false;
  }
  if (!Array.isArray(series)) {
    return false;
  }
  return series.length >= minPoints;
}
type EnrichPayload = {
  macroSummary: string;
  marketNarrative: string;
  keyDrivers: string[];
  risks: string[];
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
  timestamp: string;
};

type ProviderMeta = { asOf: string; providerUsed: string; stale: boolean; traceId: string };

type ApiResponse<T, M = ProviderMeta> = {
  ok: boolean;
  data?: T;
  meta?: M;
  error?: { code: string; message: string };
};

type MarketIndexSeries = {
  symbol: string;
  points: Array<{ t: string; v: number }>;
};

const BRIEF_ASSET_TICKERS = [
  'SPY',
  'QQQ',
  'DIA',
  'IWM',
  'TLT',
  'HYG',
  'LQD',
  'UUP',
  'GLD',
  'XLE',
  'XLF',
  'XLK',
  'XLY',
  'XLP',
  'XLV',
  'XLI',
  'XLB',
  'XLU',
  'XLRE',
  'XLC',
];

type Benchmark = 'SPY' | 'QQQ' | 'DIA';
type Scale = 'price' | 'return';

export default function MarketIntelligencePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Legacy code - this page is being replaced, but keeping it functional for now
  // Get benchmark and scale from URL params, default to SPY and price
  const benchmarkParam = (searchParams.get('benchmark') || 'SPY').toUpperCase() as Benchmark;
  const scaleParam = (searchParams.get('scale') || 'price') as Scale;
  const benchmark = (benchmarkParam === 'SPY' || benchmarkParam === 'QQQ' || benchmarkParam === 'DIA') 
    ? benchmarkParam 
    : 'SPY';
  const scale = (scaleParam === 'price' || scaleParam === 'return') ? scaleParam : 'price';
  
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('1M');
  const [cachedMarketBrief, setCachedMarketBrief] = useState<MarketBriefViewModel | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<MarketBriefSnapshot | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null); // Track last saved snapshot ID to avoid duplicate saves
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const region = 'US';
  
  const FETCH_TIMEOUT_MS = 10000; // 10 seconds

  // Update URL params when benchmark or scale changes
  const updateSearchParams = (updates: { benchmark?: Benchmark; scale?: Scale }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.benchmark) params.set('benchmark', updates.benchmark);
    if (updates.scale) params.set('scale', updates.scale);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Map time horizon to API range (API supports all ranges)
  const getRangeForApi = (horizon: TimeHorizon): string => {
    return horizon; // All time horizons are supported by the API
  };

  // Fetch benchmark data using /api/macro/market with benchmark and scale params
  const { data: benchmarkResponse, isLoading: benchmarkLoading, refetch: refetchBenchmark } = useQuery({
    queryKey: ['benchmark', benchmark, timeHorizon, scale],
    queryFn: async () => {
      const range = getRangeForApi(timeHorizon);
      const result = await fetchWithTimeout(
        `/api/macro/market?benchmark=${benchmark}&range=${range}&scale=${scale}`,
        {},
        FETCH_TIMEOUT_MS
      );
      
      setDiagnostics((prev) => [
        ...prev.filter((d) => d.name !== 'benchmark'),
        {
          name: 'benchmark',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          timedOut: result.timedOut,
          error: result.error,
        },
      ]);
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch benchmark');
      }
      return result.data;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1, // Only retry once
  });

  const isLoading = benchmarkLoading;
  const isError = false; // Handle errors gracefully - show data if available
  const refetch = async () => {
    await Promise.all([refetchBenchmark(), refetchEnrich()]);
  };
  const isFetching = benchmarkLoading;

  const { data: enrichData, isLoading: enrichLoading, refetch: refetchEnrich } = useQuery({
    queryKey: ['market-enrich', timeHorizon],
    queryFn: async () => {
      const res = await fetch('/api/market/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: 'SPY', // Default ticker for Market Brief context
          region,
          range: timeHorizon,
        }),
      });
      const json = (await res.json()) as ApiResponse<EnrichPayload>;
      return json;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch sector momentum for breadth data with timeout
  const { data: sectorMomentumData } = useQuery({
    queryKey: ['sector-momentum', timeHorizon],
    queryFn: async () => {
      const range = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1W';
      const result = await fetchWithTimeout(
        `/api/market/sector-momentum?range=${range}`,
        {},
        FETCH_TIMEOUT_MS
      );
      
      setDiagnostics((prev) => [
        ...prev.filter((d) => d.name !== 'sector-momentum'),
        {
          name: 'sector-momentum',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          timedOut: result.timedOut,
          error: result.error,
        },
      ]);
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch sector momentum');
      }
      return result.data;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Fetch watchlist performance (uses default featured tickers if no user watchlist)
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
  useEffect(() => {
    // Initialize with default tickers immediately, then check localStorage
    const defaultTickers = getWatchlistTickers();
    setWatchlistTickers(defaultTickers);
  }, []);
  
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist', timeHorizon, watchlistTickers.join(',')],
    queryFn: async () => {
      const range = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1M';
      // If no tickers provided, API will use default featured tickers
      const tickersParam = watchlistTickers.length > 0 ? watchlistTickers.join(',') : '';
      const url = tickersParam 
        ? `/api/market/watchlist?tickers=${tickersParam}&range=${range}`
        : `/api/market/watchlist?range=${range}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch watchlist');
      return res.json();
    },
    enabled: true, // Always enabled - API will use defaults if no tickers
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch headlines separately (slow path) so Market Brief renders immediately.
  const { data: headlinesData, isLoading: headlinesLoading, isFetching: headlinesFetching, refetch: refetchHeadlines } = useQuery({
    queryKey: ['headlines', timeHorizon],
    queryFn: async () => {
      const range = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1W';
      
      try {
        const result = await fetchWithTimeout(
          `/api/market-brief/headlines?range=${range}&limit=20`,
          {},
          FETCH_TIMEOUT_MS
        );
        
        const jsonOk = Boolean((result as any)?.data?.ok);
        const jsonError =
          (result as any)?.data?.error?.message ||
          (result as any)?.data?.meta?.error ||
          result.error ||
          undefined;

        setDiagnostics((prev) => [
          ...prev.filter((d) => d.name !== 'headlines'),
          {
            name: 'headlines',
            ok: Boolean(result.ok && jsonOk),
            elapsedMs: result.elapsedMs,
            timedOut: result.timedOut,
            error: jsonError,
          },
        ]);
        
        if (result.data) return result.data as any;

        return {
          ok: false,
          data: { items: [] },
          error: { code: 'NO_DATA', message: result.error || 'No response body' },
          meta: { requestedRange: range, effectiveRange: range, expanded: false, isCached: false },
        };
      } catch (error) {
        console.warn('Headlines fetch failed, returning empty structure:', error);
        setDiagnostics((prev) => [
          ...prev.filter((d) => d.name !== 'headlines'),
          {
            name: 'headlines',
            ok: false,
            elapsedMs: 0,
            timedOut: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ]);
        return {
          ok: false,
          data: { items: [] },
          error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Unknown error' },
          meta: { requestedRange: range, effectiveRange: range, expanded: false, isCached: false },
        };
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Fetch key asset moves (SPY/QQQ/sector ETFs/hedges) so event cards can show real moves deterministically.
  const { data: assetMovesData } = useQuery({
    queryKey: ['market-brief-assets', timeHorizon],
    queryFn: async () => {
      const range = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1W';
      const tickersParam = BRIEF_ASSET_TICKERS.join(',');
      const result = await fetchWithTimeout(
        `/api/market/watchlist?tickers=${encodeURIComponent(tickersParam)}&range=${range}`,
        {},
        FETCH_TIMEOUT_MS
      );

      setDiagnostics((prev) => [
        ...prev.filter((d) => d.name !== 'asset-moves'),
        {
          name: 'asset-moves',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          timedOut: result.timedOut,
          error: result.error,
        },
      ]);

      if (!result.ok) {
        return { ok: false, tickers: [] as any[] };
      }
      return result.data as any;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Fetch top movers with timeout
  const { data: topMoversData } = useQuery({
    queryKey: ['top-movers', timeHorizon],
    queryFn: async () => {
      const range = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1D';
      const result = await fetchWithTimeout(
        `/api/market/top-movers?range=${range}&limit=10`,
        {},
        FETCH_TIMEOUT_MS
      );
      
      setDiagnostics((prev) => [
        ...prev.filter((d) => d.name !== 'top-movers'),
        {
          name: 'top-movers',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          timedOut: result.timedOut,
          error: result.error,
        },
      ]);
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch top movers');
      }
      return result.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes for top movers
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const loading = isLoading || isFetching;

  // Extract benchmark from /api/macro/market response (new format with series, benchmark, scale, stats)
  const benchmarkSeries = benchmarkResponse?.series || [];
  const benchmarkInfo = benchmarkResponse?.benchmark || { symbol: benchmark, label: benchmark === 'SPY' ? 'S&P 500' : benchmark === 'QQQ' ? 'Nasdaq' : 'Dow' };
  const benchmarkScale = benchmarkResponse?.scale || scale;
  const benchmarkStats = benchmarkResponse?.stats || { start: null, end: null, changePct: null };
  
  // Fallback to legacy format for backward compatibility
  const legacyData = benchmarkResponse?.data;
  const benchmarkMeta = benchmarkResponse;
  
  // Prepare benchmark object for view model
  const benchmarkObj = benchmarkResponse ? {
    ticker: benchmarkInfo.symbol || benchmark,
    returnPct: benchmarkStats.changePct ?? legacyData?.changePct ?? null,
    asOf: benchmarkMeta?.updatedAt || new Date().toISOString(),
    source: benchmarkMeta?.source || 'unknown',
    points: legacyData?.points || [], // Legacy format for view model
  } : null;

  const chartData = useMemo((): ChartPoint[] => {
    const normalized = normalizeSeries(benchmarkResponse);
    if (normalized.length > 0) {
      return normalized.map((point) => ({ time: point.t, value: point.v }));
    }
    return normalizeSeries(legacyData?.points ?? []).map((point) => ({ time: point.t, value: point.v }));
  }, [benchmarkResponse, legacyData]);

  const chartHasData = chartHasEnoughData(chartData, 2); // Need at least 2 points for a valid chart
  const chartRange: RangeKey = timeHorizon === '5Y' ? '1Y' : (timeHorizon as RangeKey);

  // Build breadth from sector momentum - handle both 'data', 'scores', and 'sectors' array formats
  const sectorScores = sectorMomentumData?.sectors || sectorMomentumData?.data || sectorMomentumData?.scores || [];
  
  // Compute breadth from sectors array (using returnPct)
  const breadthCounts = computeBreadthFromSectors(sectorScores);
  const hasBreadthData = sectorScores.length > 0 && (breadthCounts.rising > 0 || breadthCounts.falling > 0 || breadthCounts.flat > 0);
  
  const breadth = hasBreadthData ? {
    sectorsUp: breadthCounts.rising,
    sectorsDown: breadthCounts.falling,
    sectorsFlat: breadthCounts.flat,
    winners: sectorScores
      .filter((s: any) => {
        const returnPct = s.returnPct ?? (s.score ? s.score / 10 : null);
        return returnPct !== null && returnPct > 0;
      })
      .sort((a: any, b: any) => {
        const aReturn = a.returnPct ?? (a.score ? a.score / 10 : 0);
        const bReturn = b.returnPct ?? (b.score ? b.score / 10 : 0);
        return bReturn - aReturn;
      })
      .slice(0, 3)
      .map((s: any) => ({
        sector: s.sector || 'Unknown',
        etf: s.ticker || s.etf || '',
        returnPct: s.returnPct ?? (s.score ? s.score / 10 : 0),
      })),
    losers: sectorScores
      .filter((s: any) => {
        const returnPct = s.returnPct ?? (s.score ? s.score / 10 : null);
        return returnPct !== null && returnPct < 0;
      })
      .sort((a: any, b: any) => {
        const aReturn = a.returnPct ?? (a.score ? a.score / 10 : 0);
        const bReturn = b.returnPct ?? (b.score ? b.score / 10 : 0);
        return aReturn - bReturn;
      })
      .slice(0, 3)
      .map((s: any) => ({
        sector: s.sector || 'Unknown',
        etf: s.ticker || s.etf || '',
        returnPct: s.returnPct ?? (s.score ? s.score / 10 : 0),
      })),
    coverage: sectorMomentumData?.coverage 
      ? `${sectorMomentumData.coverage.ok || sectorScores.length}/${sectorMomentumData.coverage.total || 11} sectors`
      : sectorScores.length > 0
        ? `${sectorScores.length}/11 sectors`
        : undefined,
  } : null;

  // Build headlines with deterministic tags and market impact (6-12 items)
  // Sort by recency + market relevance (Rates/Energy/Earnings/Geopolitics prioritized)
  const allHeadlines = safeArray(headlinesData?.data?.items, [])
    .map((story: any) => {
      const title = safeString(story.title || story.headline || story.headlineText || '');
      const publishedAt = safeString(story.publishedAt || story.published_at || story.published || new Date().toISOString());
      const tag = tagHeadline(title);
      
      // Market relevance score: Rates/Energy/Earnings/Geopolitics = higher priority
      const relevanceScore = 
        tag === 'Rates' ? 4 :
        tag === 'Energy' ? 3 :
        tag === 'Earnings' ? 3 :
        tag === 'Geopolitics' ? 2 :
        1;
      
      // Recency score: more recent = higher score
      const publishedDate = new Date(publishedAt);
      const now = new Date();
      const hoursAgo = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 10 - hoursAgo); // Decay over 10 hours
      
      return {
        story,
        title,
        publishedAt,
        tag,
        relevanceScore,
        recencyScore,
        combinedScore: relevanceScore * 2 + recencyScore, // Weight relevance 2x
      };
    })
    .filter((h: any) => h.title.trim().length > 0)
    .sort((a: any, b: any) => b.combinedScore - a.combinedScore) // Sort by combined score
    .slice(0, 20); // Take top 20 (still clustered into 3–5 events)

  const headlines = allHeadlines.map((h: any) => ({
    title: h.title,
    impact: h.tag,
    publishedAt: h.publishedAt,
    source: safeString(h.story.publisher || h.story.source || h.story.domain || 'Unknown'),
      marketImpact: generateMarketImpact(
        h.title,
        h.tag,
        benchmarkObj?.returnPct ?? null,
        breadth || undefined
      ),
  }));

  const marketEvents: MarketEvent[] = clusterMarketEvents({
    headlines: allHeadlines.map((h: any) => ({
      title: h.title,
      source: safeString(h.story.publisher || h.story.source || h.story.domain || 'Unknown'),
      publishedAt: h.publishedAt,
      url: safeString(h.story.url || h.story.link || '', ''),
      tickers: safeArray(h.story.tickers, []).map((t: any) => safeString(t)),
      summary: safeString(h.story.summary || ''),
    })),
    maxEvents: 5,
  });

  const movesRange: '1D' | '1W' | '1M' = timeHorizon === '1D' || timeHorizon === '1W' || timeHorizon === '1M' ? timeHorizon : '1W';

  const extraTickersForMoves = Array.from(new Set(marketEvents.flatMap((event) => event.affected_tickers)))
    .map((t) => t.toUpperCase())
    .filter(Boolean)
    .filter((t) => !BRIEF_ASSET_TICKERS.includes(t))
    .slice(0, 30);

  const { data: eventMovesData } = useQuery({
    queryKey: ['market-event-moves', movesRange, extraTickersForMoves.join(',')],
    queryFn: async () => {
      const tickersParam = extraTickersForMoves.join(',');
      const result = await fetchWithTimeout(
        `/api/market/moves?tickers=${encodeURIComponent(tickersParam)}&range=${movesRange}`,
        {},
        FETCH_TIMEOUT_MS
      );

      setDiagnostics((prev) => [
        ...prev.filter((d) => d.name !== 'ticker-moves'),
        {
          name: 'ticker-moves',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          timedOut: result.timedOut,
          error: result.error,
        },
      ]);

      if (!result.ok) return { ok: false, moves: {} as Record<string, any> };
      return result.data as any;
    },
    enabled: extraTickersForMoves.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Calculate key stats for Key Stats card
  const hasBenchmark = benchmarkObj?.returnPct !== null && benchmarkObj?.returnPct !== undefined;
  const hasBreadth = breadth !== null && (breadth.sectorsUp > 0 || breadth.sectorsDown > 0);
  const sentimentLabel = determineSentiment(benchmarkObj?.returnPct ?? null, breadth || null);
  const sentimentClass = 
    sentimentLabel === 'Bullish' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
    sentimentLabel === 'Bearish' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
    'bg-slate-700/50 text-slate-300 border-slate-600/30';
  
  // Coverage summary for Key Stats
  const benchmarkCoverage = hasBenchmark ? 'OK' : '—';
  const sectorsCoverage = sectorMomentumData?.coverage 
    ? `${sectorMomentumData.coverage.ok || 0}/${sectorMomentumData.coverage.total || 11}`
    : sectorScores.length > 0
      ? `${sectorScores.length}/11`
      : '—';
  const headlinesCount = marketEvents.length;
  const headlinesCoverage = headlinesCount > 0 ? `${headlinesCount} items` : '—';
  
  // Build indicesMeta from benchmark response
  const indicesMeta = benchmarkMeta ? {
    asOf: benchmarkMeta.updatedAt || new Date().toISOString(),
    providerUsed: benchmarkMeta.source || 'unknown',
    stale: false,
    traceId: undefined,
  } : undefined;

  // Build Market Brief view model with all data
  const marketBrief = buildMarketBriefViewModel({
    enrichData: enrichData as any,
    indicesMeta,
    benchmark: benchmarkObj || undefined,
    breadth: breadth || undefined,
    headlines: headlines.length > 0 ? headlines : undefined,
    sectorMomentum: sectorScores.map((s: any) => ({
      sector: s.sector || 'Unknown',
      score: s.score || 0,
      direction: s.direction || 'flat',
      etf: s.etf,
    })),
  });

  // Cache last successful snapshot to prevent blank UI on refresh
  useEffect(() => {
    const hasCoreCoverage =
      marketBrief.benchmark?.returnPct !== null &&
      marketBrief.benchmark?.returnPct !== undefined &&
      typeof marketBrief.benchmark?.ticker === 'string' &&
      marketBrief.benchmark.ticker.trim().length > 0;

    if (marketBrief.snapshot && hasCoreCoverage && !enrichLoading && !isLoading) {
      setCachedMarketBrief(marketBrief);
      
      // Auto-save snapshot if valid (once per day, or if confidence/sources improved)
      // Only save if not viewing a historical snapshot and snapshot is valid
      if (marketBrief.snapshot && !viewingSnapshot) {
        const snapshot = viewModelToSnapshot(marketBrief);
        if (snapshot) {
          // Storage layer handles duplicate date checking and confidence/source comparison
          // Avoid duplicate save attempts by tracking last saved date
          const today = snapshot.as_of_date;
          if (lastSavedSnapshotRef.current !== today) {
            // Try to save - storage layer will overwrite if confidence/sources improved
            const saved = saveSnapshot(snapshot);
            if (saved) {
              lastSavedSnapshotRef.current = today; // Track by date to avoid duplicate attempts
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marketBrief.snapshot?.summary,
    marketBrief.benchmark?.ticker,
    marketBrief.benchmark?.returnPct,
    marketBrief.sourcesStatus?.lastUpdated,
    enrichLoading,
    isLoading,
    viewingSnapshot,
  ]);

  // Convert viewingSnapshot to MarketBriefViewModel if viewing historical snapshot
  // Historical snapshots use old structure, convert to new structure
  const historicalBrief: MarketBriefViewModel | null = viewingSnapshot ? {
    benchmark: null, // Historical snapshots don't have benchmark data
    breadth: null,
    headlines: [],
    baseCase: viewingSnapshot.summary,
    whoWins: [],
    whoLoses: [],
    mechanisms: [],
    watchOuts: viewingSnapshot.risksAndGaps.map((r: any) => typeof r === 'string' ? r : r.label || ''),
    snapshot: {
      title: viewingSnapshot.title,
      tone: viewingSnapshot.tone,
      summary: viewingSnapshot.summary,
      confidence: viewingSnapshot.confidence,
      confidenceReason: undefined,
    },
    sourcesStatus: viewingSnapshot.sourcesStatus,
  } : null;

  // Use cached brief if current one is loading, otherwise use current or historical
  const liveHasCoreBenchmark =
    marketBrief.benchmark?.returnPct !== null &&
    marketBrief.benchmark?.returnPct !== undefined &&
    typeof marketBrief.benchmark?.ticker === 'string' &&
    marketBrief.benchmark.ticker.trim().length > 0;
  const canUseCachedSnapshot = !viewingSnapshot && Boolean(cachedMarketBrief) && !liveHasCoreBenchmark;

  const displayBrief = viewingSnapshot && historicalBrief
    ? historicalBrief
    : ((enrichLoading || isLoading) && cachedMarketBrief) 
      ? cachedMarketBrief 
      : canUseCachedSnapshot
        ? cachedMarketBrief!
        : marketBrief;
  const isLoadingState = (enrichLoading || isLoading) && !cachedMarketBrief && !viewingSnapshot;
  const usingCachedSnapshot = !viewingSnapshot && Boolean(cachedMarketBrief) && displayBrief === cachedMarketBrief;

  // Map tone to UI class and display (use displayBrief for cached data)
  const marketToneClass =
    displayBrief.snapshot?.tone === 'risk_on'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : displayBrief.snapshot?.tone === 'risk_off'
      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
      : 'bg-slate-700/50 text-slate-300 border-slate-600/30';
  
  const marketToneDisplay =
    displayBrief.snapshot?.tone === 'risk_on'
      ? 'Risk-on'
      : displayBrief.snapshot?.tone === 'risk_off'
      ? 'Risk-off'
      : 'Neutral';

  // Map confidence to UI class and display (use displayBrief for cached data)
  const confidenceClass =
    displayBrief.snapshot?.confidence === 'high'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : displayBrief.snapshot?.confidence === 'medium'
      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-300 border-rose-500/30';

  const confidenceDisplay =
    displayBrief.snapshot?.confidence === 'high'
      ? 'High confidence'
      : displayBrief.snapshot?.confidence === 'medium'
      ? 'Medium confidence'
      : 'Low confidence';

  const confidenceReason = displayBrief.snapshot?.confidenceReason || 
    (displayBrief.snapshot?.confidence === 'high' 
      ? 'High confidence: Complete data coverage with recent macro indicators, market drivers, and risk analysis.'
      : displayBrief.snapshot?.confidence === 'medium'
      ? 'Medium confidence: Most data available, but some gaps or stale data may limit analysis.'
      : 'Low confidence: Multiple data gaps or stale data. Summary is best-effort with limited data.');

  const returnsByTicker = useMemo(() => {
    const map: Record<string, number | null> = {};

    const rows = safeArray((assetMovesData as any)?.tickers, []);
    for (const row of rows) {
      const ticker = safeString(row?.ticker, '').toUpperCase();
      if (!ticker) continue;
      map[ticker] = safeNumber(row?.returnPct, null);
    }

    const moves = (eventMovesData as any)?.moves;
    if (moves && typeof moves === 'object') {
      for (const [tickerRaw, move] of Object.entries(moves)) {
        const ticker = safeString(tickerRaw, '').toUpperCase();
        if (!ticker) continue;
        map[ticker] = safeNumber((move as any)?.changePct, null);
      }
    }

    // Ensure benchmarks always exist in the map if we have them elsewhere.
    if (benchmarkObj?.ticker) {
      const key = benchmarkObj.ticker.toUpperCase();
      if (!(key in map)) map[key] = safeNumber(benchmarkObj.returnPct, null);
    }

    return map;
  }, [assetMovesData, benchmark?.returnPct, benchmark?.ticker, eventMovesData]);

  const formatReturnPct = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const moveClass = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'text-slate-400';
    if (value > 0.3) return 'text-emerald-300';
    if (value < -0.3) return 'text-rose-300';
    return 'text-slate-200';
  };

  const topMovers = topMoversData && typeof topMoversData === 'object' ? (topMoversData as any) : null;
  const gainers = safeArray(topMovers?.gainers, []).slice(0, 5);
  const losers = safeArray(topMovers?.losers, []).slice(0, 5);

  const headlineItemsCount = safeArray(headlinesData?.data?.items, []).length;
  const showHeadlinesSkeleton = !viewingSnapshot && (headlinesLoading || (headlinesFetching && headlineItemsCount === 0));
  const newsUnavailable = !viewingSnapshot && Boolean((headlinesData as any)?.ok === false);

  const headlinesNotice = (() => {
    if (viewingSnapshot) return null;
    const meta: any = (headlinesData as any)?.meta;
    if (!meta) return null;
    if (meta.isCached && meta.cachedAt) {
      const ts = new Date(String(meta.cachedAt));
      return Number.isNaN(ts.getTime()) ? 'Cached headlines' : `Cached headlines (last updated ${format(ts, 'HH:mm')})`;
    }
    if (meta.expanded && meta.effectiveRange && meta.requestedRange) {
      return `Showing headlines from last ${String(meta.effectiveRange)} (expanded from ${String(meta.requestedRange)})`;
    }
    return null;
  })();

  function HeadlinesSkeleton() {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden">
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-5 w-16 bg-white/10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-11/12 bg-white/10" />
                  <Skeleton className="h-4 w-9/12 bg-white/10" />
                  <Skeleton className="h-3 w-40 bg-white/10" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 bg-white/10" />
                <Skeleton className="h-6 w-16 bg-white/10" />
                <Skeleton className="h-6 w-16 bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Market Brief</h1>
            {viewingSnapshot && (
              <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Historical: {format(new Date(viewingSnapshot.as_of_date), 'MMM dd, yyyy')}
              </Badge>
            )}
            {usingCachedSnapshot && !viewingSnapshot && (
              <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs">
                Cached snapshot · {format(new Date(displayBrief.sourcesStatus?.lastUpdated || new Date()), 'HH:mm')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setHistoryOpen(true)}
              variant="outline"
              size="sm"
              className="border-white/5 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60 hover:text-white"
            >
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <button
              onClick={() => {
                if (viewingSnapshot) {
                  setViewingSnapshot(null);
                } else {
                refetch();
                refetchEnrich();
                refetchHeadlines();
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 border border-white/5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {viewingSnapshot ? 'View Today' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Time Horizon Selector */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {(['1D', '1W', '1M', '1Y', '5Y'] as TimeHorizon[]).map((horizon) => (
            <button
              key={horizon}
              onClick={() => setTimeHorizon(horizon)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                timeHorizon === horizon
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-950/60 text-slate-400 border border-white/5 hover:border-emerald-400/30 hover:text-white'
              )}
            >
              {horizon}
            </button>
          ))}
        </div>

        {/* Diagnostics Panel (dev-only) */}
        {diagnostics.length > 0 && <DiagnosticsPanel diagnostics={diagnostics} />}

        {/* Error State */}
        {isError && !cachedMarketBrief && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center mb-6">
            <p className="text-rose-400 mb-4">Failed to load market data</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Summary (fast, never gated on news) */}
        <Card className="rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">Market Brief</h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {displayBrief.baseCase || displayBrief.snapshot?.summary || 'Market summary unavailable.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge className={cn('text-xs px-2 py-0.5', marketToneClass)}>{marketToneDisplay}</Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={cn('text-xs px-2 py-0.5 cursor-help', confidenceClass)}>{confidenceDisplay}</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{confidenceReason}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </Card>

        {/* Row 1: Benchmark + Key Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
            {/* Benchmark and Scale Selectors */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Benchmark:</label>
                <Select value={benchmark} onValueChange={(v) => updateSearchParams({ benchmark: v as Benchmark })}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPY">S&P 500</SelectItem>
                    <SelectItem value="QQQ">Nasdaq</SelectItem>
                    <SelectItem value="DIA">Dow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Scale:</label>
                <Select value={scale} onValueChange={(v) => updateSearchParams({ scale: v as Scale })}>
                  <SelectTrigger className="h-8 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="return">Return %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Benchmark</div>
                <div className="mt-1 flex items-baseline gap-3">
                  <div className="text-lg font-semibold text-white">{benchmarkInfo.label || benchmarkObj?.ticker ?? '—'}</div>
                  <div className={cn('text-sm font-semibold tabular-nums', moveClass(benchmarkObj?.returnPct ?? null))}>
                    {formatReturnPct(benchmarkObj?.returnPct ?? null)}
                  </div>
                  <div className="text-xs text-slate-500">{movesRange}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {benchmarkObj?.source ? `Source: ${benchmarkObj.source}` : 'Source: —'}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {benchmarkObj?.asOf ? `As of ${format(new Date(benchmarkObj.asOf), 'HH:mm')}` : ''}
              </div>
            </div>

            <div className="mt-4 h-56">
              <BenchmarkLine
                data={chartData}
                range={chartRange}
                scale={benchmarkScale === 'return' ? 'Return%' : 'Price'}
                height={224} // h-56 = 224px
                loading={benchmarkLoading}
                error={benchmarkLoading === false && !chartHasData ? 'Failed to load benchmark data' : null}
                onRetry={chartHasData ? undefined : () => refetchBenchmark()}
                strokeColor="#10b981" // emerald-500 to match original
              />
            </div>
          </Card>

          <Card className="rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Key Stats</div>
              <Badge className={cn('text-xs px-2 py-0.5', sentimentClass)}>{sentimentLabel}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3">
                <div className="text-xs text-slate-500">Breadth</div>
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {breadth ? `${breadth.sectorsUp} up · ${breadth.sectorsDown} down` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3">
                <div className="text-xs text-slate-500">Coverage</div>
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {benchmarkCoverage !== '—' ? 'Benchmark ✓' : 'Benchmark —'}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-slate-800/50 text-slate-300 border-slate-700/30 text-xs px-2 py-0.5">
                Benchmark: {benchmarkCoverage}
              </Badge>
              <Badge className="bg-slate-800/50 text-slate-300 border-slate-700/30 text-xs px-2 py-0.5">
                Sectors: {sectorsCoverage}
              </Badge>
              <Badge className="bg-slate-800/50 text-slate-300 border-slate-700/30 text-xs px-2 py-0.5">
                News: {headlinesCoverage}
              </Badge>
            </div>

            {newsUnavailable ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                News unavailable (showing price-only brief).
              </div>
            ) : null}
          </Card>
        </div>

        {/* Row 2: Movers + Sector Momentum */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Top Movers</div>
              <div className="text-xs text-slate-500">{topMovers?.coverage ?? '—'}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-slate-900/30 p-4">
                <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">Gainers</div>
                {gainers.length === 0 ? (
                  <div className="text-sm text-slate-500">No gainers available.</div>
                ) : (
                  <div className="space-y-1.5">
                    {gainers.map((m: any) => (
                      <div key={m.ticker} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200 font-medium">{m.ticker}</span>
                        <span className={cn('tabular-nums', moveClass(m.returnPct))}>{formatReturnPct(m.returnPct)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900/30 p-4">
                <div className="text-xs font-semibold text-rose-300 uppercase tracking-wide mb-2">Losers</div>
                {losers.length === 0 ? (
                  <div className="text-sm text-slate-500">No losers available.</div>
                ) : (
                  <div className="space-y-1.5">
                    {losers.map((m: any) => (
                      <div key={m.ticker} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200 font-medium">{m.ticker}</span>
                        <span className={cn('tabular-nums', moveClass(m.returnPct))}>{formatReturnPct(m.returnPct)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sector Momentum</div>
              <div className="text-xs text-slate-500">{breadth?.coverage ? breadth.coverage : '—'}</div>
            </div>

            {!breadth ? (
              <div className="text-sm text-slate-500">Sector momentum unavailable.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">Winners</div>
                  <div className="space-y-1.5">
                    {breadth.winners.slice(0, 3).map((s: any) => (
                      <div key={`${s.sector}-${s.etf}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{s.sector}</span>
                        <span className={cn('tabular-nums', moveClass(s.returnPct))}>{formatReturnPct(s.returnPct)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-rose-300 uppercase tracking-wide mb-2">Losers</div>
                  <div className="space-y-1.5">
                    {breadth.losers.slice(0, 3).map((s: any) => (
                      <div key={`${s.sector}-${s.etf}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{s.sector}</span>
                        <span className={cn('tabular-nums', moveClass(s.returnPct))}>{formatReturnPct(s.returnPct)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Row 3: Event Feed (headlines are optional) */}
        <Card className="rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Events</div>
              <div className="mt-1 text-sm text-slate-300">
                Clustered, deduplicated market events from live headlines.
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {headlinesNotice ? (
                <Badge className="bg-slate-800/50 text-slate-300 border-slate-700/30 text-xs px-2 py-0.5">
                  {headlinesNotice}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <ErrorBoundary>
              {showHeadlinesSkeleton ? (
                <HeadlinesSkeleton />
              ) : marketEvents.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-slate-900/30 p-8 text-center">
                  <p className="text-slate-400 mb-4">
                    {viewingSnapshot
                      ? 'No headlines stored for this historical snapshot.'
                      : (headlinesData as any)?.ok === false
                      ? 'Headlines unavailable right now.'
                      : 'No headlines for the selected window.'}
                  </p>
                  {!viewingSnapshot && (
                    <Button
                      onClick={() => {
                        refetch();
                        refetchEnrich();
                        refetchHeadlines();
                      }}
                      variant="outline"
                      className="border-white/5 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <MarketEventsFeed events={marketEvents} returnsByTicker={returnsByTicker} rangeLabel={movesRange} />
                </div>
              )}
            </ErrorBoundary>
          </div>
        </Card>

        {/* Footer */}
        {marketEvents.length > 0 && (
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/5">
            <div className="text-xs text-slate-500">
              Showing {marketEvents.length} {marketEvents.length === 1 ? 'event' : 'events'} · Last updated{' '}
              {format(new Date(displayBrief.sourcesStatus?.lastUpdated || new Date()), 'HH:mm')}
                    </div>
            <button
              onClick={() => {
                refetch();
                refetchEnrich();
                refetchHeadlines();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-white/5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300 transition-all disabled:opacity-50 text-xs"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </button>
              </div>
        )}

        {/* History Side Sheet */}
        <MarketBriefHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          currentSnapshot={marketBrief.snapshot ? viewModelToSnapshot(marketBrief) : null}
          onSelectSnapshot={(snapshot) => {
            setViewingSnapshot(snapshot);
            if (snapshot) {
              setHistoryOpen(false);
            }
          }}
        />
              </div>
    </div>
  );
}
