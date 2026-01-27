/**
 * Price Move Detection
 * Deterministic algorithm to detect largest price moves in a series
 */

/**
 * Price bar data structure
 */
export type PriceBar = {
  date: string; // ISO date string (YYYY-MM-DD)
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

/**
 * Detected price move event
 */
export type MoveEvent = {
  date: string; // ISO date string (YYYY-MM-DD)
  returnPct: number; // Percentage return (e.g., 8.4 for +8.4%)
  direction: 'up' | 'down';
  rank: number; // 1 = largest move
  close: number; // Closing price on that date
  previousClose?: number; // Previous period's close
  // Benchmark context (optional, populated by enrichMovesWithBenchmark)
  benchmarkReturnPct?: number; // Benchmark return for same window
  excessReturnPct?: number; // Stock return - benchmark return
  moveClass?: 'idiosyncratic' | 'market-driven'; // Classification
  benchmarkTicker?: 'SPY' | 'QQQ'; // Which benchmark was used
};

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute returns for daily intervals
 * Uses close-to-close returns
 */
function computeDailyReturns(bars: PriceBar[]): Array<{
  date: string;
  returnPct: number;
  close: number;
  previousClose: number;
}> {
  if (bars.length < 2) return [];

  const returns: Array<{
    date: string;
    returnPct: number;
    close: number;
    previousClose: number;
  }> = [];

  // Sort bars by date to ensure correct order
  const sortedBars = [...bars].sort((a, b) => a.date.localeCompare(b.date));

  // Filter out invalid bars first, then compute returns
  const validBars = sortedBars.filter(
    (bar) =>
      bar.close &&
      Number.isFinite(bar.close) &&
      bar.close > 0
  );

  if (validBars.length < 2) return [];

  for (let i = 1; i < validBars.length; i++) {
    const current = validBars[i];
    const previous = validBars[i - 1];

    // Compute percentage return
    const returnPct = ((current.close - previous.close) / previous.close) * 100;

    if (Number.isFinite(returnPct)) {
      returns.push({
        date: normalizeDate(current.date),
        returnPct,
        close: current.close,
        previousClose: previous.close,
      });
    }
  }

  return returns;
}

/**
 * Get ISO week number (Monday = start of week)
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Convert Sunday (0) to 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to Thursday of the same week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Compute returns for weekly intervals
 * Groups by week (Monday-Sunday) and uses last close of each week
 */
function computeWeeklyReturns(bars: PriceBar[]): Array<{
  date: string;
  returnPct: number;
  close: number;
  previousClose: number;
}> {
  if (bars.length < 2) return [];

  // Sort bars by date
  const sortedBars = [...bars].sort((a, b) => a.date.localeCompare(b.date));

  // Group bars by week (ISO week: Monday-Sunday)
  const weeklyBars = new Map<string, PriceBar>();

  for (const bar of sortedBars) {
    if (!bar.close || !Number.isFinite(bar.close) || bar.close <= 0) {
      continue;
    }

    const date = new Date(bar.date);
    if (isNaN(date.getTime())) {
      continue;
    }

    const year = date.getUTCFullYear();
    const weekNum = getWeekNumber(date);
    const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;

    // Use last close of the week (keep the bar with the latest date in that week)
    const existing = weeklyBars.get(weekKey);
    if (!existing || new Date(bar.date) > new Date(existing.date)) {
      weeklyBars.set(weekKey, bar);
    }
  }

  // Convert map to sorted array
  const sortedWeeks = Array.from(weeklyBars.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bar]) => bar);

  if (sortedWeeks.length < 2) return [];

  // Compute week-over-week returns
  const returns: Array<{
    date: string;
    returnPct: number;
    close: number;
    previousClose: number;
  }> = [];

  for (let i = 1; i < sortedWeeks.length; i++) {
    const current = sortedWeeks[i];
    const previous = sortedWeeks[i - 1];

    if (
      !current.close ||
      !previous.close ||
      !Number.isFinite(current.close) ||
      !Number.isFinite(previous.close) ||
      current.close <= 0 ||
      previous.close <= 0
    ) {
      continue;
    }

    const returnPct = ((current.close - previous.close) / previous.close) * 100;

    if (Number.isFinite(returnPct)) {
      returns.push({
        date: normalizeDate(current.date),
        returnPct,
        close: current.close,
        previousClose: previous.close,
      });
    }
  }

  return returns;
}

/**
 * Detect top N largest price moves in a series
 * 
 * @param bars - Array of price bars
 * @param interval - 'daily' for daily returns, 'weekly' for weekly returns
 * @param topN - Number of top moves to return (default: 10)
 * @returns Array of MoveEvent objects sorted by absolute return (largest first)
 * 
 * @example
 * ```typescript
 * const bars: PriceBar[] = [
 *   { date: '2024-01-01', close: 100 },
 *   { date: '2024-01-02', close: 105 },
 *   { date: '2024-01-03', close: 98 },
 * ];
 * const moves = detectMoves(bars, 'daily', 5);
 * // Returns moves ranked by absolute return
 * ```
 */
export function detectMoves(
  bars: PriceBar[],
  interval: 'daily' | 'weekly',
  topN: number = 10
): MoveEvent[] {
  // Validate inputs
  if (!Array.isArray(bars)) {
    throw new Error('bars must be an array');
  }

  if (bars.length < 2) {
    return [];
  }

  if (typeof topN !== 'number' || topN < 1 || !Number.isFinite(topN)) {
    throw new Error('topN must be a positive integer');
  }

  // Compute returns based on interval
  const returns =
    interval === 'daily' ? computeDailyReturns(bars) : computeWeeklyReturns(bars);

  if (returns.length === 0) {
    return [];
  }

  // Sort by absolute return (descending) - largest moves first
  const sorted = [...returns].sort(
    (a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct)
  );

  // Take top N and create MoveEvent objects
  const moves: MoveEvent[] = sorted.slice(0, topN).map((r, index) => ({
    date: r.date,
    returnPct: r.returnPct,
    direction: r.returnPct >= 0 ? 'up' : 'down',
    rank: index + 1, // 1-based ranking
    close: r.close,
    previousClose: r.previousClose,
  }));

  return moves;
}

