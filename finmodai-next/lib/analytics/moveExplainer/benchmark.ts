/**
 * Benchmark and Sector Context
 * Determines if moves are idiosyncratic vs market/sector-driven
 */

import { mapTickerToSector } from '@/lib/sectorMapping';
import type { MarketProvider, MoveEvent } from './types';

/**
 * Tech-heavy tickers that should use QQQ as benchmark
 */
const TECH_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD', 'QCOM', 'AVGO',
  'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'INTU',
  'NOW', 'TEAM', 'ZM', 'DOCN', 'SNOW', 'DDOG', 'NET', 'CRWD',
  'ZS', 'S', 'RPD', 'ASAN', 'FROG', 'ESTC', 'SPLK', 'MDB',
  'OKTA', 'VEEV', 'WDAY', 'COUP', 'WORK', 'DOCU', 'SLACK',
  'SQ', 'PYPL', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'LC',
  'FOUR', 'BMBL', 'MTCH', 'LYFT', 'UBER', 'ABNB', 'BKNG', 'EXPE',
  'TRIP', 'TCOM', 'PTON', 'PEL', 'LULU', 'RH', 'TGT', 'HD',
  'ROKU', 'FUBO', 'SPOT', 'PINS', 'SNAP', 'TWTR', 'REDDIT',
  'AI', 'C3AI', 'ANET', 'PANW', 'FTNT', 'CHKP', 'QLYS', 'TENB',
]);

/**
 * Determine if a ticker is tech-heavy (should use QQQ)
 */
export function isTechHeavyTicker(ticker: string): boolean {
  const normalized = ticker.toUpperCase().trim();
  
  // Check explicit tech ticker list
  if (TECH_TICKERS.has(normalized)) {
    return true;
  }
  
  // Additional heuristic: check if ticker is in known tech sectors
  // (Could also check against sector mapping, but keeping it simple to avoid dependencies)
  // For now, the explicit TECH_TICKERS list is comprehensive enough
  return false;
}

/**
 * Get default benchmark ticker for a stock
 */
export function getDefaultBenchmarkTicker(ticker: string): 'SPY' | 'QQQ' {
  return isTechHeavyTicker(ticker) ? 'QQQ' : 'SPY';
}

/**
 * Classify move as idiosyncratic vs market/sector-driven
 */
export function classifyMove(
  excessReturnPct: number,
  interval: 'daily' | 'weekly'
): 'idiosyncratic' | 'market-driven' | 'sector-driven' {
  const absExcess = Math.abs(excessReturnPct);
  const threshold = interval === 'daily' ? 1.5 : 3.0; // 1.5% daily, 3% weekly
  
  if (absExcess > threshold) {
    return 'idiosyncratic';
  }
  
  // If excess is small, it's likely market or sector-driven
  // For now, we'll call it "market-driven" (can be refined with sector ETF comparison later)
  return 'market-driven';
}

/**
 * Compute benchmark return for a move
 */
export function computeBenchmarkReturn(
  benchmarkBars: Array<{ date: string; close: number }>,
  moveDate: string,
  previousDate?: string
): { returnPct: number; found: boolean } {
  // Find benchmark bar for move date
  const moveBar = benchmarkBars.find(b => b.date === moveDate);
  
  // Find previous benchmark bar
  let previousBar;
  if (previousDate) {
    previousBar = benchmarkBars.find(b => b.date === previousDate);
  }
  
  // Fallback: use previous bar in series
  if (!previousBar && moveBar) {
    const moveIndex = benchmarkBars.findIndex(b => b.date === moveDate);
    if (moveIndex > 0) {
      previousBar = benchmarkBars[moveIndex - 1];
    }
  }
  
  if (!moveBar || !previousBar || !Number.isFinite(moveBar.close) || !Number.isFinite(previousBar.close)) {
    return { returnPct: 0, found: false };
  }
  
  const returnPct = ((moveBar.close - previousBar.close) / previousBar.close) * 100;
  
  return {
    returnPct: Number.isFinite(returnPct) ? returnPct : 0,
    found: true,
  };
}

/**
 * Enrich moves with benchmark comparison (SPY/QQQ) and classify as idiosyncratic vs market-driven.
 *
 * This is used by `/api/stocks/moves` and is designed to be resilient:
 * - If benchmark fetch fails, it returns moves with `benchmarkTicker` only.
 * - If a specific move date can't be matched, it leaves that move unmodified.
 */
export async function enrichMovesWithBenchmark(
  moves: MoveEvent[],
  benchmarkTicker: 'SPY' | 'QQQ',
  interval: 'daily' | 'weekly',
  provider: MarketProvider,
  traceId?: string
): Promise<MoveEvent[]> {
  if (!Array.isArray(moves) || moves.length === 0) return [];

  try {
    const dates = moves
      .map((m) => m.date)
      .filter((d): d is string => typeof d === 'string' && d.length > 0)
      .sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    const startDate = new Date(first);
    const endDate = new Date(last);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return moves.map((move) => ({ ...move, benchmarkTicker }));
    }

    // Extend range slightly to ensure we can compute "previous" bars.
    const start = new Date(startDate);
    start.setDate(start.getDate() - (interval === 'daily' ? 5 : 14));
    const end = new Date(endDate);
    end.setDate(end.getDate() + 2);

    const benchmarkBars =
      (await provider.getBenchmarkSeries?.(benchmarkTicker, {
        start: start.toISOString(),
        end: end.toISOString(),
        interval,
        traceId,
      })) ??
      (await provider.getPriceSeries({
        ticker: benchmarkTicker,
        start: start.toISOString(),
        end: end.toISOString(),
        interval,
        traceId,
      }));

    if (!Array.isArray(benchmarkBars) || benchmarkBars.length < 2) {
      return moves.map((move) => ({ ...move, benchmarkTicker }));
    }

    return moves.map((move) => {
      const benchmarkResult = computeBenchmarkReturn(benchmarkBars, move.date);
      if (!benchmarkResult.found) {
        return { ...move, benchmarkTicker };
      }

      const benchmarkReturnPct = benchmarkResult.returnPct;
      const excessReturnPct = move.returnPct - benchmarkReturnPct;
      const moveClass = classifyMove(excessReturnPct, interval);

      return {
        ...move,
        benchmarkReturnPct,
        excessReturnPct,
        moveClass,
        benchmarkTicker,
      };
    });
  } catch (error) {
    // Graceful degradation: keep the endpoint working even if benchmark enrichment fails.
    return moves.map((move) => ({ ...move, benchmarkTicker }));
  }
}
