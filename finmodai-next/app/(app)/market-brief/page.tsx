'use client';

// data fetched on client via /api/... routes using React Query

import React, { useMemo, useState, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Flex,
  List,
  Radio,
  Row,
  Select,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ReloadOutlined,
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
  GlobalOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { safeQueryFn } from '@/lib/utils/safeQuery';
import { apiFetchJson } from '@/lib/http/apiFetch';
import { PageShell } from '@/components/ui/PageShell';
import { BenchmarkLine } from '@/components/charts/recharts/BenchmarkLine';
import { extractChartPoints, normalizeChartSeries, type ChartPoint } from '@/lib/charts/normalizeChartSeries';
import { getRangeWindow, type RangeKey } from '@/lib/charts/ranges';
import { ControlRail } from '@/components/ui/ControlRail';
import { TerminalCard } from '@/components/ui/TerminalCard';
import { MarketSnapshot } from '@/components/market-brief/MarketSnapshot';
import crypto from 'crypto';

type ScaleKey = 'Price' | 'Return%';
type RegionKey = 'global' | 'us' | 'europe' | 'asia';
// ContractGuard not used in this page - removed unused import
import { toPct, fmtPct, fmtPctWithValidation } from '@/lib/utils/percent';
import { normalizeHeadlines, type NormalizedHeadline } from '@/lib/data/normalize';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const RANGE_OPTIONS: RangeKey[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y'];

const BENCHMARKS = [
  { label: 'S&P 500 (SPY)', value: 'SPY' },
  { label: 'Nasdaq 100 (QQQ)', value: 'QQQ' },
  { label: 'Dow (DIA)', value: 'DIA' },
];

const TOPIC_OPTIONS = [
  { label: 'All Topics', value: 'all' },
  { label: 'Equities', value: 'equities' },
  { label: 'Macro', value: 'macro' },
  { label: 'Earnings', value: 'equities' }, // Alias
  { label: 'Geopolitics', value: 'geopolitics' },
  { label: 'Commodities', value: 'commodities' },
  { label: 'Rates', value: 'rates' },
  { label: 'Crypto', value: 'crypto' },
];

const IMPACT_OPTIONS = [
  { label: 'All Impact', value: 'all' },
  { label: 'Positive', value: 'positive' },
  { label: 'Neutral', value: 'neutral' },
  { label: 'Negative', value: 'negative' },
];

const SORT_OPTIONS = [
  { label: 'Latest', value: 'latest' },
  { label: 'Highest Confidence', value: 'confidence' },
];

const REGION_OPTIONS: Array<{ label: string; value: RegionKey }> = [
  { label: 'Global', value: 'global' },
  { label: 'US', value: 'us' },
  { label: 'Europe', value: 'europe' },
  { label: 'Asia', value: 'asia' },
];

const TOPIC_COLORS: Record<string, string> = {
  equities: 'blue',
  macro: 'cyan',
  geopolitics: 'red',
  'M&A': 'purple',
  analyst: 'orange',
  commodities: 'gold',
  rates: 'green',
  crypto: 'geekblue',
  default: 'default',
};

const CARD_STYLE = {
  background: 'var(--cb-panel, #0f1117)',
  border: '1px solid var(--cb-border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  boxShadow: 'none',
};

const CARD_BODY_STYLE = { padding: 24 };
const PANEL_CLASS = "rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-sm";

type ImpactTone = 'positive' | 'negative' | 'mixed' | 'neutral';

function impactToneFromHeadline(h: any): ImpactTone {
  // Prefer explicit impact if you have it
  const raw = String(h?.impact ?? '').toLowerCase();
  if (raw.includes('high')) return 'positive';
  if (raw.includes('low')) return 'negative';
  if (raw.includes('med') || raw.includes('medium')) return 'mixed';

  // If your pipeline has sentiment-like fields:
  const s = String(h?.sentiment ?? h?.direction ?? '').toLowerCase();
  if (s.includes('pos')) return 'positive';
  if (s.includes('neg')) return 'negative';

  return 'neutral';
}

function impactPill(tone: ImpactTone) {
  // CapitalBase-ish: dark pills, subtle borders
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.86)',
    whiteSpace: 'nowrap' as const,
  };

  if (tone === 'positive') return { ...base, border: '1px solid rgba(34,197,94,0.30)', background: 'rgba(34,197,94,0.10)', color: 'rgba(187,247,208,0.95)' };
  if (tone === 'negative') return { ...base, border: '1px solid rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.10)', color: 'rgba(254,202,202,0.95)' };
  if (tone === 'mixed') return { ...base, border: '1px solid rgba(245,158,11,0.30)', background: 'rgba(245,158,11,0.10)', color: 'rgba(253,230,138,0.95)' };
  return base;
}

function toneLabel(tone: ImpactTone) {
  if (tone === 'positive') return 'Positive';
  if (tone === 'negative') return 'Negative';
  if (tone === 'mixed') return 'Mixed';
  return 'Neutral';
}

type ArticleInsight = {
  marketImpact: string;
  affectedAssets: string;
};

/**
 * Derive market impact using heuristics (fast + reliable)
 * Covers 80% of cases without LLM
 */
