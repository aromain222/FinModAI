/**
 * Macro IQ Card Builder
 * Builds 3-4 distinct Macro IQ cards from raw inputs
 */

import 'server-only';

import { createHash } from 'crypto';
import { getMarketSeries } from '@/lib/market/provider';
import { fetchFredSeries } from '@/lib/providers/macro/fred';
import type { MacroIQCard } from './types';
import { renderMacroEvent, type EventType } from './templates';
import type { TemplateInputs } from './templates';

const EVENT_TYPE_PRIORITY: EventType[] = ['CPI_PRINT', 'JOBS_REPORT', 'FOMC_UPDATE', 'OIL_SHOCK', 'GEOPOLITICS'];

/**
 * Generate stable event ID
 */
function generateEventId(eventType: EventType, date: string, region: string): string {
  const input = `${eventType}|${date}|${region}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Extract CPI data from macro summary
 */
function extractCPIData(macroSummary?: {
  inflation?: { value: number | null; date: string | null };
}): { value: number | null; date: string | null; direction?: 'up' | 'down' | 'stable' } {
  if (!macroSummary?.inflation) {
    return { value: null, date: null };
  }
  
  const value = macroSummary.inflation.value;
  const date = macroSummary.inflation.date;
  
  // Simple direction inference (would be enhanced with historical comparison)
  const direction: 'up' | 'down' | 'stable' = value != null && value > 3 ? 'up' : value != null && value < 2 ? 'down' : 'stable';
  
  return { value, date, direction };
}

/**
 * Extract Jobs data from macro summary
 */
function extractJobsData(macroSummary?: {
  unemployment?: { value: number | null; date: string | null };
}): { value: number | null; date: string | null; direction?: 'up' | 'down' | 'stable' } {
  if (!macroSummary?.unemployment) {
    return { value: null, date: null };
  }
  
  const value = macroSummary.unemployment.value;
  const date = macroSummary.unemployment.date;
  
  // Lower unemployment = tighter labor market
  const direction: 'up' | 'down' | 'stable' = value != null && value < 4 ? 'down' : value != null && value > 5 ? 'up' : 'stable';
  
  return { value, date, direction };
}

/**
 * Extract Fed data from macro summary
 */
function extractFedData(macroSummary?: {
  fedFunds?: { value: number | null; date: string | null };
}): { value: number | null; date: string | null; direction?: 'hike' | 'cut' | 'hold' } {
  if (!macroSummary?.fedFunds) {
    return { value: null, date: null };
  }
  
  const value = macroSummary.fedFunds.value;
  const date = macroSummary.fedFunds.date;
  
  // Default to 'hold' (would be enhanced with historical comparison)
  const direction: 'hike' | 'cut' | 'hold' = 'hold';
  
  return { value, date, direction };
}

/**
 * Extract oil price from market data (simplified)
 */
async function extractOilData(
  region: string,
  traceId: string
): Promise<{ value: number | null; date: string | null; direction?: 'up' | 'down' | 'stable'; movePct1D: number | null }> {
  try {
    // Try to get oil price from market series (CL=F for WTI)
    const series = await getMarketSeries({ ticker: 'CL=F', range: '1M', traceId });
    if (series.points.length > 0) {
      const latest = series.points[series.points.length - 1];
      const previous = series.points[series.points.length - 2];
      
      if (latest && previous) {
        const value = latest.close;
        const date = latest.t;
        const movePct1D = previous.close > 0 ? ((value - previous.close) / previous.close) * 100 : null;
        const direction: 'up' | 'down' | 'stable' = value > previous.close * 1.05 ? 'up' : value < previous.close * 0.95 ? 'down' : 'stable';
        return { value, date, direction, movePct1D: Number.isFinite(movePct1D as number) ? (movePct1D as number) : null };
      }
    }
  } catch (error) {
    // Fallback if data unavailable
  }
  
  return { value: null, date: null, movePct1D: null };
}

/**
 * Extract geopolitical headline from news
 */
function extractGeopoliticsHeadline(
  headlines?: Array<{ title: string; publishedAt: string }>
): { headline: string | null; date: string | null } {
  if (!headlines || headlines.length === 0) {
    return { headline: null, date: null };
  }
  
  // Look for geopolitical keywords
  const geoKeywords = ['war', 'conflict', 'tension', 'sanction', 'trade', 'tariff', 'geopolitical', 'crisis'];
  
  for (const item of headlines) {
    const lower = item.title.toLowerCase();
    if (geoKeywords.some(keyword => lower.includes(keyword))) {
      return { headline: item.title, date: item.publishedAt };
    }
  }
  
  // Fallback to first headline if no match
  return headlines[0] ? { headline: headlines[0].title, date: headlines[0].publishedAt } : { headline: null, date: null };
}

/**
 * Get SPY market move
 */
async function getSPYMove(
  region: string,
  traceId: string
): Promise<{ movePct1W: number | null; movePct1D: number | null; hasData: boolean }> {
  try {
    const series = await getMarketSeries({ ticker: 'SPY', range: '1W', traceId });
    if (series.points.length >= 2) {
      const first = series.points[0]?.close ?? null;
      const previous = series.points[series.points.length - 2]?.close ?? null;
      const last = series.points[series.points.length - 1]?.close ?? null;
      
      const movePct1W = first && last && first > 0 ? ((last - first) / first) * 100 : null;
      const movePct1D = previous && last && previous > 0 ? ((last - previous) / previous) * 100 : null;
      const hasData = Number.isFinite(movePct1W as number) || Number.isFinite(movePct1D as number);
      return {
        movePct1W: Number.isFinite(movePct1W as number) ? (movePct1W as number) : null,
        movePct1D: Number.isFinite(movePct1D as number) ? (movePct1D as number) : null,
        hasData,
      };
    }
  } catch (error) {
    // Fallback
  }
  
  return { movePct1W: null, movePct1D: null, hasData: false };
}

type ExtraMoves = TemplateInputs['marketMoves'];

async function getExtraMarketMoves(traceId: string): Promise<{ moves: ExtraMoves; seriesCount: number }> {
  const defs = [
    { key: 'tlt1d', ticker: 'TLT' },
    { key: 'hyg1d', ticker: 'HYG' },
    { key: 'uup1d', ticker: 'UUP' },
    { key: 'gld1d', ticker: 'GLD' },
  ] as const;

  const settled = await Promise.allSettled(
    defs.map((def) => getMarketSeries({ ticker: def.ticker, range: '1W', traceId }))
  );

  const moves: Record<string, number | null> = {};
  let seriesCount = 0;
  settled.forEach((result, idx) => {
    const def = defs[idx];
    if (!def) return;
    if (result.status !== 'fulfilled') {
      moves[def.key] = null;
      return;
    }
    const points = result.value.points;
    if (points.length < 2) {
      moves[def.key] = null;
      return;
    }
    const previous = points[points.length - 2]?.close ?? null;
    const last = points[points.length - 1]?.close ?? null;
    if (!previous || !last || previous <= 0) {
      moves[def.key] = null;
      return;
    }
    const pct = ((last - previous) / previous) * 100;
    moves[def.key] = Number.isFinite(pct) ? pct : null;
    seriesCount += 1;
  });

  return {
    moves: {
      tlt1d: moves.tlt1d ?? null,
      hyg1d: moves.hyg1d ?? null,
      uup1d: moves.uup1d ?? null,
      gld1d: moves.gld1d ?? null,
    } satisfies ExtraMoves,
    seriesCount,
  };
}

/**
 * Build Macro IQ Cards
 * Always returns 3-4 distinct cards with enforced diversity
 */
export async function buildMacroIQCards(params: {
  region: string;
  range: '1D' | '1W' | '1M';
  traceId: string;
  headlines?: Array<{ title: string; publishedAt: string; source?: string }>;
  macroSummary?: {
    inflation?: { value: number | null; date: string | null };
    unemployment?: { value: number | null; date: string | null };
    fedFunds?: { value: number | null; date: string | null };
  };
}): Promise<{
  cards: MacroIQCard[];
  rawInputs: {
    newsCount: number;
    macroSeriesCount: number;
    priceSeriesCount: number;
  };
}> {
  const { region, range, traceId, headlines = [], macroSummary } = params;
  
  // Count raw inputs
  const newsCount = headlines.length;
  const macroSeriesCount = macroSummary
    ? (macroSummary.inflation ? 1 : 0) + (macroSummary.unemployment ? 1 : 0) + (macroSummary.fedFunds ? 1 : 0)
    : 0;
  
  // Extract data for each event type
  const cpiData = extractCPIData(macroSummary);
  const jobsData = extractJobsData(macroSummary);
  const fedData = extractFedData(macroSummary);
  const oilData = await extractOilData(region, traceId);
  const geoData = extractGeopoliticsHeadline(headlines);
  const spyData = await getSPYMove(region, traceId);
  const extraMoves = await getExtraMarketMoves(traceId);

  const marketMoves: TemplateInputs['marketMoves'] = {
    spy1d: spyData.movePct1D,
    spy1w: spyData.movePct1W,
    wti1d: oilData.movePct1D,
    ...extraMoves.moves,
  };
  
  // Count price series
  const priceSeriesCount = (spyData.hasData ? 1 : 0) + (oilData.value != null ? 1 : 0) + extraMoves.seriesCount;
  
  // Build cards in priority order, ensuring uniqueness
  const cards: MacroIQCard[] = [];
  const usedTypes = new Set<EventType>();
  const now = new Date().toISOString();
  
  // Helper to add card if type not used
  const addCardIfUnique = (eventType: EventType, inputs: TemplateInputs) => {
    if (usedTypes.has(eventType) || cards.length >= 4) return;
    
    const eventId = generateEventId(eventType, now, region);
    const card = renderMacroEvent(eventType, inputs, eventId);
    cards.push(card);
    usedTypes.add(eventType);
  };
  
  // 1. CPI_PRINT (highest priority)
  if (cpiData.value != null || cards.length < 3) {
    addCardIfUnique('CPI_PRINT', {
      cpiValue: cpiData.value,
      cpiDate: cpiData.date,
      cpiDirection: cpiData.direction,
      spyMove: spyData.movePct1W,
      marketMoves,
      hasNews: newsCount > 0,
      hasMacro: cpiData.value != null,
      hasPrices: spyData.hasData,
    });
  }
  
  // 2. JOBS_REPORT
  if (jobsData.value != null || cards.length < 3) {
    addCardIfUnique('JOBS_REPORT', {
      unemploymentRate: jobsData.value,
      jobsDate: jobsData.date,
      jobsDirection: jobsData.direction,
      spyMove: spyData.movePct1W,
      marketMoves,
      hasNews: newsCount > 0,
      hasMacro: jobsData.value != null,
      hasPrices: spyData.hasData,
    });
  }
  
  // 3. FOMC_UPDATE
  if (fedData.value != null || cards.length < 3) {
    addCardIfUnique('FOMC_UPDATE', {
      fedFundsRate: fedData.value,
      fomcDate: fedData.date,
      fomcDirection: fedData.direction,
      spyMove: spyData.movePct1W,
      marketMoves,
      hasNews: newsCount > 0,
      hasMacro: fedData.value != null,
      hasPrices: spyData.hasData,
    });
  }
  
  // 4. OIL_SHOCK
  if (oilData.value != null || cards.length < 3) {
    addCardIfUnique('OIL_SHOCK', {
      oilPrice: oilData.value,
      oilDate: oilData.date,
      oilDirection: oilData.direction,
      spyMove: spyData.movePct1W,
      marketMoves,
      hasNews: newsCount > 0,
      hasMacro: false,
      hasPrices: oilData.value != null,
    });
  }
  
  // 5. GEOPOLITICS (fallback if needed)
  if (geoData.headline || cards.length < 3) {
    addCardIfUnique('GEOPOLITICS', {
      headline: geoData.headline || undefined,
      headlineDate: geoData.date,
      spyMove: spyData.movePct1W,
      marketMoves,
      hasNews: !!geoData.headline,
      hasMacro: false,
      hasPrices: spyData.hasData,
    });
  }
  
  // Ensure we have at least 3 cards (fill with defaults if needed)
  while (cards.length < 3) {
    // Find next unused type
    const nextType = EVENT_TYPE_PRIORITY.find(type => !usedTypes.has(type));
    if (!nextType) break; // Should not happen
    
    const eventId = generateEventId(nextType, now, region);
    const card = renderMacroEvent(nextType, {
      hasNews: false,
      hasMacro: false,
      hasPrices: false,
    }, eventId);
    cards.push(card);
    usedTypes.add(nextType);
  }
  
  // Trim to exactly 4 if we have more
  const finalCards = cards.slice(0, 4);
  
  return {
    cards: finalCards,
    rawInputs: {
      newsCount,
      macroSeriesCount,
      priceSeriesCount,
    },
  };
}
