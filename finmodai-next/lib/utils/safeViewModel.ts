/**
 * Safe view model utilities
 * Provides null-safe access with defaults
 */

import { safeGet, safeArray, safeNumber, safeString } from './safeFetch';

export type SafeViewModel = {
  benchmark: {
    ticker: string;
    returnPct: number | null;
    asOf: string;
    source: string;
    points: Array<{ t: string; close: number }>;
  } | null;
  breadth: {
    sectorsUp: number;
    sectorsDown: number;
    winners: Array<{ sector: string; etf: string; returnPct: number }>;
    losers: Array<{ sector: string; etf: string; returnPct: number }>;
    coverage?: string;
  } | null;
  headlines: Array<{
    title: string;
    impact: string;
    publishedAt: string;
    source?: string;
    marketImpact?: string;
  }>;
  movers: {
    gainers: Array<{ ticker: string; returnPct: number; price?: number }>;
    losers: Array<{ ticker: string; returnPct: number; price?: number }>;
    coverage?: string;
  } | null;
};

/**
 * Build safe view model from raw data with null checks
 */
export function buildSafeViewModel(data: {
  benchmark?: any;
  sectorMomentum?: any;
  headlines?: any;
  topMovers?: any;
}): SafeViewModel {
  // Benchmark
  const benchmark = data.benchmark?.data
    ? {
        ticker: safeString(safeGet(data.benchmark, 'data.symbol', null), 'SPY'),
        returnPct: safeNumber(safeGet(data.benchmark, 'data.changePct', null), null),
        asOf: safeString(safeGet(data.benchmark, 'updatedAt', null), new Date().toISOString()),
        source: safeString(safeGet(data.benchmark, 'source', null), 'unknown'),
        points: safeArray(safeGet(data.benchmark, 'data.points', []), []),
      }
    : null;

  // Breadth from sector momentum
  const sectorScores = safeArray(
    safeGet(data.sectorMomentum, 'sectors', null) ||
    safeGet(data.sectorMomentum, 'data', null) ||
    safeGet(data.sectorMomentum, 'scores', null),
    []
  );

  const breadth = sectorScores.length > 0
    ? {
        sectorsUp: sectorScores.filter((s: any) => {
          const returnPct = safeNumber(safeGet(s, 'returnPct', null), null);
          return returnPct !== null && returnPct > 0;
        }).length,
        sectorsDown: sectorScores.filter((s: any) => {
          const returnPct = safeNumber(safeGet(s, 'returnPct', null), null);
          return returnPct !== null && returnPct < 0;
        }).length,
        winners: sectorScores
          .filter((s: any) => {
            const returnPct = safeNumber(safeGet(s, 'returnPct', null), null);
            return returnPct !== null && returnPct > 0;
          })
          .sort((a: any, b: any) => {
            const aReturn = safeNumber(safeGet(a, 'returnPct', null), 0) || 0;
            const bReturn = safeNumber(safeGet(b, 'returnPct', null), 0) || 0;
            return bReturn - aReturn;
          })
          .slice(0, 3)
          .map((s: any) => ({
            sector: safeString(safeGet(s, 'sector', null), 'Unknown'),
            etf: safeString(safeGet(s, 'ticker', null) || safeGet(s, 'etf', null), ''),
            returnPct: safeNumber(safeGet(s, 'returnPct', null), 0) || 0,
          })),
        losers: sectorScores
          .filter((s: any) => {
            const returnPct = safeNumber(safeGet(s, 'returnPct', null), null);
            return returnPct !== null && returnPct < 0;
          })
          .sort((a: any, b: any) => {
            const aReturn = safeNumber(safeGet(a, 'returnPct', null), 0) || 0;
            const bReturn = safeNumber(safeGet(b, 'returnPct', null), 0) || 0;
            return aReturn - bReturn;
          })
          .slice(0, 3)
          .map((s: any) => ({
            sector: safeString(safeGet(s, 'sector', null), 'Unknown'),
            etf: safeString(safeGet(s, 'ticker', null) || safeGet(s, 'etf', null), ''),
            returnPct: safeNumber(safeGet(s, 'returnPct', null), 0) || 0,
          })),
        coverage: safeString(safeGet(data.sectorMomentum, 'coverage', null), undefined),
      }
    : null;

  // Headlines
  const headlines = safeArray(
    safeGet(data.headlines, 'data.topStories', null) ||
    safeGet(data.headlines, 'data.items', null),
    []
  ).map((story: any) => ({
    title: safeString(safeGet(story, 'title', null) || safeGet(story, 'headline', null), ''),
    impact: safeString(safeGet(story, 'impact', null), 'Macro'),
    publishedAt: safeString(
      safeGet(story, 'publishedAt', null) ||
      safeGet(story, 'published_at', null) ||
      safeGet(story, 'published', null),
      new Date().toISOString()
    ),
    source: safeString(safeGet(story, 'source', null) || safeGet(story, 'domain', null), undefined),
    marketImpact: safeString(safeGet(story, 'marketImpact', null), undefined),
  })).filter((h: any) => h.title && h.title !== '—');

  // Movers
  const movers = data.topMovers?.ok && (data.topMovers.gainers || data.topMovers.losers)
    ? {
        gainers: safeArray(safeGet(data.topMovers, 'gainers', null), []).map((m: any) => ({
          ticker: safeString(safeGet(m, 'ticker', null), ''),
          returnPct: safeNumber(safeGet(m, 'returnPct', null), 0) || 0,
          price: safeNumber(safeGet(m, 'price', null), undefined),
        })),
        losers: safeArray(safeGet(data.topMovers, 'losers', null), []).map((m: any) => ({
          ticker: safeString(safeGet(m, 'ticker', null), ''),
          returnPct: safeNumber(safeGet(m, 'returnPct', null), 0) || 0,
          price: safeNumber(safeGet(m, 'price', null), undefined),
        })),
        coverage: safeString(safeGet(data.topMovers, 'coverage', null), undefined),
      }
    : null;

  return {
    benchmark,
    breadth,
    headlines,
    movers,
  };
}

