/**
 * Watchlist utilities
 * Handles default featured tickers and user watchlist logic
 */

export const DEFAULT_FEATURED_TICKERS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'TSLA',
  'XOM',
  'JPM',
  'LLY',
  'LMT',
];

const WATCHLIST_STORAGE_KEY = 'market-brief-watchlist';

/**
 * Get watchlist tickers (user's saved list or default featured)
 */
export function getWatchlistTickers(): string[] {
  if (typeof window === 'undefined') {
    return DEFAULT_FEATURED_TICKERS;
  }

  try {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate tickers are strings
        const validTickers = parsed.filter((t: any) => typeof t === 'string' && t.trim().length > 0);
        if (validTickers.length > 0) {
          return validTickers.map((t: string) => t.trim().toUpperCase());
        }
      }
    }
  } catch (error) {
    console.warn('[watchlist] Failed to load watchlist from localStorage:', error);
  }

  return DEFAULT_FEATURED_TICKERS;
}

/**
 * Save watchlist tickers to localStorage
 */
export function saveWatchlistTickers(tickers: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    const validTickers = tickers
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim().toUpperCase());
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(validTickers));
  } catch (error) {
    console.error('[watchlist] Failed to save watchlist to localStorage:', error);
  }
}

