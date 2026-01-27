/**
 * Benchmark Comparison
 * Enriches move events with benchmark context and classifies moves
 */

import type { MoveEvent } from './move_detection';
import type { MarketProvider, PriceSeriesParams } from '../lib/market_data/providers/types';

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
  return TECH_TICKERS.has(normalized);
}

/**
 * Get default benchmark ticker for a stock
 * Default: SPY (broad market)
 * Tech tickers: QQQ (tech sector)
 */
export function getDefaultBenchmarkTicker(ticker: string): 'SPY' | 'QQQ' {
  return isTechHeavyTicker(ticker) ? 'QQQ' : 'SPY';
}

/**
 * Classify move as idiosyncratic vs market-driven
 * 
 * @param excessReturnPct - Stock return - benchmark return
 * @param interval - 'daily' or 'weekly'
 * @returns 'idiosyncratic' if excess > threshold, 'market-driven' otherwise
 */
export function classifyMove(
  excessReturnPct: number,
  interval: 'daily' | 'weekly'
): 'idiosyncratic' | 'market-driven' {
  const absExcess = Math.abs(excessReturnPct);
  const threshold = interval === 'daily' ? 1.5 : 3.0; // 1.5% daily, 3% weekly

  if (absExcess > threshold) {
    return 'idiosyncratic';
  }

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
  // Normalize dates
  const normalizeDate = (date: string): string => {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const moveDateNorm = normalizeDate(moveDate);
  const previousDateNorm = previousDate ? normalizeDate(previousDate) : undefined;

  // Find benchmark bar for move date
  const moveIndex = benchmarkBars.findIndex((b) => normalizeDate(b.date) === moveDateNorm);
  const moveBar = moveIndex >= 0 ? benchmarkBars[moveIndex] : undefined;

  // Find previous benchmark bar
  let previousBar;
  if (previousDateNorm) {
    previousBar = benchmarkBars.find((b) => normalizeDate(b.date) === previousDateNorm);
  }

  // Fallback: use previous bar in series (for same interval as stock move)
  if (!previousBar && moveBar && moveIndex > 0) {
    previousBar = benchmarkBars[moveIndex - 1];
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
 * Extended MoveEvent with benchmark context
 */
export type MoveEventWithBenchmark = MoveEvent & {
  benchmarkReturnPct: number;
  excessReturnPct: number;
  moveClass: 'idiosyncratic' | 'market-driven';
  benchmarkTicker: 'SPY' | 'QQQ';
};

/**
 * Enrich moves with benchmark comparison
 */
export async function enrichMovesWithBenchmark(
  moves: MoveEvent[],
  benchmarkTicker: 'SPY' | 'QQQ',
  interval: 'daily' | 'weekly',
  provider: MarketProvider
): Promise<MoveEventWithBenchmark[]> {
  if (moves.length === 0) {
    return [];
  }

  try {
    // Determine date range for benchmark data
    const dates = moves.map((m) => m.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Extend range a bit to ensure we have previous bars
    const start = new Date(startDate);
    start.setDate(start.getDate() - 5); // 5 days before first move
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // 1 day after last move

    // Fetch benchmark price series
    const benchmarkBars = await provider.getPriceSeries({
      ticker: benchmarkTicker,
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
      interval,
    });

    if (benchmarkBars.length < 2) {
      // Not enough benchmark data, return moves without benchmark
      return moves.map((move) => ({
        ...move,
        benchmarkReturnPct: 0,
        excessReturnPct: move.returnPct,
        moveClass: 'idiosyncratic' as const,
        benchmarkTicker,
      }));
    }

    // Enrich each move with benchmark context
    const enrichedMoves: MoveEventWithBenchmark[] = moves.map((move) => {
      // For benchmark, we need to find the previous period's close
      // If move has previousClose date info, use it; otherwise use previous bar in series
      const previousDate = move.previousClose 
        ? undefined // Will use previous bar in series automatically
        : undefined;
      
      const benchmarkResult = computeBenchmarkReturn(
        benchmarkBars,
        move.date,
        previousDate
      );

      const benchmarkReturnPct = benchmarkResult.found ? benchmarkResult.returnPct : 0;
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

    return enrichedMoves;
  } catch (error: any) {
    // On error, return moves without benchmark (graceful degradation)
    console.warn(`[Benchmark] Failed to enrich moves: ${error?.message}`);
    return moves.map((move) => ({
      ...move,
      benchmarkReturnPct: 0,
      excessReturnPct: move.returnPct,
      moveClass: 'idiosyncratic' as const,
      benchmarkTicker,
    }));
  }
}

