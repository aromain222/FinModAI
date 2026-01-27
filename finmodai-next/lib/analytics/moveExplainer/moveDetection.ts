/**
 * Move Detection Algorithm
 * Finds the largest price moves in a series
 */

import type { PriceBar, MoveEvent } from './types';

/**
 * Convert ISO date to YYYY-MM-DD format
 */
function normalizeDate(date: string): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Compute returns for daily intervals
 */
function computeDailyReturns(bars: PriceBar[]): Array<{ date: string; returnPct: number; close: number; previousClose?: number }> {
  if (bars.length < 2) return [];
  
  const returns: Array<{ date: string; returnPct: number; close: number; previousClose?: number }> = [];
  
  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];
    
    if (!current.close || !previous.close || !Number.isFinite(current.close) || !Number.isFinite(previous.close)) {
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
 * Compute returns for weekly intervals
 * Groups by week (Monday-Sunday) and uses last close of each week
 */
function computeWeeklyReturns(bars: PriceBar[]): Array<{ date: string; returnPct: number; close: number; previousClose?: number }> {
  if (bars.length < 2) return [];
  
  // Group bars by week
  const weeklyBars = new Map<string, PriceBar>();
  
  for (const bar of bars) {
    if (!bar.close || !Number.isFinite(bar.close)) continue;
    
    const date = new Date(bar.date);
    const year = date.getFullYear();
    const weekNum = getWeekNumber(date);
    const weekKey = `${year}-W${weekNum}`;
    
    // Use last close of the week
    const existing = weeklyBars.get(weekKey);
    if (!existing || new Date(bar.date) > new Date(existing.date)) {
      weeklyBars.set(weekKey, bar);
    }
  }
  
  const sortedWeeks = Array.from(weeklyBars.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bar]) => bar);
  
  if (sortedWeeks.length < 2) return [];
  
  const returns: Array<{ date: string; returnPct: number; close: number; previousClose?: number }> = [];
  
  for (let i = 1; i < sortedWeeks.length; i++) {
    const current = sortedWeeks[i];
    const previous = sortedWeeks[i - 1];
    
    if (!current.close || !previous.close || !Number.isFinite(current.close) || !Number.isFinite(previous.close)) {
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
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Detect top N largest moves in a price series
 */
export function detectMoves(
  bars: PriceBar[],
  interval: 'daily' | 'weekly',
  topN: number = 10
): MoveEvent[] {
  if (bars.length < 2) return [];
  
  // Compute returns based on interval
  const returns = interval === 'daily' 
    ? computeDailyReturns(bars)
    : computeWeeklyReturns(bars);
  
  if (returns.length === 0) return [];
  
  // Sort by absolute return (descending)
  const sorted = [...returns].sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct));
  
  // Take top N and create MoveEvent objects
  const moves: MoveEvent[] = sorted.slice(0, topN).map((r, index) => ({
    date: r.date,
    returnPct: r.returnPct,
    direction: r.returnPct >= 0 ? 'up' : 'down',
    rank: index + 1,
    close: r.close,
    previousClose: r.previousClose,
  }));
  
  return moves;
}