function deriveMarketImpact(article: {
  title: string;
  tags?: string[];
  source?: string;
  topic?: string;
  impact?: string;
}): ArticleInsight {
  const title = String(article.title || '').toLowerCase();
  const topic = String(article.topic || '').toLowerCase();
  const tags = Array.isArray(article.tags) ? article.tags.map((t) => String(t).toLowerCase()) : [];

  // Treasury / Bond / Rates
  if (title.includes('treasur') || title.includes('bond') || title.includes('yield') || topic.includes('rates') || tags.some((t) => t.includes('rate') || t.includes('bond'))) {
    return {
      marketImpact: 'Shifts in Treasury demand affect yields and broader financial conditions.',
      affectedAssets: 'Rates, equities, credit markets',
    };
  }

  // Tariff / Trade
  if (title.includes('tariff') || title.includes('trade') || title.includes('import') || title.includes('export') || tags.some((t) => t.includes('trade'))) {
    return {
      marketImpact: 'Trade policy changes alter cost structures and global risk sentiment.',
      affectedAssets: 'Industrials, exporters, global equities',
    };
  }

  // Earnings
  if (title.includes('earnings') || title.includes('profit') || title.includes('revenue') || tags.some((t) => t.includes('earnings'))) {
    return {
      marketImpact: 'Earnings signals influence valuation expectations and sector rotation.',
      affectedAssets: 'Company shares, sector peers',
    };
  }

  // Fed / Central Bank / Monetary Policy
  if (title.includes('fed') || title.includes('federal reserve') || title.includes('central bank') || title.includes('interest rate') || title.includes('monetary policy') || tags.some((t) => t.includes('fed') || t.includes('policy'))) {
    return {
      marketImpact: 'Monetary policy shifts affect discount rates and asset valuations.',
      affectedAssets: 'Rate-sensitive equities, bonds, growth stocks',
    };
  }

  // Inflation / CPI
  if (title.includes('inflation') || title.includes('cpi') || title.includes('price') || tags.some((t) => t.includes('inflation'))) {
    return {
      marketImpact: 'Inflation trends influence monetary policy expectations and real asset valuations.',
      affectedAssets: 'Equities, bonds, commodities',
    };
  }

  // Employment / Labor
  if (title.includes('employment') || title.includes('jobs') || title.includes('unemployment') || title.includes('labor') || tags.some((t) => t.includes('labor'))) {
    return {
      marketImpact: 'Labor market conditions affect consumer spending and policy expectations.',
      affectedAssets: 'Consumer sectors, rate-sensitive assets',
    };
  }

  // Geopolitics / War / Conflict
  if (title.includes('war') || title.includes('conflict') || title.includes('sanction') || title.includes('geopolitic') || tags.some((t) => t.includes('geopolitic'))) {
    return {
      marketImpact: 'Geopolitical events create uncertainty and can disrupt supply chains and risk sentiment.',
      affectedAssets: 'Defense, energy, global equities',
    };
  }

  // Default fallback
  return {
    marketImpact: 'The development may influence market sentiment and near-term positioning.',
    affectedAssets: 'Broader equity markets',
  };
}

/**
 * Build market impact insight for article expansion
 * Uses heuristics first, falls back to LLM-generated if available
 */
function buildMarketImpact(h: any): ArticleInsight {
  // Prefer explicit fields if available (from LLM or manual)
  if (h?.marketImpact && h?.affectedAssets) {
    return {
      marketImpact: String(h.marketImpact),
      affectedAssets: String(h.affectedAssets),
    };
  }

  // Use heuristic derivation
  return deriveMarketImpact({
    title: h?.canonicalTitle ?? h?.title ?? '',
    tags: h?.tags ?? [],
    source: h?.source ?? '',
    topic: h?.topic ?? '',
    impact: h?.impact ?? '',
  });
}

// fmtPct is imported from lib/utils/percent - handles normalization and validation

function fmtNum(x?: number | null) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Hook to fetch LLM-generated impact summary for a headline
 * Only fetches when the headline is expanded
 */
