/**
 * Trading Hours Utilities
 * Handles after-hours and pre-market news attribution
 */

/**
 * Convert date to ET (Eastern Time) parts
 */
function toEtParts(date: Date): { ymd: string; weekday: string; hour: number; minute: number } {
  // Use Intl.DateTimeFormat to get ET time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const year = parts.find(p => p.type === 'year')?.value || '2024';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  
  return {
    ymd: `${year}-${month}-${day}`,
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/**
 * Determine market session for a date in ET
 */
export function marketSessionEt(date: Date): 'in_hours' | 'before_open' | 'after_close' | 'closed' {
  const { weekday, hour, minute } = toEtParts(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = map[weekday] ?? 1;
  
  // Weekend = closed
  if (dayNum === 0 || dayNum === 6) return 'closed';
  
  const mins = hour * 60 + minute;
  const open = 9 * 60 + 30; // 9:30 AM
  const close = 16 * 60; // 4:00 PM (16:00)
  
  if (mins < open) return 'before_open';
  if (mins >= close) return 'after_close';
  return 'in_hours';
}

/**
 * Get the trading date for a news item
 * - After 4pm ET: attribute to next trading day
 * - Before 9:30am ET: attribute to same trading day
 * - During market hours: attribute to same trading day
 */
export function getTradingDateForNews(publishedAt: string): string {
  const date = new Date(publishedAt);
  const session = marketSessionEt(date);
  const { ymd, weekday } = toEtParts(date);
  
  // If after close, move to next trading day
  if (session === 'after_close') {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Skip weekends
    while (true) {
      const nextSession = marketSessionEt(nextDay);
      if (nextSession !== 'closed') {
        const nextParts = toEtParts(nextDay);
        return nextParts.ymd;
      }
      nextDay.setDate(nextDay.getDate() + 1);
    }
  }
  
  // If before open or during hours, use same day
  // But if it's a weekend, move to next Monday
  if (session === 'closed') {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    while (true) {
      const nextSession = marketSessionEt(nextDay);
      if (nextSession !== 'closed') {
        const nextParts = toEtParts(nextDay);
        return nextParts.ymd;
      }
      nextDay.setDate(nextDay.getDate() + 1);
    }
  }
  
  // Same trading day
  return ymd;
}

/**
 * Check if a date is a trading day
 */
export function isTradingDay(date: Date): boolean {
  const session = marketSessionEt(date);
  return session !== 'closed';
}

