/**
 * Market Brief Aggregator API
 * 
 * Aggregates all Market Brief data into a single endpoint:
 * - benchmark series (chart data)
 * - headlines
 * - top movers
 * - sector momentum
 * 
 * Accepts: period (range), benchmark (symbol), scale (Price/Return%)
 * Returns: { chartPoints, headlines, movers, sectors, meta }
 * 
 * Always includes meta.errors[] if any upstream call fails, but still returns whatever succeeded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adaptChartData, adaptHeadlines, adaptMovers, adaptSectors } from '@/lib/market/briefAdapters';

export const revalidate = 0; // No caching in dev

type Range = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y';
type Benchmark = 'SPY' | 'QQQ' | 'DIA';
type Scale = 'Price' | 'Return%';

interface MarketBriefResponse {
  chartPoints: Array<{ t: string; v: number }>;
  headlines: Array<any>;
  movers: Array<any>;
  sectors: Array<any>;
  meta: {
    traceId: string;
    fetchedAt: string;
    errors: Array<{ endpoint: string; error: string; status?: number }>;
    warnings: string[];
    params: {
      range: string;
      benchmark: string;
      scale: string;
    };
  };
}

async function fetchWithErrorHandling<T>(
  url: string,
  traceId: string
): Promise<{ data: T | null; error: string | null; status?: number }> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        data: null,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
        status: response.status,
      };
    }
    
    const data = await response.json();
    return { data: data as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest) {
  const traceId = randomUUID();
  const searchParams = request.nextUrl.searchParams;
  
  const range = (searchParams.get('range') || '1W') as Range;
  const benchmark = (searchParams.get('benchmark') || 'SPY') as Benchmark;
  const scale = (searchParams.get('scale') || 'Price') as Scale;
  
  const errors: Array<{ endpoint: string; error: string; status?: number }> = [];
  const warnings: string[] = [];
  
  // Fetch all data in parallel
  const [chartResult, headlinesResult, moversResult, sectorsResult] = await Promise.allSettled([
    // Chart data - try multiple endpoints
    (async () => {
      const primaryUrl = `/api/market/chart?symbol=${benchmark}&range=${range}`;
      const result = await fetchWithErrorHandling<any>(primaryUrl, traceId);
      
      if (result.data) {
        return result;
      }
      
      // Fallback endpoints
      const fallbacks = [
        `/api/market/indices?symbols=${benchmark}&range=${range}`,
        `/api/market/index?symbol=${benchmark}&range=${range}`,
      ];
      
      for (const url of fallbacks) {
        const fallbackResult = await fetchWithErrorHandling<any>(url, traceId);
        if (fallbackResult.data) {
          return fallbackResult;
        }
      }
      
      return result;
    })(),
    
    // Headlines
    fetchWithErrorHandling<any>(
      `/api/market-brief/headlines?range=${range}`,
      traceId
    ),
    
    // Top movers
    fetchWithErrorHandling<any>(
      `/api/market/top-movers?range=${range}&limit=10`,
      traceId
    ),
    
    // Sector momentum
    fetchWithErrorHandling<any>(
      `/api/market/sector-momentum?range=${range}`,
      traceId
    ),
  ]);
  
  // Process chart data
  let chartPoints: Array<{ t: string; v: number }> = [];
  if (chartResult.status === 'fulfilled' && chartResult.value.data) {
    chartPoints = adaptChartData(chartResult.value.data);
    if (scale === 'Return%' && chartPoints.length > 0) {
      const base = chartPoints[0]?.v ?? 0;
      if (base && Number.isFinite(base)) {
        chartPoints = chartPoints.map((p) => ({ t: p.t, v: (p.v - base) / base }));
      }
    }
  } else {
    const error = chartResult.status === 'rejected' 
      ? chartResult.reason?.message || 'Unknown error'
      : chartResult.value.error || 'Failed to fetch chart data';
    errors.push({ endpoint: '/api/market/chart', error });
  }
  
  // Process headlines
  let headlines: Array<any> = [];
  if (headlinesResult.status === 'fulfilled' && headlinesResult.value.data) {
    headlines = adaptHeadlines(headlinesResult.value.data);
  } else {
    const error = headlinesResult.status === 'rejected'
      ? headlinesResult.reason?.message || 'Unknown error'
      : headlinesResult.value.error || 'Failed to fetch headlines';
    errors.push({ endpoint: '/api/market-brief/headlines', error });
  }
  
  // Process movers
  let movers: Array<any> = [];
  if (moversResult.status === 'fulfilled' && moversResult.value.data) {
    movers = adaptMovers(moversResult.value.data);
  } else {
    const error = moversResult.status === 'rejected'
      ? moversResult.reason?.message || 'Unknown error'
      : moversResult.value.error || 'Failed to fetch movers';
    errors.push({ endpoint: '/api/market/top-movers', error });
  }
  
  // Process sectors
  let sectors: Array<any> = [];
  if (sectorsResult.status === 'fulfilled' && sectorsResult.value.data) {
    sectors = adaptSectors(sectorsResult.value.data);
  } else {
    const error = sectorsResult.status === 'rejected'
      ? sectorsResult.reason?.message || 'Unknown error'
      : sectorsResult.value.error || 'Failed to fetch sectors';
    errors.push({ endpoint: '/api/market/sector-momentum', error });
  }
  
  // Add warnings if partial data
  if (errors.length > 0 && errors.length < 4) {
    warnings.push('partial_data');
  }
  if (errors.length === 4) {
    warnings.push('all_endpoints_failed');
  }
  
  const response: MarketBriefResponse = {
    chartPoints,
    headlines,
    movers,
    sectors,
    meta: {
      traceId,
      fetchedAt: new Date().toISOString(),
      errors,
      warnings,
      params: {
        range,
        benchmark,
        scale,
      },
    },
  };
  
  // Return 200 even with errors - UI should show partial data
  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