function useHeadlineImpact(args: {
  id: string;
  title: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  topics?: string[];
  benchmark: string;
  range: string;
  region: string;
  excerpt?: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['market-brief', 'impact', args.id, args.benchmark, args.range, args.region],
    enabled: args.enabled, // only when dropdown open
    staleTime: 24 * 60 * 60 * 1000, // 24h
    queryFn: async () => {
      const res = await apiFetchJson('/api/market-brief/impact', {
        method: 'POST',
        body: JSON.stringify({
          id: args.id,
          title: args.title,
          source: args.source ?? '',
          url: args.url,
          publishedAt: args.publishedAt ?? '',
          topics: args.topics ?? [],
          benchmark: args.benchmark,
          range: args.range,
          region: args.region,
          excerpt: args.excerpt ?? '',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res?.ok) throw new Error(res?.error ?? 'impact_failed');
      return res.data as {
        summary: string;
      };
    },
  });
}

/**
 * Component that renders headline impact content (LLM-generated or fallback)
 */
function HeadlineImpactContent({
  id,
  title,
  source,
  url,
  publishedAt,
  topics,
  benchmark,
  range,
  region,
  excerpt,
  isExpanded,
  fallbackInsight,
}: {
  id: string;
  title: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  topics?: string[];
  benchmark: string;
  range: string;
  region: string;
  excerpt?: string;
  isExpanded: boolean;
  fallbackInsight: { marketImpact: string; affectedAssets: string };
}) {
  const impactQuery = useHeadlineImpact({
    id,
    title,
    source,
    url,
    publishedAt,
    topics,
    benchmark,
    range,
    region,
    excerpt,
    enabled: isExpanded,
  });

  return (
    <div
      style={{
        padding: '10px 12px 14px',
        marginTop: 6,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.18)',
      }}
    >
      {impactQuery.isLoading ? (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.05)',
            fontSize: '13px',
            color: 'rgba(255,255,255,0.60)',
            textAlign: 'center',
          }}
        >
          Generating impact…
        </div>
      ) : impactQuery.isError ? (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(239,68,68,0.10)',
            fontSize: '13px',
            color: 'rgba(254,202,202,0.95)',
          }}
        >
          Couldn&apos;t generate summary. Showing fallback:
          <div style={{ marginTop: 8, fontSize: '12.5px', lineHeight: '20px', color: 'rgba(255,255,255,0.85)' }}>
            <p style={{ margin: 0, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,1)' }}>Market impact:</span>{' '}
              {fallbackInsight.marketImpact}
            </p>
            <p style={{ margin: 0 }}>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,1)' }}>Who&apos;s affected:</span>{' '}
              {fallbackInsight.affectedAssets}
            </p>
          </div>
        </div>
      ) : impactQuery.data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p
            style={{
              fontSize: '13px',
              lineHeight: '22px',
              color: 'rgba(255,255,255,0.90)',
              margin: 0,
            }}
          >
            {impactQuery.data.summary}
          </p>

          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                marginTop: 4,
                fontSize: '12px',
                color: 'rgba(56,189,248,0.95)', // CapitalBase teal
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Open source →
            </a>
          ) : null}
        </div>
      ) : (
        // Fallback to heuristic-based insight
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '12.5px', lineHeight: '20px', color: 'rgba(255,255,255,0.85)' }}>
            <p style={{ margin: 0, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,1)' }}>Market impact:</span>{' '}
              {fallbackInsight.marketImpact}
            </p>
            <p style={{ margin: 0 }}>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,1)' }}>Who&apos;s affected:</span>{' '}
              {fallbackInsight.affectedAssets}
            </p>
          </div>

          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                marginTop: 4,
                fontSize: '12px',
                color: 'rgba(56,189,248,0.95)', // CapitalBase teal
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Open source →
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Stable ID generation for stories (client-safe)
function cheapStableId(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function storyId(s: any) {
  if (s?.id) return s.id;
  const base = `${s?.title ?? s?.canonicalTitle ?? ""}|${s?.publishedAt ?? s?.ts ?? ""}|${s?.source ?? ""}`;
  return cheapStableId(base);
}

export default function MarketBriefPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isDebug = searchParams.get('debug') === '1';
  
  // Read region from URL query param, fallback to 'global'
  const regionFromUrl = searchParams.get('region') as RegionKey | null;
  const validRegion: RegionKey = regionFromUrl && ['global', 'us', 'europe', 'asia'].includes(regionFromUrl) 
    ? regionFromUrl 
    : 'global';
  
  const [range, setRange] = useState<RangeKey>('1W');
  const [benchmark, setBenchmark] = useState<string>('SPY');
  const [scale, setScale] = useState<ScaleKey>('Price');
  const [region, setRegion] = useState<RegionKey>(validRegion);
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [impactFilter, setImpactFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');
  const [expandedHeadlines, setExpandedHeadlines] = useState<string[]>([]);
  const [storySummaries, setStorySummaries] = useState<Record<string, { summaryText: string; mode: 'ai' | 'fallback' }>>({});
  const [pendingSummaries, setPendingSummaries] = useState<Record<string, boolean>>({});
  
  // Update URL query param when region changes
  const handleRegionChange = useCallback((newRegion: RegionKey) => {
    setRegion(newRegion);
    const params = new URLSearchParams(searchParams.toString());
    if (newRegion === 'global') {
      params.delete('region'); // Remove param for default value
    } else {
      params.set('region', newRegion);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const rangeWindow = useMemo(() => getRangeWindow(range), [range]);
  const buildRangeParams = useCallback(() => {
    const { startISO, endISO, interval } = rangeWindow;
    return new URLSearchParams({
      range,
      start: startISO,
      end: endISO,
      interval,
    });
  }, [range, rangeWindow]);
  
  // Individual API queries with per-endpoint error handling
  const chartQuery = useQuery({
    queryKey: ['market-brief', 'chart', benchmark, range, region],
    queryFn: safeQueryFn(
      async () => {
        const url = `/api/market/chart?symbol=${encodeURIComponent(benchmark)}&range=${encodeURIComponent(range)}&region=${encodeURIComponent(region)}`;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[MB] chart fetch', url);
        }
        const raw = await apiFetchJson(url);
        return raw;
      },
      ['market-brief', 'chart', benchmark, range, region]
    ),
    staleTime: 60_000, // 1 minute cache
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data if available
  });

  const headlinesQuery = useQuery({
    queryKey: ['market-brief', 'headlines', region],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        params.set('region', region);
        return await apiFetchJson(`/api/market-brief/headlines?${params.toString()}`);
      },
      ['market-brief', 'headlines', range, region]
    ),
    staleTime: 60_000, // 1 minute cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const moversQuery = useQuery({
    queryKey: ['market-brief', 'movers'],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        params.set('limit', '10');
        return await apiFetchJson(`/api/market/top-movers?${params.toString()}`);
      },
      ['market-brief', 'movers', range]
    ),
    staleTime: 60_000, // 1 minute cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const sectorsQuery = useQuery({
    queryKey: ['market-brief', 'sectors'],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        return await apiFetchJson(`/api/market/sector-momentum?${params.toString()}`);
      },
      ['market-brief', 'sectors', range]
    ),
    staleTime: 60_000, // 1 minute cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Additional market indices for snapshot
  const spyQuery = useQuery({
    queryKey: ['market-snapshot', 'spy', range, region],
    queryFn: safeQueryFn(
      async () => {
        const url = `/api/market/chart?symbol=SPY&range=${encodeURIComponent(range)}&region=${encodeURIComponent(region)}`;
        return await apiFetchJson(url);
      },
      ['market-snapshot', 'spy', range, region]
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const qqqQuery = useQuery({
    queryKey: ['market-snapshot', 'qqq', range, region],
    queryFn: safeQueryFn(
      async () => {
        const url = `/api/market/chart?symbol=QQQ&range=${encodeURIComponent(range)}&region=${encodeURIComponent(region)}`;
        return await apiFetchJson(url);
      },
      ['market-snapshot', 'qqq', range, region]
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const iwmQuery = useQuery({
    queryKey: ['market-snapshot', 'iwm', range, region],
    queryFn: safeQueryFn(
      async () => {
        const url = `/api/market/chart?symbol=IWM&range=${encodeURIComponent(range)}&region=${encodeURIComponent(region)}`;
        return await apiFetchJson(url);
      },
      ['market-snapshot', 'iwm', range, region]
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // SINGLE NORMALIZATION STEP - converts API response to canonical ChartPoint[]
  // ✅ CRITICAL: This is the ONLY place normalization happens
  const chartSeries = useMemo((): ChartPoint[] => {
    const normalized = normalizeChartSeries(chartQuery.data);
    if (process.env.NODE_ENV !== 'production') {
      const rawPoints = extractChartPoints(chartQuery.data);
      console.log('[MB] normalized series', {
        rawPoints: rawPoints.length,
        normalized: normalized.length,
      });
    }
    
    // Dev-only: Defensive logging to confirm data flow
    if (process.env.NODE_ENV === 'development') {
      if (chartQuery.data === null && !chartQuery.isLoading) {
        console.warn('[market-brief] Chart query returned null - API request may have failed', {
          isError: chartQuery.isError,
          error: chartQuery.error,
        });
      } else if (normalized.length === 0 && chartQuery.data && !chartQuery.isLoading) {
        console.warn('[market-brief] ❌ Chart data normalized to empty array', {
          hasData: !!chartQuery.data,
          dataKeys: chartQuery.data ? Object.keys(chartQuery.data) : [],
        });
      } else if (normalized.length > 0) {
        console.log(`[market-brief] ✅ Chart data normalized: ${normalized.length} points`);
      }
    }
    
    return normalized;
  }, [chartQuery.data]); // ONLY depend on query.data - range/benchmark changes trigger new query

  const chartSeriesDisplay = useMemo((): ChartPoint[] => {
    if (scale !== 'Return%') {
      return chartSeries;
    }
    if (chartSeries.length < 2) {
      return chartSeries;
    }
    const base = chartSeries[0]?.value ?? 0;
    if (!Number.isFinite(base) || base === 0) {
      return chartSeries;
    }
    return chartSeries.map((point) => ({
      time: point.time,
      value: (point.value - base) / base,
    }));
  }, [chartSeries, scale]);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[MB] display series count', {
      display: chartSeriesDisplay.length,
    });
  }

  // Use normalized headlines - all fields guaranteed
  const adaptHeadlines = (raw: any): NormalizedHeadline[] => {
    return normalizeHeadlines(raw);
  };

  const adaptMovers = (raw: any): Array<{ symbol: string; changePct: number; changePctValid?: boolean; changePctReason?: string; name?: string; reason?: string }> => {
    if (!raw) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[market-brief] adaptMovers: raw data is null/undefined');
      }
      return [];
    }
    
    // Handle responses with or without 'ok' field
    // API format: { ok: true, gainers: [{ ticker, returnPct, price?, source }], losers: [{ ticker, returnPct, price?, source }] }
    // Or error format: { ok: false, gainers: [], losers: [] }
    // Still try to extract data even if ok is false, in case there's partial data
    const gainers = Array.isArray(raw.gainers) ? raw.gainers : [];
    const losers = Array.isArray(raw.losers) ? raw.losers : [];
    
    if (gainers.length === 0 && losers.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[market-brief] adaptMovers: No movers data found', {
          hasRaw: !!raw,
          hasGainers: !!raw?.gainers,
          hasLosers: !!raw?.losers,
          ok: raw?.ok,
          rawKeys: raw ? Object.keys(raw) : [],
        });
      }
      return [];
    }
    
    // Note: API returns returnPct in decimal format (0.12 for 12%), but toPct() handles both decimal and percentage for safety
    const allMovers = [
      ...gainers.map((g: any) => ({ 
        ticker: g.ticker ?? g.symbol ?? '',
        returnPct: g.returnPct ?? 0,
        price: g.price,
        source: g.source,
      })),
      ...losers.map((l: any) => ({ 
        ticker: l.ticker ?? l.symbol ?? '',
        returnPct: l.returnPct ?? 0,
        price: l.price,
        source: l.source,
      })),
    ];
    // Sort by absolute return percentage (highest first) - use original values for sorting
    allMovers.sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct));
    return allMovers
      .slice(0, 10)
      .map((m: any) => {
        // Normalize returnPct to decimal format (API now returns decimal, but toPct() handles both for safety)
        // Use 'weekly' context for validation (top movers typically use weekly/monthly ranges)
        const normalizedResult = toPct(Number(m.returnPct) || 0, 'weekly');
        return {
          symbol: m.ticker ?? m.symbol ?? '',
          changePct: normalizedResult.value, // Store normalized decimal value
          changePctValid: normalizedResult.isValid, // Store validation flag
          changePctReason: normalizedResult.reason, // Store reason if invalid
          name: m.name ?? m.company ?? '',
          reason: m.reason ?? m.summary ?? '',
        };
      });
  };

  const adaptSectors = (raw: any): Array<{ sector: string; momentum: number; returnPct?: number; returnPctValid?: boolean; returnPctReason?: string }> => {
    if (!raw) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[market-brief] adaptSectors: raw data is null/undefined');
      }
      return [];
    }
    
    // Handle responses with or without 'ok' field - still try to extract data even if ok is false
    // API format: { ok: true, sectors: [{ sector, score, direction, returnPct }], data: [...] }
    // Note: API returns returnPct in decimal format (0.12 for 12%), but toPct() handles both decimal and percentage for safety
    const sectors = raw.sectors ?? raw.data ?? [];
    return sectors.map((s: any) => {
      const rawReturnPct = s.returnPct ?? s.score ?? s.momentum ?? 0;
      // Normalize returnPct to decimal format for consistent display
      // Use 'monthly' context for validation (sector momentum typically uses monthly ranges)
      const normalizedResult = toPct(Number(rawReturnPct) || 0, 'monthly');
      return {
        sector: s.sector ?? s.name ?? '',
        // API returns 'score' as the momentum value (keep original for momentum calculation)
        momentum: s.score ?? s.momentum ?? 0,
        returnPct: normalizedResult.value, // Store normalized decimal value
        returnPctValid: normalizedResult.isValid, // Store validation flag
        returnPctReason: normalizedResult.reason, // Store reason if invalid
      };
    }).filter((s: any) => s.sector && s.sector.trim().length > 0);
  };

  // Extract normalized data from queries
  const headlinesData = useMemo(() => adaptHeadlines(headlinesQuery.data), [headlinesQuery.data]);
  const moversData = useMemo(() => {
    return adaptMovers(moversQuery.data);
  }, [moversQuery.data]);
  const sectorsData = useMemo(() => adaptSectors(sectorsQuery.data), [sectorsQuery.data]);

  // Process market snapshot indices data
  const snapshotIndices = useMemo(() => {
    const processIndex = (query: any, symbol: string, name: string) => {
      const data = normalizeChartSeries(query.data);
      let changePct: number | null = null;
      
      if (data.length >= 2) {
        const first = data[0]?.value;
        const last = data[data.length - 1]?.value;
        if (first && last && first !== 0) {
          changePct = (last / first - 1);
        }
      }
      
      return {
        symbol,
        name,
        data,
        loading: query.isLoading,
        error: query.isError ? (query.error?.message || 'Failed to load data') : null,
        changePct,
      };
    };

    return [
      processIndex(spyQuery, 'SPY', 'S&P 500'),
      processIndex(qqqQuery, 'QQQ', 'Nasdaq 100'),
      processIndex(iwmQuery, 'IWM', 'Russell 2000'),
    ];
  }, [spyQuery.data, qqqQuery.data, iwmQuery.data, spyQuery.isLoading, qqqQuery.isLoading, iwmQuery.isLoading, spyQuery.isError, qqqQuery.isError, iwmQuery.isError, spyQuery.error?.message, qqqQuery.error?.message, iwmQuery.error?.message]);

  // Fetch per-story AI summaries
  React.useEffect(() => {
    if (!headlinesData || headlinesData.length === 0) return;

    const storiesWithIds = headlinesData.map((h: any) => ({
      ...h,
      id: storyId(h),
    }));

    const missing = storiesWithIds.filter((s: any) => !storySummaries[s.id] && !pendingSummaries[s.id]);
    if (missing.length === 0) return;

    // Mark as pending
    setPendingSummaries((prev) => {
      const next = { ...prev };
      for (const s of missing) next[s.id] = true;
      return next;
    });

    // Fetch summaries
    fetch('/api/macro/story-summaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stories: missing.map((s: any) => ({
          id: s.id,
          title: s.canonicalTitle || s.title,
          source: s.source,
          publishedAt: s.publishedAt || s.ts,
          assetClass: s.assetClass,
          region: s.region,
          direction: s.direction,
          impact: s.impact,
          channel: s.channel,
          url: s.url,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const map = data?.summariesById ?? {};
        setStorySummaries((prev) => ({ ...prev, ...map }));
      })
      .catch((err) => {
        console.error('[market-brief] Failed to fetch summaries', err);
      })
      .finally(() => {
        setPendingSummaries((prev) => {
          const next = { ...prev };
          for (const s of missing) delete next[s.id];
          return next;
        });
      });
  }, [headlinesData]);

  // Legacy briefData structure for compatibility
  // Optimized: Only depend on data arrays, not error objects (which change frequently)
  const briefData = useMemo(() => ({
    chartPoints: chartSeries,
    headlines: headlinesData,
    movers: moversData,
    sectors: sectorsData,
    meta: {
      traceId: '',
      errors: [
        ...(chartQuery.isError ? [{ endpoint: '/api/market/chart', error: String(chartQuery.error?.message || 'Chart fetch failed') }] : []),
        ...(headlinesQuery.isError ? [{ endpoint: '/api/market-brief/headlines', error: String(headlinesQuery.error?.message || 'Headlines fetch failed') }] : []),
        ...(moversQuery.isError ? [{ endpoint: '/api/market/top-movers', error: String(moversQuery.error?.message || 'Movers fetch failed') }] : []),
        ...(sectorsQuery.isError ? [{ endpoint: '/api/market/sector-momentum', error: String(sectorsQuery.error?.message || 'Sectors fetch failed') }] : []),
      ],
      warnings: [],
    },
  }), [chartSeries, headlinesData, moversData, sectorsData, 
       chartQuery.isError, headlinesQuery.isError, moversQuery.isError, sectorsQuery.isError,
       // Extract error messages as strings to avoid object reference changes
       chartQuery.error?.message, headlinesQuery.error?.message, moversQuery.error?.message, sectorsQuery.error?.message]);
  
  // Compute KPIs from chartSeries (always use absolute prices, regardless of scale)
  const kpi = useMemo(() => {
    // chartSeries is canonical SeriesPoint[] with absolute prices
    if (!chartSeries || chartSeries.length < 2) {
      return { 
        ret: null as number | null, 
        last: null as number | null, 
        vol: null as number | null 
      };
    }

    // Get first and last values from chartSeries
    const firstPoint = chartSeries[0];
    const lastPoint = chartSeries[chartSeries.length - 1];
    
    const firstClose = firstPoint?.value;
    const lastClose = lastPoint?.value;

    // Validate data
    if (
      firstClose === null || 
      firstClose === undefined || 
      !Number.isFinite(firstClose) ||
      lastClose === null || 
      lastClose === undefined || 
      !Number.isFinite(lastClose) ||
      firstClose === 0
    ) {
      return { ret: null, last: null, vol: null };
    }

    // Period Return = (lastClose / firstClose - 1) * 100
    // Always calculate from absolute price values
    let ret: number | null = (lastClose / firstClose - 1);

    // Validate return calculation
    if (!Number.isFinite(ret) || Number.isNaN(ret)) {
      ret = null;
    }

    // Last Level = lastClose (always show for Price scale, hide for Return% scale in UI)
    const last = Number.isFinite(lastClose) ? lastClose : null;

    // Volatility proxy = std dev of log returns within the selected range
    let vol: number | null = null;
    if (chartSeries.length >= 3) {
      const returns: number[] = [];
      
      // Calculate period-to-period log returns
      for (let i = 1; i < chartSeries.length; i++) {
        const prev = chartSeries[i - 1]?.value;
        const cur = chartSeries[i]?.value;
        
        if (
          prev !== null && 
          prev !== undefined && 
          Number.isFinite(prev) &&
          cur !== null && 
          cur !== undefined && 
          Number.isFinite(cur) &&
          prev !== 0
        ) {
          if (prev > 0 && cur > 0) {
            const periodReturn = Math.log(cur / prev);
            if (Number.isFinite(periodReturn) && !Number.isNaN(periodReturn)) {
              returns.push(periodReturn);
            }
          }
        }
      }

      // Calculate standard deviation of returns
      if (returns.length >= 2) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        // Validate volatility
        if (Number.isFinite(stdDev) && !Number.isNaN(stdDev) && stdDev >= 0) {
          vol = stdDev;
        }
      }
    }

    return { ret, last, vol };
  }, [chartSeries]);

  // Headlines from individual query (now using normalized data with guaranteed fields)
  const headlineItems = useMemo(() => {
    let filtered = headlinesData ?? [];

    // Topic filter
    if (topicFilter !== 'all') {
      filtered = filtered.filter((h: any) => String(h?.topic ?? '').toLowerCase() === topicFilter.toLowerCase());
    }

    // Impact filter: map tone
    if (impactFilter !== 'all') {
      filtered = filtered.filter((h: any) => {
        const tone = impactToneFromHeadline(h);
        // map to your UI filters
        if (impactFilter === 'positive') return tone === 'positive';
        if (impactFilter === 'negative') return tone === 'negative';
        if (impactFilter === 'neutral') return tone === 'neutral';
        return tone === 'mixed';
      });
    }

    // Sort
    const sorted = [...filtered].sort((a: any, b: any) => {
      if (sortBy === 'confidence') {
        const confA = Number(a?.confidence ?? 0);
        const confB = Number(b?.confidence ?? 0);
        return confB - confA;
      }
      const dateA = String(a?.publishedAt ?? a?.ts ?? '');
      const dateB = String(b?.publishedAt ?? b?.ts ?? '');
      return dateB.localeCompare(dateA);
    });

    return sorted.slice(0, 25).map((h: any, idx: number) => {
      const title = String(h?.canonicalTitle ?? h?.title ?? 'Untitled');
      const source = String(h?.source ?? 'Unknown');
      const ts = String(h?.publishedAt ?? h?.ts ?? '');
      const url = h?.url ? String(h.url) : '';
      const topic = String(h?.topic ?? 'macro');
      const topics = Array.isArray(h?.tags) ? h.tags : h?.topic ? [h.topic] : [];

      const tone = impactToneFromHeadline(h);
      const insight = buildMarketImpact(h);

      const key = storyId(h);
      const isExpanded = expandedHeadlines.includes(key);
      const summary = storySummaries[key];
      const isPending = pendingSummaries[key];

      return {
        key,
        label: (
          <div
            style={{
              width: '100%',
              padding: '10px 10px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              cursor: url ? 'pointer' : 'default',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* left: tiny accent bar */}
              <div
                style={{
                  width: 3,
                  height: 44,
                  borderRadius: 999,
                  background:
                    tone === 'positive'
                      ? 'rgba(34,197,94,0.9)'
                      : tone === 'negative'
                      ? 'rgba(239,68,68,0.9)'
                      : tone === 'mixed'
                      ? 'rgba(245,158,11,0.9)'
                      : 'rgba(148,163,184,0.8)',
                  marginTop: 2,
                  flexShrink: 0,
                }}
              />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: '18px',
                    fontWeight: 650,
                    color: 'rgba(255,255,255,0.92)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    wordBreak: 'break-word',
                  }}
                >
                  {title}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  {/* Topic pill (subtle) */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.78)',
                    }}
                  >
                    {topic}
                  </span>

                  {/* Impact pill */}
                  <span style={impactPill(tone)}>{toneLabel(tone)}</span>

                  {/* Source + time (no extra tags) */}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', minWidth: 0 }}>
                    {source}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                    {ts ? ts.slice(0, 19).replace('T', ' ') : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ),
        children: (
          <div
            style={{
              padding: '12px 14px',
              marginTop: 6,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: '12px', color: 'rgba(255,255,255,0.70)' }}>
                AI Summary
              </Text>
              <Tag
                color={isPending ? 'processing' : summary?.mode === 'ai' ? 'success' : 'default'}
                style={{ fontSize: '10px', textTransform: 'uppercase' }}
              >
                {isPending ? 'generating' : summary?.mode ?? 'fallback'}
              </Tag>
            </div>
            
            <div style={{ fontSize: '13px', lineHeight: '20px', color: 'rgba(255,255,255,0.90)' }}>
              {isPending ? (
                <Text type="secondary">Generating summary…</Text>
              ) : summary?.summaryText ? (
                summary.summaryText
              ) : (
                `${insight.marketImpact} Who is affected: ${insight.affectedAssets}.`
              )}
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  marginTop: 10,
                  fontSize: '12px',
                  color: 'rgba(56,189,248,0.95)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Open source →
              </a>
            )}
          </div>
        ),
      };
    });
  }, [headlinesData, topicFilter, impactFilter, sortBy, storySummaries, pendingSummaries]);

  const chartSignature = useMemo(() => {
    if (!chartSeries || chartSeries.length === 0) return null;
    const first = chartSeries[0];
    const last = chartSeries[chartSeries.length - 1];
    return `${chartSeries.length}:${first?.time ?? 0}:${last?.time ?? 0}:${first?.value ?? 0}:${last?.value ?? 0}`;
  }, [chartSeries]);

  const lastChartSignatureRef = React.useRef<{
    range: RangeKey;
    benchmark: string;
    region: RegionKey;
    scale: ScaleKey;
    signature: string | null;
  }>({ range, benchmark, region, scale, signature: chartSignature });

  React.useEffect(() => {
    const prev = lastChartSignatureRef.current;
    if (
      prev.signature &&
      chartSignature &&
      prev.signature === chartSignature &&
      (prev.range !== range || prev.benchmark !== benchmark || prev.region !== region || prev.scale !== scale)
    ) {
      console.warn('[market-brief] API ignored params', {
        range,
        benchmark,
        region,
        scale,
      });
    }
    lastChartSignatureRef.current = { range, benchmark, region, scale, signature: chartSignature };
  }, [chartSignature, range, benchmark, region, scale]);

  // Sectors from individual query
  const sectorItems = useMemo(() => {
    return sectorsData.slice(0, 12).map((s: any) => ({
      name: s.sector ?? s.name ?? 'Sector',
      value: s.returnPct ?? s.momentum ?? 0,
      valueValid: s.returnPctValid !== false, // Default to true if not set (backward compatibility)
      valueReason: s.returnPctReason,
    }));
  }, [sectorsData]);

  // Movers from individual query
  const movers = useMemo(() => {
    return moversData.slice(0, 10).map((m: any) => ({
      ticker: m.symbol ?? '—',
      name: m.name ?? '',
      change: m.changePct ?? 0,
      changeValid: m.changePctValid !== false, // Default to true if not set
      changeReason: m.changePctReason,
      reason: m.reason ?? '',
    }));
  }, [moversData]);

  const handleRefresh = useCallback(() => {
    chartQuery.refetch();
    headlinesQuery.refetch();
    moversQuery.refetch();
    sectorsQuery.refetch();
  }, [chartQuery.refetch, headlinesQuery.refetch, moversQuery.refetch, sectorsQuery.refetch]);

  const loadingAny = chartQuery.isLoading || chartQuery.isFetching;
  React.useEffect(() => {
    headlinesQuery.refetch();
    moversQuery.refetch();
    sectorsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Determine data status for each panel from individual queries
  // Optimized: Extract primitive values to avoid depending on query objects (which change on every render)
  const dataStatus = useMemo(() => {
    const getPanelStatus = (isLoading: boolean, isError: boolean, errorMsg: string | undefined, data: any[], endpoint: string) => {
      if (isLoading) return { status: 'loading' as const, endpoint };
      if (isError) return { status: 'error' as const, endpoint, error: errorMsg || 'Fetch failed' };
      if (!data || data.length === 0) return { status: 'empty' as const, endpoint };
      return { status: 'ok' as const, endpoint };
    };
    
    return {
      series: getPanelStatus(chartQuery.isLoading, chartQuery.isError, chartQuery.error?.message, chartSeries, '/api/market/chart'),
      headlines: getPanelStatus(headlinesQuery.isLoading, headlinesQuery.isError, headlinesQuery.error?.message, headlinesData, '/api/market-brief/headlines'),
      sectors: getPanelStatus(sectorsQuery.isLoading, sectorsQuery.isError, sectorsQuery.error?.message, sectorsData, '/api/market/sector-momentum'),
      movers: getPanelStatus(moversQuery.isLoading, moversQuery.isError, moversQuery.error?.message, moversData, '/api/market/top-movers'),
      traceId: '',
      errors: briefData.meta.errors,
    };
  }, [
    chartQuery.isLoading, chartQuery.isError, chartQuery.error?.message, chartSeries,
    headlinesQuery.isLoading, headlinesQuery.isError, headlinesQuery.error?.message, headlinesData,
    sectorsQuery.isLoading, sectorsQuery.isError, sectorsQuery.error?.message, sectorsData,
    moversQuery.isLoading, moversQuery.isError, moversQuery.error?.message, moversData,
    briefData.meta.errors
  ]);

  // Diagnostics panel items
  const diagnosticsItems = useMemo(() => {
    return [
      {
        key: 'endpoints',
        label: 'Diagnostics',
        children: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Row gutter={[16, 8]}>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Chart Series</Text>
                  <Tag color={dataStatus.series.status === 'ok' ? 'success' : dataStatus.series.status === 'loading' ? 'processing' : dataStatus.series.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.series.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.series.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Headlines</Text>
                  <Tag color={dataStatus.headlines.status === 'ok' ? 'success' : dataStatus.headlines.status === 'loading' ? 'processing' : dataStatus.headlines.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.headlines.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.headlines.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Sectors</Text>
                  <Tag color={dataStatus.sectors.status === 'ok' ? 'success' : dataStatus.sectors.status === 'loading' ? 'processing' : dataStatus.sectors.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.sectors.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.sectors.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Movers</Text>
                  <Tag color={dataStatus.movers.status === 'ok' ? 'success' : dataStatus.movers.status === 'loading' ? 'processing' : dataStatus.movers.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.movers.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.movers.endpoint}
                  </Text>
                </Space>
              </Col>
            </Row>
            {dataStatus.traceId && (
              <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                Trace ID: {dataStatus.traceId}
              </Text>
            )}
          </Space>
        ),
      },
    ];
  }, [dataStatus]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="space-y-6">
        {/* Diagnostics Panel - Collapsed by default */}
        {isDebug && (
          <Collapse
            items={diagnosticsItems}
            defaultActiveKey={[]}
          />
        )}
      
        {/* Debug Data Status Card */}
        {isDebug && (
        <Card style={{ ...CARD_STYLE, marginBottom: 16 }} bodyStyle={CARD_BODY_STYLE}>
          <Card.Meta
            title={<Text strong style={{ color: 'var(--cb-text-body, #e5e7eb)' }}>Data Status (Debug Mode)</Text>}
            description={<Text type="secondary" style={{ color: 'var(--cb-text-muted, #9ca3af)' }}>Query params: benchmark={benchmark}, range={range}, scale={scale}</Text>}
          />
          <div style={{ marginTop: 16 }}>
            <Row gutter={[16, 8]}>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Chart Series</Text>
                  <Tag color={dataStatus.series.status === 'ok' ? 'success' : dataStatus.series.status === 'loading' ? 'processing' : dataStatus.series.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.series.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.series.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Headlines</Text>
                  <Tag color={dataStatus.headlines.status === 'ok' ? 'success' : dataStatus.headlines.status === 'loading' ? 'processing' : dataStatus.headlines.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.headlines.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.headlines.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Sectors</Text>
                  <Tag color={dataStatus.sectors.status === 'ok' ? 'success' : dataStatus.sectors.status === 'loading' ? 'processing' : dataStatus.sectors.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.sectors.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.sectors.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Movers</Text>
                  <Tag color={dataStatus.movers.status === 'ok' ? 'success' : dataStatus.movers.status === 'loading' ? 'processing' : dataStatus.movers.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.movers.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.movers.endpoint}
                  </Text>
                </Space>
              </Col>
            </Row>
          </div>
        </Card>
      )}
      
      {/* Fetch Error Alerts from individual queries */}
      {briefData.meta?.errors && briefData.meta.errors.length > 0 && (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
          {briefData.meta.errors.map((error: any, idx: number) => (
            <Alert
              key={idx}
              type="warning"
              message={`${error.endpoint || 'Endpoint'} failed`}
              description={
                <Space direction="vertical" size={4}>
                  <Text>Error: {error.error || 'Unknown error'}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    {error.endpoint}
                  </Text>
                </Space>
              }
              showIcon
              closable
            />
          ))}
        </Space>
      )}
      
        {/* Page Header */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                Market Brief
              </h1>
              <p className="mt-1 text-sm text-[var(--cb-text-muted,#9ca3af)]">
                Market context and key stories
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                loadingAny 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'bg-green-500/10 text-green-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${loadingAny ? 'bg-blue-400 animate-pulse' : 'bg-green-400'}`} />
                {loadingAny ? 'Loading…' : 'Live'}
              </span>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--cb-text-body,#d1d5db)] transition-colors hover:bg-white/10"
              >
                <ReloadOutlined />
                Refresh
              </button>
            </div>
          </div>
          
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented
              options={RANGE_OPTIONS}
              value={range}
              onChange={(v) => setRange(v as RangeKey)}
            />
            <Select
              style={{ width: 180 }}
              value={benchmark}
              onChange={setBenchmark}
              options={BENCHMARKS}
            />
            <Select
              style={{ width: 120 }}
              value={region}
              onChange={(v) => handleRegionChange(v as RegionKey)}
              options={REGION_OPTIONS}
              suffixIcon={<GlobalOutlined />}
            />
          </div>
        </div>

        {/* Error States - only if all failed */}
        {chartQuery.isError && headlinesQuery.isError && moversQuery.isError && sectorsQuery.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-400">Failed to load Market Brief data</p>
            <p className="mt-1 text-xs text-red-300/80">All endpoints failed. Please try refreshing.</p>
          </div>
        )}

        {/* Market Snapshot */}
        <MarketSnapshot
          range={range}
          indices={snapshotIndices}
          sectors={sectorsData}
          topStocks={moversData}
          onRetry={handleRefresh}
        />

        {/* Market Headlines Feed */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                Market Headlines
              </h3>
              <p className="mt-0.5 text-xs text-[var(--cb-text-muted,#9ca3af)]">
                {headlineItems.length} stories
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                size="small"
                style={{ width: 110 }}
                value={topicFilter}
                onChange={setTopicFilter}
                options={TOPIC_OPTIONS}
                suffixIcon={<FilterOutlined />}
              />
              <Select
                size="small"
                style={{ width: 110 }}
                value={impactFilter}
                onChange={setImpactFilter}
                options={IMPACT_OPTIONS}
                suffixIcon={<FilterOutlined />}
              />
              <Radio.Group
                size="small"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={SORT_OPTIONS}
              />
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {headlinesQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-white/5" />
                ))}
              </div>
            ) : headlineItems.length > 0 ? (
              <Collapse
                items={headlineItems}
                bordered={false}
                size="small"
                expandIconPosition="end"
                style={{ background: 'transparent' }}
                activeKey={expandedHeadlines}
                onChange={(keys) => setExpandedHeadlines(Array.isArray(keys) ? keys : [keys])}
              />
            ) : (
              <div className="flex min-h-[200px] items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-[var(--cb-text-muted,#9ca3af)]">
                    No headlines available
                  </p>
                  {dataStatus.headlines.status === 'error' && (
                    <p className="mt-2 text-xs text-[var(--cb-text-muted,#6b7280)]">
                      Failed to load from {dataStatus.headlines.endpoint}
                    </p>
                  )}
                  <button
                    onClick={handleRefresh}
                    className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[var(--cb-text-body,#d1d5db)] transition-colors hover:bg-white/10"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
