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
  Slider,
} from 'antd';
import {
  ReloadOutlined,
  LineChartOutlined,
  InfoCircleOutlined,
  GlobalOutlined,
  ArrowUpOutlined,
  DollarOutlined,
  UsergroupAddOutlined,
  BankOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { safeQueryFn } from '@/lib/utils/safeQuery';
import { PageShell } from '@/components/ui/PageShell';
import { apiFetchJson } from '@/lib/http/apiFetch';
import { MacroCompositeLine } from '@/components/charts/recharts/MacroCompositeLine';
import { GrowthInflationScatter } from '@/components/charts/recharts/GrowthInflationScatter';
import { ContractGuard } from '@/lib/ui/contract';
import { normalizeHeadlines, normalizeMacroSnapshot, type NormalizedHeadline, type NormalizedMacroSnapshot } from '@/lib/data/normalize';
import { normalizeSeries, type SeriesPoint } from '@/lib/charts/normalize';
import { getRangeWindow, type RangeKey } from '@/lib/charts/ranges';
import { inferEventImpact } from '@/lib/events/impact';
import type { EventImpact } from '@/lib/events/types';
import { ControlRail } from '@/components/ui/ControlRail';
import { TerminalCard } from '@/components/ui/TerminalCard';
import { deterministicFallbackSummary } from '@/lib/macro/deterministicFallbackSummary';

const { Title, Text, Paragraph } = Typography;

type RegionKey = 'global' | 'us' | 'europe' | 'asia';

const RANGE_OPTIONS: RangeKey[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y'];
const REGIONS: { label: string; value: RegionKey }[] = [
  { label: 'Global', value: 'global' },
  { label: 'US', value: 'us' },
  { label: 'Europe', value: 'europe' },
  { label: 'Asia', value: 'asia' },
];

const TOPIC_OPTIONS = [
  { label: 'All Topics', value: 'all' },
  { label: 'Equities', value: 'equities' },
  { label: 'Macro', value: 'macro' },
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

// Helper function to generate stable IDs for stories
function cheapStableId(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function storyId(s: any) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:storyId',message:'storyId called',data:{hasId:!!s?.id,hasTitle:!!s?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  if (s?.id) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:storyId',message:'storyId returning existing id',data:{id:s.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return s.id;
  }
  const base = `${s?.title ?? s?.canonicalTitle ?? ""}|${s?.publishedAt ?? s?.ts ?? ""}|${s?.source ?? ""}`;
  const result = cheapStableId(base);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:storyId',message:'storyId generated stable id',data:{base,result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return result;
}

const CARD_STYLE = {
  background: 'var(--cb-panel, #0f1117)',
  border: '1px solid var(--cb-border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  boxShadow: 'none',
};

const CARD_BODY_STYLE = { padding: 24 };
const PANEL_CLASS = 'rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-sm';
type PrimaryChannel = 'all' | 'rates' | 'fx' | 'equities' | 'credit' | 'commodities' | 'macro';


export default function MacroIQAntDPage() {
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
  const [region, setRegion] = useState<RegionKey>(validRegion);
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [impactFilter, setImpactFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');
  const [impactChannel, setImpactChannel] = useState<PrimaryChannel>('all');
  const [impactThreshold, setImpactThreshold] = useState<number>(0);
  
  // Refs for scroll containers
  const headlinesScrollRef = React.useRef<HTMLDivElement>(null);
  const eventsScrollRef = React.useRef<HTMLDivElement>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefMode, setBriefMode] = useState<'ai' | 'fallback' | null>(null);
  const [summaries, setSummaries] = useState<Record<string, { status: 'idle' | 'loading' | 'ready'; text?: string; mode?: 'ai' | 'fallback' }>>({});
  
  // Update URL query param when region changes and reset scroll positions
  const handleRegionChange = useCallback((newRegion: RegionKey) => {
    setRegion(newRegion);
    const params = new URLSearchParams(searchParams.toString());
    if (newRegion === 'global') {
      params.delete('region'); // Remove param for default value
    } else {
      params.set('region', newRegion);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    
    // Reset scroll positions for headline and event panels
    setTimeout(() => {
      if (headlinesScrollRef.current) {
        headlinesScrollRef.current.scrollTop = 0;
      }
      if (eventsScrollRef.current) {
        eventsScrollRef.current.scrollTop = 0;
      }
    }, 0);
  }, [searchParams, router, pathname]);
  
  const rangeWindow = useMemo(() => getRangeWindow(range), [range]);
  const buildRangeParams = useCallback(() => {
    const { startISO, endISO, interval } = rangeWindow;
    return new URLSearchParams({
      range,
      start: startISO,
      end: endISO,
      interval,
      region,
    });
  }, [range, rangeWindow, region]);

  // Individual API queries with per-endpoint error handling
  const cardsQuery = useQuery({
    queryKey: ['macro-iq', 'cards', range, region],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        return await apiFetchJson(`/api/macro/cards?${params.toString()}`);
      },
      ['macro-iq', 'cards', range, region]
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const snapshotQuery = useQuery({
    queryKey: ['macro-iq', 'snapshot', range, region],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        return await apiFetchJson(`/api/macro/snapshot?${params.toString()}`);
      },
      ['macro-iq', 'snapshot', range, region]
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const marketQuery = useQuery({
    queryKey: ['macro-iq', 'market', range, region],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        return await apiFetchJson(`/api/macro/market?${params.toString()}`);
      },
      ['macro-iq', 'market', range, region]
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });


  const eventsQuery = useQuery({
    queryKey: ['macro-iq', 'events', range, region],
    queryFn: safeQueryFn(
      async () => {
        const params = buildRangeParams();
        return await apiFetchJson(`/api/macro/events?${params.toString()}`);
      },
      ['macro-iq', 'events', range, region]
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:227',message:'About to define headlinesQuery',data:{range,region},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const headlinesQuery = useQuery({
    queryKey: ['macro-iq', 'headlines', range, region],
    queryFn: safeQueryFn(
      async () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:232',message:'headlinesQuery queryFn called',data:{range,region},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const params = buildRangeParams();
        const url = `/api/macro/headlines?${params.toString()}`;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:236',message:'Fetching headlines',data:{url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const result = await apiFetchJson(url);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:240',message:'headlinesQuery result received',data:{hasData:!!result,itemCount:result?.items?.length||result?.data?.items?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return result;
      },
      ['macro-iq', 'headlines', range, region]
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:250',message:'headlinesQuery defined',data:{isLoading:headlinesQuery.isLoading,isError:headlinesQuery.isError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Use normalized macro snapshot - all fields guaranteed
  const adaptSnapshot = (raw: any): NormalizedMacroSnapshot => {
    return normalizeMacroSnapshot(raw);
  };

  // Use normalized headlines - all fields guaranteed
  const adaptHeadlines = (raw: any): NormalizedHeadline[] => {
    return normalizeHeadlines(raw);
  };

  // Helper to generate "Why it matters" summary deterministically
  const generateWhyItMatters = useCallback((event: any): string => {
    const title = event.title || event.canonicalTitle || '';
    const summary = event.summary || '';
    const topic = (event.topic || event.category || '').toLowerCase();
    const impact = (event.impact || event.macroImpact || 'neutral').toLowerCase();
    const region = (event.region || 'global').toLowerCase();
    
    // Build context from available fields
    const context = [title, summary].filter(Boolean).join(' ').toLowerCase();
    
    // Topic-based templates
    if (topic.includes('inflation') || topic.includes('cpi')) {
      return impact === 'positive' 
        ? `Inflation moderation suggests easing price pressures, potentially allowing central banks to reduce rates and support economic growth.`
        : impact === 'negative'
        ? `Rising inflation pressures could force tighter monetary policy, weighing on growth and asset valuations.`
        : `Inflation trends directly influence monetary policy decisions and market expectations for interest rates.`;
    }
    
    if (topic.includes('interest') || topic.includes('rate') || topic.includes('fed') || topic.includes('ecb') || topic.includes('central bank')) {
      return impact === 'positive'
        ? `Rate cuts or dovish policy signals typically boost risk assets and reduce borrowing costs, supporting economic activity.`
        : impact === 'negative'
        ? `Rate hikes or hawkish signals increase borrowing costs and can pressure equities, especially growth stocks.`
        : `Central bank policy decisions directly impact asset valuations, currency movements, and economic activity.`;
    }
    
    if (topic.includes('unemployment') || topic.includes('labor') || topic.includes('jobs')) {
      return impact === 'positive'
        ? `Strong labor markets support consumer spending and economic resilience, though may signal wage pressures.`
        : impact === 'negative'
        ? `Weak employment data suggests economic slowdown, potentially prompting monetary easing and market volatility.`
        : `Labor market conditions are a key indicator of economic health and influence monetary policy decisions.`;
    }
    
    if (topic.includes('gdp') || topic.includes('growth') || topic.includes('recession')) {
      return impact === 'positive'
        ? `Economic expansion supports corporate earnings and risk assets, though may raise inflation concerns.`
        : impact === 'negative'
        ? `Economic contraction increases recession risks, typically driving flight to safety and pressuring risk assets.`
        : `GDP growth trends indicate overall economic health and influence market sentiment and policy expectations.`;
    }
    
    if (topic.includes('commodity') || topic.includes('oil') || topic.includes('energy')) {
      return impact === 'positive'
        ? `Commodity price movements affect input costs, inflation expectations, and sector-specific earnings.`
        : impact === 'negative'
        ? `Commodity price volatility can signal supply disruptions or demand shifts with broad economic implications.`
        : `Commodity markets serve as leading indicators of economic activity and inflation trends.`;
    }
    
    if (topic.includes('geopolitic') || topic.includes('war') || topic.includes('conflict') || topic.includes('sanction')) {
      return `Geopolitical events create uncertainty and can disrupt supply chains, energy markets, and risk sentiment globally.`;
    }
    
    // Default fallback
    if (title) {
      return `This development could influence market sentiment and economic expectations, depending on how it evolves.`;
    }
    
    return `This event may have broader implications for markets and the economy.`;
  }, []);

  // Helper to generate market impact bullets based on topic
  const generateMarketImpact = useCallback((event: any): string[] => {
    const topic = (event.topic || event.category || '').toLowerCase();
    const impact = (event.impact || event.macroImpact || 'neutral').toLowerCase();
    const region = (event.region || 'global').toLowerCase();
    
    const bullets: string[] = [];
    
    // Topic-based impact bullets
    if (topic.includes('inflation') || topic.includes('cpi')) {
      if (impact === 'positive') {
        bullets.push('Supportive for equities as lower inflation allows for easier monetary policy');
        bullets.push('Positive for bonds as rate cut expectations increase');
        bullets.push('May weaken USD if Fed signals dovish pivot');
      } else if (impact === 'negative') {
        bullets.push('Pressure on equities as rate hike expectations rise');
        bullets.push('Negative for bonds as yields may increase');
        bullets.push('May strengthen USD on higher rate expectations');
      } else {
        bullets.push('Monitor impact on monetary policy expectations');
        bullets.push('Affects real yields and asset valuations');
      }
    }
    
    if (topic.includes('interest') || topic.includes('rate') || topic.includes('fed') || topic.includes('ecb')) {
      if (impact === 'positive') {
        bullets.push('Bullish for risk assets (equities, credit)');
        bullets.push('Positive for growth stocks and small caps');
        bullets.push('May pressure USD and support commodities');
      } else if (impact === 'negative') {
        bullets.push('Bearish for growth stocks and long-duration assets');
        bullets.push('Supportive for financials and value stocks');
        bullets.push('May strengthen USD and pressure gold');
      } else {
        bullets.push('Affects equity valuations via discount rates');
        bullets.push('Impacts currency and commodity markets');
      }
    }
    
    if (topic.includes('unemployment') || topic.includes('labor') || topic.includes('jobs')) {
      bullets.push('Strong data supports consumer spending and risk assets');
      bullets.push('Weak data may prompt monetary easing expectations');
      bullets.push('Affects sector rotation (cyclicals vs defensives)');
    }
    
    if (topic.includes('gdp') || topic.includes('growth') || topic.includes('recession')) {
      if (impact === 'positive') {
        bullets.push('Bullish for cyclical sectors and commodities');
        bullets.push('Supportive for emerging markets and risk assets');
      } else if (impact === 'negative') {
        bullets.push('Flight to safety (bonds, USD, defensive stocks)');
        bullets.push('Pressure on cyclicals and commodities');
      } else {
        bullets.push('Influences earnings expectations and sector rotation');
        bullets.push('Affects risk-on vs risk-off sentiment');
      }
    }
    
    if (topic.includes('commodity') || topic.includes('oil') || topic.includes('energy')) {
      bullets.push('Affects energy sector and related equities');
      bullets.push('Impacts inflation expectations and monetary policy');
      bullets.push('Influences emerging market currencies and economies');
    }
    
    if (topic.includes('geopolitic') || topic.includes('war') || topic.includes('conflict')) {
      bullets.push('Increases risk-off sentiment and volatility');
      bullets.push('Supports safe havens (USD, bonds, gold)');
      bullets.push('May disrupt supply chains and energy markets');
      bullets.push('Affects sector-specific impacts (defense, energy)');
    }
    
    // Default fallback if no specific topic match
    if (bullets.length === 0) {
      bullets.push('Monitor for broader market sentiment shifts');
      bullets.push('May influence sector rotation and risk appetite');
    }
    
    // Limit to 2-4 bullets
    return bullets.slice(0, 4);
  }, []);

  // Helper to map confidence to Low/Med/High
  const getConfidenceLabel = useCallback((confidence: number | null | undefined): { label: string; color: string } => {
    if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) {
      return { label: 'Unknown', color: 'default' };
    }
    if (confidence >= 0.7) return { label: 'High', color: 'success' };
    if (confidence >= 0.5) return { label: 'Med', color: 'warning' };
    return { label: 'Low', color: 'default' };
  }, []);

  // Helper to check if event needs enrichment
  const needsEnrichment = useCallback((event: any): boolean => {
    const hasSummary = !!event.summary && event.summary.trim().length > 0;
    const hasImpactBullets = Array.isArray(event.impactBullets) && event.impactBullets.length >= 2;
    const hasTopic = !!event.topic || !!event.category;
    // Event needs enrichment if missing key fields
    return !hasSummary || !hasImpactBullets || !hasTopic;
  }, []);

  const adaptEvents = (raw: any): Array<{ 
    key: string; 
    title: string; 
    date?: string; 
    category?: string; 
    topic?: string;
    region?: string; 
    country?: string; 
    confidence?: number; 
    impact?: string;
    macroImpact?: string;
    summary?: string;
    impactBullets?: string[];
    impactScore?: number;
    impactObj?: EventImpact;
  }> => {
    if (!raw) return [];
    const items = raw.items ?? raw.data?.items ?? [];
    return items.map((item: any, idx: number) => {
      const base = {
        key: item.id ?? item.key ?? `event-${idx}`,
        title: item.title ?? item.canonicalTitle ?? item.headline ?? '',
        date: item.date ?? item.publishedAt ?? item.ts ?? item.timestamp,
        category: item.category ?? item.topic,
        topic: item.topic ?? item.category,
        region: item.region ?? item.geo?.region ?? item.country?.region ?? 'global',
        country: item.country ?? item.geo?.country ?? item.sourceCountry,
        confidence: item.confidence ?? item.score,
        impact: item.impact ?? item.summary,
        macroImpact: item.macroImpact ?? item.impact,
        summary: item.summary,
        impactBullets: Array.isArray(item.impactBullets) ? item.impactBullets : undefined,
        impactScore: item.impactScore,
        impactObj: item.impactObj as EventImpact | undefined,
      };
      if (!base.impactObj) {
        base.impactObj = inferEventImpact({ title: base.title, topic: base.topic });
      }
      if (!base.impactScore) {
        base.impactScore = base.impactObj?.score;
      }
      return base;
    });
  };

  // Extract normalized data from queries
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:448',message:'Before adaptHeadlines',data:{headlinesQueryExists:!!headlinesQuery,hasData:!!headlinesQuery?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const snapshotData = useMemo(() => adaptSnapshot(snapshotQuery.data), [snapshotQuery.data]);
  const marketSeriesRaw = useMemo(() => normalizeSeries(marketQuery.data), [marketQuery.data]);
  const headlinesData = useMemo(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:453',message:'adaptHeadlines called',data:{rawData:!!headlinesQuery?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const result = adaptHeadlines(headlinesQuery.data);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:456',message:'adaptHeadlines result',data:{resultLength:result?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return result;
  }, [headlinesQuery.data]);
  const eventsData = useMemo(() => adaptEvents(eventsQuery.data), [eventsQuery.data]);
  

  // Extract macro cards data from new cards API
  const cards = cardsQuery.data?.cards ?? {};
  const inflationValue = cards?.inflation?.value ?? null;
  const growthValue = cards?.growth?.value ?? null;
  const laborValue = cards?.labor?.value ?? null;
  const ratesValue = cards?.rates?.value ?? null;

  // Fallback to snapshot data if cards not available
  const inflation = inflationValue ?? snapshotData.inflation;
  const growth = growthValue ?? snapshotData.growth;
  const labor = laborValue ?? snapshotData.labor;
  const rates = ratesValue ?? snapshotData.rates;
  // Regime inputs should move with the selected range/region; if upstream cards/snapshot are static, fall back to a range-aware series change
  const seriesChangePct = useMemo(() => {
    if (!marketSeriesRaw || marketSeriesRaw.length < 2) return null;
    const sorted = [...marketSeriesRaw].sort((a, b) => a.t - b.t);
    const first = sorted[0]?.v;
    const last = sorted[sorted.length - 1]?.v;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
    return ((last - first) / first) * 100;
  }, [marketSeriesRaw, range, region]);
  const inflationForScatter = useMemo(() => {
    if (Number.isFinite(inflation)) return inflation as number;
    return seriesChangePct ?? null;
  }, [inflation, seriesChangePct, range, region]);
  const growthForScatter = useMemo(() => {
    if (Number.isFinite(growth)) return growth as number;
    return seriesChangePct ?? null;
  }, [growth, seriesChangePct, range, region]);
  
  // Summary from normalized snapshot (guaranteed, null if unavailable)
  const summaryForContract = snapshotData.summary ?? null;

  // Normalize market series data for MacroCompositeLine: SeriesPoint[] (t/v)
  const marketSeries = useMemo((): SeriesPoint[] => {
    if (!Array.isArray(marketSeriesRaw) || marketSeriesRaw.length === 0) {
      return [];
    }
    return [...marketSeriesRaw].sort((a, b) => a.t - b.t);
  }, [marketSeriesRaw]);

  // Growth vs Inflation regime scatter chart data for GrowthInflationScatter: { x: number, y: number }[]
  const scatterData = useMemo(() => {
    if (
      inflationForScatter !== null &&
      growthForScatter !== null &&
      Number.isFinite(inflationForScatter) &&
      Number.isFinite(growthForScatter)
    ) {
      return [{ x: inflationForScatter, y: growthForScatter }];
    }
    return [];
  }, [inflationForScatter, growthForScatter]);

  // Calculate scatter chart domains for better visualization
  const scatterDomains = useMemo(() => {
    if (scatterData.length === 0) {
      return { xDomain: 'auto' as const, yDomain: 'auto' as const };
    }

    const xValues = scatterData.map((d) => d.x).filter((v) => Number.isFinite(v));
    const yValues = scatterData.map((d) => d.y).filter((v) => Number.isFinite(v));

    if (xValues.length === 0 || yValues.length === 0) {
      return { xDomain: 'auto' as const, yDomain: 'auto' as const };
    }

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const xPadding = xRange === 0 ? 1 : Math.abs(xRange) * 0.2;
    const yPadding = yRange === 0 ? 1 : Math.abs(yRange) * 0.2;

    return {
      xDomain: [Math.max(0, minX - xPadding), maxX + xPadding] as [number, number],
      yDomain: [Math.max(-5, minY - yPadding), Math.min(10, maxY + yPadding)] as [number, number],
    };
  }, [scatterData]);


  // Helper to detect region from normalized headline or event (works for both)
  const matchesRegion = useCallback((item: NormalizedHeadline | { region?: string; country?: string; source?: string }, targetRegion: RegionKey): boolean => {
    if (targetRegion === 'global') return true;
    
    // Handle both headline and event structures
    const itemRegion = ((item as any).region || 'global').toLowerCase();
    const itemCountry = ((item as any).country || '').toLowerCase();
    const itemSource = ((item as any).source || '').toLowerCase();
    const itemTitle = ((item as any).title || '').toLowerCase();
    
    // Map countries/sources to regions
    const usIndicators = ['us', 'usa', 'united states', 'america', 'federal reserve', 'fed', 'treasury', 'sec'];
    const europeIndicators = ['europe', 'eu', 'eurozone', 'ecb', 'european central bank', 'uk', 'england', 'france', 'germany', 'italy', 'spain', 'netherlands'];
    const asiaIndicators = ['asia', 'china', 'japan', 'korea', 'singapore', 'hong kong', 'india', 'australia', 'pboc', 'boj', 'reserve bank'];
    
    // Check if item region directly matches
    if (itemRegion === targetRegion) return true;
    
    // Check indicators in region, country, source, and title fields
    if (targetRegion === 'us') {
      return usIndicators.some(ind => 
        itemRegion.includes(ind) || 
        itemCountry.includes(ind) || 
        itemSource.includes(ind) ||
        itemTitle.includes(ind)
      );
    }
    if (targetRegion === 'europe') {
      return europeIndicators.some(ind => 
        itemRegion.includes(ind) || 
        itemCountry.includes(ind) || 
        itemSource.includes(ind) ||
        itemTitle.includes(ind)
      );
    }
    if (targetRegion === 'asia') {
      return asiaIndicators.some(ind => 
        itemRegion.includes(ind) || 
        itemCountry.includes(ind) || 
        itemSource.includes(ind) ||
        itemTitle.includes(ind)
      );
    }
    
    return true;
  }, []);

  // Filter and sort headlines from adapted data with region filtering
  const headlineItems = useMemo(() => {
    let items = headlinesData;
    
    // Client-side region filtering (fallback if API doesn't filter properly)
    const beforeCount = items.length;
    const filteredByRegion = region === 'global' 
      ? items 
      : items.filter((h: NormalizedHeadline) => matchesRegion(h, region));
    const afterCount = filteredByRegion.length;
    
    // Track if we filtered client-side (if > 30% reduction, likely API didn't filter)
    const filteredLocally = beforeCount > 0 && afterCount < beforeCount * 0.7 && region !== 'global';
    items = filteredByRegion;

    // Filter by topic (normalized headlines have guaranteed topic field)
    let filtered = items;
    if (topicFilter !== 'all') {
      filtered = filtered.filter((h: NormalizedHeadline) => {
        return h.topic.toLowerCase() === topicFilter.toLowerCase();
      });
    }

    // Filter by impact (normalized headlines have guaranteed impact field)
    if (impactFilter !== 'all') {
      filtered = filtered.filter((h: NormalizedHeadline) => {
        return h.impact.toLowerCase() === impactFilter.toLowerCase();
      });
    }
    
    // Sort (normalized headlines have guaranteed fields)
    const sorted = [...filtered].sort((a: NormalizedHeadline, b: NormalizedHeadline) => {
      if (sortBy === 'confidence') {
        const confA = a.confidence ?? 0;
        const confB = b.confidence ?? 0;
        return confB - confA;
        } else {
        // Latest first (publishedAt is guaranteed)
        return b.publishedAt.localeCompare(a.publishedAt);
      }
    });

    return {
      items: sorted.slice(0, 10).map((h: NormalizedHeadline, idx: number) => {
      // All fields guaranteed by normalization
      const hasCanonicalTitle = !!h.canonicalTitle && h.canonicalTitle.trim().length > 0;
      const title = h.canonicalTitle ?? h.title; // title is guaranteed
      const source = h.source; // Guaranteed
      const ts = h.publishedAt; // Guaranteed
      const impactBullets = h.bullets; // Guaranteed array
      const hasImpactBullets = impactBullets.length >= 2;
      const url = h.url;
      const topic = h.topic; // Guaranteed
      const confidence = h.confidence; // Guaranteed (null if unavailable)

      return {
        key: h.id, // id is guaranteed by normalization
        label: (
          <div
            style={{
              width: '100%',
              cursor: 'pointer',
              padding: '4px 0',
              minWidth: 0, // Prevent overflow
              maxWidth: '100%',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%', minWidth: 0 }}>
              <Paragraph
                strong
                ellipsis={{ rows: 2, expandable: false }}
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: '20px',
                  maxWidth: '100%',
                  width: '100%',
                  minWidth: 0,
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {title || 'Untitled'}
              </Paragraph>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  alignItems: 'center',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <Tag color={TOPIC_COLORS[topic] || TOPIC_COLORS.default} style={{ fontSize: '11px', margin: 0, flexShrink: 0 }}>
                  {topic || 'macro'}
                </Tag>
                <Tag color="default" style={{ fontSize: '11px', margin: 0, flexShrink: 0 }}>
                  {h.region || 'global'}
                </Tag>
                {confidence !== null ? (
                  <Tooltip title={`Confidence: ${(confidence * 100).toFixed(0)}%`}>
                    <Tag
                      color={confidence >= 0.7 ? 'success' : confidence >= 0.5 ? 'warning' : 'error'}
                      style={{ fontSize: '11px', margin: 0, flexShrink: 0 }}
                    >
                      {confidence >= 0.7 ? 'High' : confidence >= 0.5 ? 'Med' : 'Low'}
                    </Tag>
                  </Tooltip>
                ) : null}
                <Text
                  type="secondary"
                  ellipsis
                  style={{
                    fontSize: '11px',
                    lineHeight: '16px',
                    minWidth: 0,
                    flex: '1 1 auto',
                  }}
                >
                  {source || 'Unknown'}
                </Text>
                <Text
                  type="secondary"
                  style={{
                    fontSize: '11px',
                    lineHeight: '16px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {ts ? String(ts).slice(0, 10) : '—'}
                </Text>
              </div>
            </Space>
          </div>
        ),
        children: (
          <Space direction="vertical" size={8} style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
            {!hasCanonicalTitle && (
              <Alert
                type="warning"
                showIcon
                message="Missing canonical title"
                description="This headline is missing a canonicalTitle field from the deterministic headline processor."
                style={{ marginTop: 0, marginBottom: 0 }}
              />
            )}
            {hasImpactBullets ? (
              <List
                size="small"
                dataSource={impactBullets}
                renderItem={(it: string, idx: number) => (
                  <List.Item key={idx} style={{ paddingInline: 0, paddingBlock: 4, margin: 0 }}>
                    <Text 
                      style={{ 
                        fontSize: '13px', 
                        lineHeight: '20px',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                      }}
                    >
                      • {String(it)}
                    </Text>
                  </List.Item>
                )}
              />
            ) : null}
            <Flex justify="space-between" align="center">
              <Space size={4}>
                <Tag color="default" style={{ fontSize: '11px', margin: 0 }}>
                  {source}
                </Tag>
                <Text type="secondary" style={{ fontSize: '11px', lineHeight: '16px' }}>
                  {ts ? String(ts).slice(0, 10) : '—'}
                </Text>
              </Space>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', lineHeight: '18px', color: '#1890ff' }}>
                View source →
              </a>
            ) : null}
            </Flex>
          </Space>
        ),
      };
      }),
      filteredLocally,
      beforeCount,
      afterCount,
    };
  }, [headlinesData, region, topicFilter, impactFilter, sortBy, matchesRegion]);

  const marketSignature = useMemo(() => {
    if (!marketSeries || marketSeries.length === 0) return null;
    const first = marketSeries[0];
    const last = marketSeries[marketSeries.length - 1];
    return `${marketSeries.length}:${first?.t ?? 0}:${last?.t ?? 0}:${first?.v ?? 0}:${last?.v ?? 0}`;
  }, [marketSeries]);

  const lastMarketSignatureRef = React.useRef<{
    range: RangeKey;
    region: RegionKey;
    signature: string | null;
  }>({ range, region, signature: marketSignature });

  React.useEffect(() => {
    const prev = lastMarketSignatureRef.current;
    if (
      prev.signature &&
      marketSignature &&
      prev.signature === marketSignature &&
      (prev.range !== range || prev.region !== region)
    ) {
      console.warn('[macro-iq] API ignored params', { range, region });
    }
    lastMarketSignatureRef.current = { range, region, signature: marketSignature };
  }, [marketSignature, range, region]);

  // Filter events by region (client-side fallback)
  const events = useMemo(() => {
    let items = eventsData;
    
    // Client-side region filtering (fallback if API doesn't filter properly)
    const beforeCount = items.length;
    const filteredByRegion = region === 'global' 
      ? items 
      : items.filter((e: any) => matchesRegion(e, region));
    // Impact filters
    const filteredByImpact = filteredByRegion.filter((e: any) => {
      const score = e.impactObj?.score ?? e.impactScore ?? 0;
      const channel = e.impactObj?.primaryChannel ?? 'macro';
      if (impactThreshold > 0 && score < impactThreshold) return false;
      if (impactChannel !== 'all' && channel !== impactChannel) return false;
      return true;
    });
    const sorted = [...filteredByImpact].sort((a, b) => {
      const aScore = a.impactObj?.score ?? a.impactScore ?? 0;
      const bScore = b.impactObj?.score ?? b.impactScore ?? 0;
      return bScore - aScore;
    });
    const afterCount = sorted.length;
    
    // Track if we filtered client-side (if > 30% reduction, likely API didn't filter)
    const filteredLocally = beforeCount > 0 && afterCount < beforeCount * 0.7 && region !== 'global';
    
    return {
      items: sorted.slice(0, 15),
      filteredLocally,
      beforeCount,
      afterCount,
    };
  }, [eventsData, region, matchesRegion, impactChannel, impactThreshold]);

  // Fetch AI/fallback Market Brief once events are available
  React.useEffect(() => {
    const run = async () => {
      if (!events?.items || events.items.length === 0) {
        setBriefText(null);
        setBriefMode(null);
        return;
      }
      setBriefLoading(true);
      try {
        const res = await fetch('/api/macro/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: events.items,
            range,
            region,
          }),
        });
        const json = await res.json();
        setBriefText(typeof json?.briefText === 'string' ? json.briefText : null);
        setBriefMode(json?.mode === 'ai' || json?.mode === 'fallback' ? json.mode : null);
      } catch {
        setBriefText(null);
        setBriefMode(null);
      } finally {
        setBriefLoading(false);
      }
    };
    run();
  }, [events?.items, range, region]);

  // Fetch summaries after stories load (deterministic cache by story.id)
  React.useEffect(() => {
    if (!headlinesData?.length) return;

    const normalized = headlinesData.map((s: any) => ({
      ...s,
      id: storyId(s),
    }));

    const missing = normalized
      .map(s => s.id)
      .filter(id => !summaries[id] || summaries[id].status === "idle");

    if (!missing.length) return;

    // Set loading immediately for each missing id
    setSummaries(prev => {
      const next = { ...prev };
      for (const id of missing) {
        next[id] = { status: "loading" };
      }
      return next;
    });

    // Batch request for all missing stories
    const missingStories = normalized.filter(s => missing.includes(s.id));
    
    fetch("/api/macro/story-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stories: missingStories.map((s: any) => ({
          id: s.id,
          title: s.title || s.canonicalTitle,
          source: s.source,
          publishedAt: s.publishedAt || s.date,
          assetClass: s.assetClass || s.topic,
          region: s.region,
          direction: s.direction || s.impact,
          impact: s.impactScore || s.confidence,
          channel: s.topic,
          url: s.url,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const map = data?.summariesById ?? {};
        setSummaries(prev => {
          const next = { ...prev };
          for (const [id, summary] of Object.entries(map)) {
            const s = summary as { summaryText: string; mode: "ai" | "fallback" };
            // Ensure summaryText is never empty
            const story = missingStories.find(st => storyId(st) === id);
            const text = s.summaryText?.trim() || deterministicFallbackSummary(story || {});
            next[id] = {
              status: "ready",
              mode: s.mode || "fallback",
              text: text,
            };
          }
          return next;
        });
      })
      .catch(() => {
        // UI-level deterministic fallback if API fails hard
        setSummaries(prev => {
          const next = { ...prev };
          for (const story of missingStories) {
            const id = story.id;
            next[id] = {
              status: "ready",
              mode: "fallback",
              text: deterministicFallbackSummary(story),
            };
          }
          return next;
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headlinesData?.length]);

  const handleRefresh = useCallback(() => {
    snapshotQuery.refetch();
    marketQuery.refetch();
    eventsQuery.refetch();
    headlinesQuery.refetch();
  }, [snapshotQuery, marketQuery, eventsQuery, headlinesQuery]);

  const anyLoading =
    snapshotQuery.isLoading ||
    marketQuery.isLoading ||
    eventsQuery.isLoading ||
    headlinesQuery.isLoading;

  // Determine data status for each panel
  const dataStatus = useMemo(() => {
    const getPanelStatus = (query: typeof snapshotQuery, data: any[], endpoint: string) => {
      if (query.isLoading) return { status: 'loading' as const, endpoint };
      if (query.isError) return { status: 'error' as const, endpoint, error: query.error?.message || 'Fetch failed' };
      if (!data || data.length === 0) return { status: 'empty' as const, endpoint };
      return { status: 'ok' as const, endpoint };
    };
    
    return {
      snapshot: getPanelStatus(snapshotQuery, Object.keys(snapshotData).length > 0 ? [snapshotData] : [], `/api/macro/snapshot?range=${range}&region=${region}`),
      market: getPanelStatus(marketQuery, marketSeries, `/api/macro/market?range=${range}&region=${region}`),
      events: getPanelStatus(eventsQuery, eventsData, `/api/macro/events?range=${range}&region=${region}`),
      headlines: getPanelStatus(headlinesQuery, headlinesData, `/api/macro/headlines?range=${range}&region=${region}`),
    };
  }, [snapshotQuery, snapshotData, marketQuery, marketSeries, eventsQuery, eventsData, headlinesQuery, headlinesData, range, region]);

  // Diagnostics panel items
  const diagnosticsItems = useMemo(() => {
    return [
      {
        key: 'endpoints',
        label: 'Diagnostics',
        children: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Row gutter={[16, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Snapshot</Text>
                  <Tag color={dataStatus.snapshot.status === 'ok' ? 'success' : dataStatus.snapshot.status === 'loading' ? 'processing' : dataStatus.snapshot.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.snapshot.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.snapshot.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Market</Text>
                  <Tag color={dataStatus.market.status === 'ok' ? 'success' : dataStatus.market.status === 'loading' ? 'processing' : dataStatus.market.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.market.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.market.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px' }}>Events</Text>
                  <Tag color={dataStatus.events.status === 'ok' ? 'success' : dataStatus.events.status === 'loading' ? 'processing' : dataStatus.events.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.events.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.events.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
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
            </Row>
          </Space>
        ),
      },
    ];
  }, [dataStatus]);

  return (
    <PageShell maxWidth={1300}>
      {/* Diagnostics Panel - Collapsed by default */}
      <Collapse
        items={diagnosticsItems}
        defaultActiveKey={[]}
        style={{ marginBottom: 16 }}
      />
      
      {/* Debug Data Status Card */}
      {isDebug && (
        <Card style={{ ...CARD_STYLE, marginBottom: 16 }} bodyStyle={CARD_BODY_STYLE}>
          <Card.Meta
            title={<Text strong style={{ color: 'var(--cb-text-body, #e5e7eb)' }}>Data Status (Debug Mode)</Text>}
            description={<Text type="secondary" style={{ color: 'var(--cb-text-muted, #9ca3af)' }}>Query params: range={range}, region={region}</Text>}
          />
          <div style={{ marginTop: 16 }}>
            <Row gutter={[16, 8]}>
              {/* Summary is part of snapshot data, not a separate endpoint */}
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Snapshot</Text>
                  <Tag color={dataStatus.snapshot.status === 'ok' ? 'success' : dataStatus.snapshot.status === 'loading' ? 'processing' : dataStatus.snapshot.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.snapshot.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.snapshot.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Market</Text>
                  <Tag color={dataStatus.market.status === 'ok' ? 'success' : dataStatus.market.status === 'loading' ? 'processing' : dataStatus.market.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.market.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.market.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Space direction="vertical" size={4}>
                  <Text style={{ fontSize: '12px', color: '#999' }}>Events</Text>
                  <Tag color={dataStatus.events.status === 'ok' ? 'success' : dataStatus.events.status === 'loading' ? 'processing' : dataStatus.events.status === 'error' ? 'error' : 'default'}>
                    {dataStatus.events.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }} ellipsis>
                    {dataStatus.events.endpoint}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
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
            </Row>
                </div>
        </Card>
      )}
      
      {/* Fetch Error Alerts */}
      {(snapshotQuery.isError || marketQuery.isError || eventsQuery.isError || headlinesQuery.isError) && (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
          {snapshotQuery.isError && (
            <Alert
              type="warning"
              message="Snapshot fetch failed"
              description={
                <Space direction="vertical" size={4}>
                  <Text>Error: {snapshotQuery.error?.message || 'Unknown error'}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    /api/macro/snapshot
                  </Text>
                </Space>
              }
              showIcon
              closable
            />
          )}
          {marketQuery.isError && (
            <Alert
              type="warning"
              message="Market data fetch failed"
              description={
                <Space direction="vertical" size={4}>
                  <Text>Error: {marketQuery.error?.message || 'Unknown error'}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    /api/macro/market
                  </Text>
                </Space>
              }
              showIcon
              closable
            />
          )}
          {eventsQuery.isError && (
            <Alert
              type="warning"
              message="Events fetch failed"
              description={
                <Space direction="vertical" size={4}>
                  <Text>Error: {eventsQuery.error?.message || 'Unknown error'}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    /api/macro/events
                  </Text>
                </Space>
              }
              showIcon
              closable
            />
          )}
          {headlinesQuery.isError && (
            <Alert
              type="warning"
              message="Headlines fetch failed"
              description={
                <Space direction="vertical" size={4}>
                  <Text>Error: {headlinesQuery.error?.message || 'Unknown error'}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    /api/macro/headlines
                  </Text>
                </Space>
              }
              showIcon
              closable
            />
          )}
        </Space>
      )}
      
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <ControlRail
          title="Macro IQ"
          subtitle="Real-time macro indicators, regime analysis, and event intelligence"
          loading={anyLoading}
          onRefresh={handleRefresh}
          centerSlot={
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                size="large"
                options={RANGE_OPTIONS}
                value={range}
                onChange={(v) => setRange(v as RangeKey)}
              />
              <Select
                style={{ width: 160 }}
                size="large"
                value={region}
                onChange={(v) => handleRegionChange(v as RegionKey)}
                options={REGIONS}
                suffixIcon={<GlobalOutlined />}
              />
            </div>
          }
        />

        {/* Error States - show only if all failed */}
        {snapshotQuery.isError && marketQuery.isError && eventsQuery.isError && headlinesQuery.isError && (
          <Alert
            type="error"
            message="Failed to load Macro IQ data"
            description="All endpoints failed. Some data may still be available."
            showIcon
            closable
            style={{ marginBottom: 0 }}
          />
        )}
        {headlinesQuery.isError && (
          <Alert
            type="warning"
            message="Failed to load headlines"
            description={headlinesQuery.error instanceof Error ? headlinesQuery.error.message : 'Unknown error'}
            showIcon
            closable
            style={{ marginBottom: 0 }}
          />
        )}

        <div className="flex flex-col gap-4">
          {/* Header / Controls */}
          <div className="flex flex-col gap-3">
            {/* Controls are already in ControlRail above */}
          </div>

          {/* Compact KPI strip */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <ContractGuard
                checks={[
                  { field: 'summary', value: summaryForContract, required: false, type: 'object' },
                ]}
                section="Macro Snapshot"
              >
                <TerminalCard>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Inflation', value: inflation, icon: <DollarOutlined />, neutral: 2.5 },
                      { label: 'Growth', value: growth, icon: <ArrowUpOutlined />, neutral: 0 },
                      { label: 'Labor', value: labor, icon: <UsergroupAddOutlined />, neutral: 4 },
                      { label: 'Rates', value: rates, icon: <BankOutlined />, neutral: null },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle,rgba(255,255,255,0.02))] p-3">
                        <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-[var(--cb-text-muted)]">
                          {kpi.icon}
                          <span>{kpi.label}</span>
                        </div>
                        <div className="text-lg font-semibold text-[var(--cb-text-primary)]">
                          {kpi.value !== null ? Number(kpi.value).toFixed(2) + '%' : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </TerminalCard>
              </ContractGuard>
            </div>

          {/* Charts row (two cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TerminalCard
              title="Macro Market Composite"
              subtitle="Composite of liquidity, rates, growth, and inflation signals"
              rightSlot={<Badge status="processing" text={`${region} • ${range}`} />}
            >
              {marketSeries.length < 2 && !marketQuery.isLoading ? (
                <div className="p-8 text-center text-[var(--cb-text-muted)] text-sm">
                  No data available for this range
                </div>
              ) : (
                <MacroCompositeLine
                  key={`macro-composite-${region}-${range}`}
                  data={marketSeries}
                  range={range}
                  height={340}
                  loading={marketQuery.isLoading}
                  error={
                    marketQuery.isError 
                      ? (marketQuery.error?.message || 'Failed to load market data')
                      : marketQuery.data === null && !marketQuery.isLoading
                      ? 'Failed to load market data. Click Retry to try again.'
                      : null
                  }
                  onRetry={marketQuery.isError || marketQuery.data === null ? handleRefresh : undefined}
                  strokeColor="var(--cb-green)"
                />
              )}
            </TerminalCard>

            <TerminalCard
              title="Growth vs Inflation Regime"
              subtitle="Regime map of inflation and growth dynamics"
              rightSlot={<Badge status="processing" text={`${region} • ${range}`} />}
            >
              {scatterData.length < 1 && !snapshotQuery.isLoading ? (
                <div className="p-8 text-center text-[var(--cb-text-muted)] text-sm">
                  No data available. Inflation and growth data required.
                </div>
              ) : (
                <div>
                  <GrowthInflationScatter
                    key={`${region}-${range}`}
                    data={scatterData}
                    xLabel="Inflation (%)"
                    yLabel="Growth (%)"
                    height={340}
                    loading={snapshotQuery.isLoading}
                    error={
                      snapshotQuery.isError 
                        ? (snapshotQuery.error?.message || 'Failed to load snapshot data')
                        : snapshotQuery.data === null && !snapshotQuery.isLoading
                        ? 'Failed to load snapshot data. Click Retry to try again.'
                        : null
                    }
                    xDomain={scatterDomains.xDomain}
                    yDomain={scatterDomains.yDomain}
                    onRetry={snapshotQuery.isError || snapshotQuery.data === null ? handleRefresh : undefined}
                  />
                  <Space style={{ marginTop: 16, fontSize: '12px' }} wrap size={8}>
                    <Tag color="success" style={{ margin: 0 }}>High Growth / Low Inflation (Ideal)</Tag>
                    <Tag color="error" style={{ margin: 0 }}>High Inflation / Low Growth (Stagflation)</Tag>
                    <Tag color="warning" style={{ margin: 0 }}>Low Growth / Low Inflation (Recession Risk)</Tag>
                    <Tag color="processing" style={{ margin: 0 }}>High Inflation / High Growth (Overheating)</Tag>
                  </Space>
                </div>
              )}
            </TerminalCard>
          </div>

          {/* Event Intelligence */}
          <TerminalCard title="Event Intelligence">
              <div className="flex flex-col gap-3">
                {/* Filters pinned */}
                <div className="flex flex-wrap items-center gap-8 text-[var(--cb-text-muted)] text-xs">
                  <div className="flex items-center gap-2">
                    <span>Channel</span>
                    <Select
                      size="small"
                      style={{ width: 140 }}
                      value={impactChannel}
                      onChange={(v) => setImpactChannel(v as PrimaryChannel)}
                      options={[
                        { label: 'All', value: 'all' },
                        { label: 'Rates', value: 'rates' },
                        { label: 'FX', value: 'fx' },
                        { label: 'Equities', value: 'equities' },
                        { label: 'Credit', value: 'credit' },
                        { label: 'Commodities', value: 'commodities' },
                        { label: 'Macro', value: 'macro' },
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Impact ≥ {impactThreshold}</span>
                    <div style={{ width: 160 }}>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={impactThreshold}
                        onChange={(v) => setImpactThreshold(v as number)}
                        tooltip={{ formatter: (v) => `${v}` }}
                      />
                    </div>
                  </div>
                  <Badge count={events.items?.length ?? 0} showZero color="#52c41a" />
                  {events.filteredLocally && (
                    <Tooltip title={`Filtered locally: ${events.afterCount} of ${events.beforeCount} items match ${region} region`}>
                      <Tag color="warning" style={{ fontSize: '11px', margin: 0 }}>Filtered locally</Tag>
                    </Tooltip>
                  )}
                </div>

                {/* Scrollable list with fixed height */}
                <div className="max-h-[360px] overflow-y-auto pr-1">
                  {eventsQuery.isLoading ? (
                    <Skeleton active paragraph={{ rows: 5 }} />
                  ) : events.items && events.items.length > 0 ? (
                    <List
                      dataSource={events.items}
                      renderItem={(e) => {
                        const impact = e.impactObj;
                        const whyItMatters = impact?.whyItMatters || generateWhyItMatters(e);
                        const transmission = impact?.transmission || generateMarketImpact(e);
                        const confidenceLabel = getConfidenceLabel(e.confidence);
                        const needsEnrich = needsEnrichment(e);
                        const dir = impact?.direction ?? 'neutral';
                        const score = impact?.score ?? e.impactScore ?? 0;
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:1460',message:'Before storyId call in events render',data:{eventTitle:e?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        const sid = storyId(e);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/bab22550-1365-4185-a4e0-718882350f59',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'macro-iq/page.tsx:1463',message:'After storyId call',data:{sid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        const summaryState = summaries[sid] || { status: "idle" as const };
                        
                        return (
                          <List.Item
                            key={sid}
                            style={{
                              paddingInline: 0,
                              paddingBlock: 10,
                              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              {/* Header: Title + Tags */}
                              <Flex justify="space-between" align="flex-start" gap={12} wrap>
                                <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 0 }}>
                                  <Text strong className="text-[14px] leading-5 text-[var(--cb-text-body)] line-clamp-2">
                                    {e.title}
                                  </Text>
                                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--cb-text-muted)]">
                                    <span>Impact: <span className="text-[var(--cb-text-primary)]">{score ? `${score}` : '—'}</span></span>
                                    <span>Direction: {dir}</span>
                                    {impact?.primaryChannel && <span>Channel: {impact.primaryChannel}</span>}
                                  </div>
                                </div>
                                <Space size={6} wrap>
                                  <Tag color="blue" style={{ fontSize: '11px', margin: 0 }}>
                                    {e.category || e.topic || 'macro'}
                                  </Tag>
                                  <Tag color="default" style={{ fontSize: '11px', margin: 0 }}>
                                    {e.region || 'global'}
                                  </Tag>
                                  <Tag
                                    color={confidenceLabel.color}
                                    style={{ fontSize: '11px', margin: 0 }}
                                  >
                                    {confidenceLabel.label}
                                  </Tag>
                                  {needsEnrich && (
                                    <Tooltip title="Missing summary, impact bullets, or topic classification">
                                      <Tag color="default" style={{ fontSize: '10px', margin: 0, opacity: 0.7 }}>
                                        Needs enrichment
                                      </Tag>
                                    </Tooltip>
                                  )}
                                </Space>
                              </Flex>
                              
                              {/* Date */}
                              {e.date && (
                                <Text type="secondary" style={{ fontSize: '11px', lineHeight: '16px' }}>
                                  {String(e.date).slice(0, 19).replace('T', ' ')}
                                </Text>
                              )}
                              
                              {/* Why it matters */}
                              {whyItMatters && (
                                <div style={{ marginTop: 2 }}>
                                  <Text strong style={{ fontSize: '12px', color: '#bfbfbf', marginBottom: 2, display: 'block' }}>
                                    Why it matters
                                  </Text>
                                  <Text style={{ fontSize: '13px', lineHeight: '18px', color: '#d9d9d9' }}>
                                    {whyItMatters}
                                  </Text>
                                </div>
                              )}
                              
                              {/* Market impact */}
                              {transmission.length > 0 && (
                                <div style={{ marginTop: 2 }}>
                                  <Text strong style={{ fontSize: '12px', color: '#bfbfbf', marginBottom: 4, display: 'block' }}>
                                    Transmission
                                  </Text>
                                  <List
                                    size="small"
                                    dataSource={transmission}
                                    style={{ margin: 0 }}
                                    renderItem={(bullet) => (
                                      <List.Item style={{ padding: '2px 0', border: 'none' }}>
                                        <Text style={{ fontSize: '12px', lineHeight: '16px', color: '#d9d9d9' }}>
                                          • {bullet}
                                        </Text>
                                      </List.Item>
                                    )}
                                  />
                                </div>
                              )}
                              {impact && (impact.likelyWinners?.length || impact.likelyLosers?.length) ? (
                                <div className="flex flex-wrap gap-3 text-[12px]">
                                  {impact.likelyWinners?.length ? (
                                    <Tag color="success" style={{ margin: 0 }}>
                                      Winners: {impact.likelyWinners.join(', ')}
                                    </Tag>
                                  ) : null}
                                  {impact.likelyLosers?.length ? (
                                    <Tag color="error" style={{ margin: 0 }}>
                                      Losers: {impact.likelyLosers.join(', ')}
                                    </Tag>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="mt-2 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle,rgba(255,255,255,0.05))] p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Text strong className="text-[12px] text-[var(--cb-text-body)]">AI Summary</Text>
                                  <Badge
                                    status={summaryState.status === "loading" ? 'processing' : summaryState.mode === 'ai' ? 'success' : 'default'}
                                    text={summaryState.status === "loading" ? 'Loading' : summaryState.mode ? summaryState.mode.toUpperCase() : 'Fallback'}
                                  />
                                </div>
                                <Text className="text-[13px] leading-6 text-[var(--cb-text-body)]">
                                  {summaryState.status === "ready" && summaryState.text
                                    ? summaryState.text
                                    : summaryState.status === "loading"
                                    ? "Generating AI summary…"
                                    : deterministicFallbackSummary(e)}
                                </Text>
                              </div>
                            </Space>
                          </List.Item>
                        );
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, padding: '40px 20px' }}>
                      <Empty
                        description={
                          <Space direction="vertical" size={12} align="center">
                            <Text type="secondary" style={{ fontSize: '14px' }}>No upcoming events available</Text>
                            {dataStatus.events.status === 'error' && (
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                Failed to load from {dataStatus.events.endpoint}
                              </Text>
                            )}
                            <Button type="primary" onClick={handleRefresh}>
                              Retry
                            </Button>
                          </Space>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    </div>
                  )}
                </div>
              </div>
            </TerminalCard>

        </div>
      </Space>
    </PageShell>
  );
}
