const MARKETSTACK_BASE_URL = 'http://api.marketstack.com/v1';

function getMarketstackApiKey(): string {
  const apiKey = process.env.MARKETSTACK_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MARKETSTACK_API_KEY in environment variables.');
  }
  return apiKey;
}

export async function getStockQuote(symbol: string) {
  const apiKey = getMarketstackApiKey();
  const url = `${MARKETSTACK_BASE_URL}/eod/latest?access_key=${apiKey}&symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Marketstack API error for ${symbol}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error(`No Marketstack data returned for symbol: ${symbol}`);
  }

  return data.data[0];
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[TIMEOUT] ${label} exceeded ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStockQuoteWithTimeout(symbol: string, ms = 8000) {
  return withTimeout(getStockQuote(symbol), ms, `getStockQuote(${symbol})`);
}
