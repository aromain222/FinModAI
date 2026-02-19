/**
 * API Client - Rate limiting and retry logic for API calls
 * 
 * Prevents hitting API limits and handles transient failures
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: number[]; // HTTP status codes to retry
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryOn: [429, 500, 502, 503, 504],
};

/**
 * Fetch with exponential backoff retry
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If response is OK or not retriable, return it
      if (response.ok || !opts.retryOn.includes(response.status)) {
        return response;
      }

      // If retriable status and not last attempt, retry
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs
        );
        console.warn(
          `[fetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed with status ${response.status}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      // Last attempt, return response even if not OK
      return response;
    } catch (error: any) {
      lastError = error;

      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs
        );
        console.warn(
          `[fetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed with error: ${error.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('All retry attempts failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate Limiter - Tracks requests per API provider
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if request is allowed under rate limit
   */
  canRequest(provider: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(provider) || [];

    // Remove requests outside the window
    const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
    this.requests.set(provider, recentRequests);

    return recentRequests.length < limit;
  }

  /**
   * Record a request
   */
  recordRequest(provider: string): void {
    const requests = this.requests.get(provider) || [];
    requests.push(Date.now());
    this.requests.set(provider, requests);
  }

  /**
   * Wait until request is allowed
   */
  async waitForSlot(provider: string, limit: number, windowMs: number): Promise<void> {
    while (!this.canRequest(provider, limit, windowMs)) {
      // Wait 1 second and check again
      await sleep(1000);
    }
    this.recordRequest(provider);
  }

  /**
   * Get current request count for a provider
   */
  getRequestCount(provider: string, windowMs: number): number {
    const now = Date.now();
    const requests = this.requests.get(provider) || [];
    return requests.filter(timestamp => now - timestamp < windowMs).length;
  }
}

// Singleton rate limiter
export const rateLimiter = new RateLimiter();

/**
 * API Rate Limits (requests per time window)
 */
export const API_RATE_LIMITS = {
  FMP: { limit: 250, windowMs: 24 * 60 * 60 * 1000 }, // 250/day
  ALPHA_VANTAGE: { limit: 5, windowMs: 60 * 1000 }, // 5/min
  POLYGON: { limit: 5, windowMs: 60 * 1000 }, // 5/min (free tier)
  NASDAQ_DATA_LINK: { limit: 50, windowMs: 24 * 60 * 60 * 1000 }, // 50/day
  FRED: { limit: 120, windowMs: 60 * 1000 }, // 120/min
  FINNHUB: { limit: 60, windowMs: 60 * 1000 }, // 60/min (free tier burst-safe)
  NEWS_API: { limit: 100, windowMs: 24 * 60 * 60 * 1000 }, // 100/day
  SCRAPE_DO: { limit: 1000, windowMs: 30 * 24 * 60 * 60 * 1000 }, // 1000/month
  STOOQ: { limit: 60, windowMs: 60 * 1000 }, // 60/min (estimated)
  DATABENTO: { limit: 100, windowMs: 60 * 1000 }, // 100/min (estimated)
  IEX_CLOUD: { limit: 50, windowMs: 1000 }, // 50/sec (estimated)
};

/**
 * Rate-limited fetch wrapper
 */
export async function rateLimitedFetch(
  provider: keyof typeof API_RATE_LIMITS,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const limits = API_RATE_LIMITS[provider];
  await rateLimiter.waitForSlot(provider, limits.limit, limits.windowMs);
  return fetchWithRetry(url, options);
}
