/**
 * Marketstack API Client
 */

export interface MarketstackQuote {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
}

export async function fetchQuote(symbol: string): Promise<MarketstackQuote | null> {
  const apiKey = process.env.MARKETSTACK_API_KEY;
  
  if (!apiKey) {
    console.warn('[marketstack] API key not configured');
    return null;
  }
  
  try {
    const url = `http://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${symbol}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.data?.[0] || null;
  } catch (error) {
    console.error('[marketstack] Error:', error);
    return null;
  }
}

// Timeout wrapper
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

// Fetch with timeout
export async function getStockQuoteWithTimeout(symbol: string, timeoutMs: number = 5000): Promise<MarketstackQuote | null> {
  try {
    return await withTimeout(fetchQuote(symbol), timeoutMs);
  } catch (error) {
    console.error('[getStockQuoteWithTimeout] Error:', error);
    return null;
  }
}
