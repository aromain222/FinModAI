/**
 * Provider Registry with Fallback Chaining
 * Manages multiple data providers with automatic fallback on errors
 */

import { logger } from '@/lib/api/logger';
import type { PriceBar, NewsItem, EventItem } from './types';

export type ProviderHealth = {
  name: string;
  available: boolean;
  lastError?: string;
  lastSuccess?: string;
  lastFailure?: string;
  consecutiveFailures: number;
};

type ProviderAttempt<T> = {
  provider: string;
  result: T | null;
  error?: string;
  duration: number;
};

/**
 * Retry with exponential backoff
 */
async function withRetryBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a rate limit error (429)
      const isRateLimit = error instanceof Error && 
        (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('too many'));
      
      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (attempt >= maxRetries) {
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error('Unknown error');
}

/**
 * Provider registry for tracking health and selecting providers
 */
class ProviderRegistry {
  private health: Map<string, ProviderHealth> = new Map();
  
  /**
   * Record provider attempt (success or failure)
   */
  recordAttempt(providerName: string, success: boolean, error?: string): void {
    const existing = this.health.get(providerName) || {
      name: providerName,
      available: true,
      consecutiveFailures: 0,
    };
    
    if (success) {
      existing.available = true;
      existing.consecutiveFailures = 0;
      existing.lastSuccess = new Date().toISOString();
      existing.lastError = undefined;
      existing.lastFailure = undefined;
    } else {
      existing.consecutiveFailures += 1;
      existing.lastError = error || 'Unknown error';
      existing.lastFailure = new Date().toISOString();
      
      // Mark as unavailable after 3 consecutive failures
      if (existing.consecutiveFailures >= 3) {
        existing.available = false;
        logger.warn({ provider: providerName, consecutiveFailures: existing.consecutiveFailures }, 'provider:marked_unavailable');
      }
    }
    
    this.health.set(providerName, existing);
  }
  
  /**
   * Get health status for a provider
   */
  getProviderHealth(providerName: string): ProviderHealth | undefined {
    return this.health.get(providerName);
  }
  
  /**
   * Get all health status
   */
  getHealth(): Record<string, ProviderHealth> {
    const result: Record<string, ProviderHealth> = {};
    this.health.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  
  /**
   * Check if provider is available
   */
  isAvailable(providerName: string): boolean {
    const health = this.health.get(providerName);
    return health?.available !== false;
  }
  
  /**
   * Try a provider with health tracking and retry logic
   */
  async tryProvider<T>(
    providerName: string,
    fn: () => Promise<T>,
    traceId?: string
  ): Promise<ProviderAttempt<T>> {
    const startTime = Date.now();
    
    if (!this.isAvailable(providerName)) {
      return {
        provider: providerName,
        result: null,
        error: 'Provider marked as unavailable due to consecutive failures',
        duration: 0,
      };
    }
    
    try {
      const result = await withRetryBackoff(fn, 1); // Retry once with backoff
      const duration = Date.now() - startTime;
      
      this.recordAttempt(providerName, true);
      logger.info({ provider: providerName, duration, traceId }, 'provider:success');
      
      return {
        provider: providerName,
        result,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error?.message || String(error);
      
      this.recordAttempt(providerName, false, errorMsg);
      logger.warn({ provider: providerName, error: errorMsg, duration, traceId }, 'provider:failed');
      
      return {
        provider: providerName,
        result: null,
        error: errorMsg,
        duration,
      };
    }
  }
}

export const providerRegistry = new ProviderRegistry();

/**
 * Normalize date to YYYY-MM-DD (market date)
 */
export function normalizeMarketDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Use UTC date for consistency
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Normalize price series: ensure dates are YYYY-MM-DD and sorted ascending
 */
export function normalizePriceSeries(bars: PriceBar[]): PriceBar[] {
  return bars
    .map(bar => ({
      ...bar,
      date: normalizeMarketDate(bar.date),
    }))
    .filter(bar => {
      // Validate bar
      if (!bar.date || !bar.close || !Number.isFinite(bar.close) || bar.close <= 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Normalize news items: ensure publishedAt is valid ISO string, sort by date descending
 */
export function normalizeNewsItems(news: NewsItem[]): NewsItem[] {
  return news
    .filter(item => {
      // Validate news item
      if (!item.title || !item.url || !item.source || !item.publishedAt) {
        return false;
      }
      // Ensure publishedAt is valid date
      const date = new Date(item.publishedAt);
      return !isNaN(date.getTime());
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/**
 * Normalize event items: ensure dates are YYYY-MM-DD, sort by date descending
 */
export function normalizeEventItems(events: EventItem[]): EventItem[] {
  return events
    .map((event) => ({
      ...event,
      date: normalizeMarketDate(event.date),
    }))
    .filter((event) => {
      // Validate event
      if (!event.title || !event.date) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
}

/**
 * Try providers in order with fallback
 */
export async function tryProvidersWithFallback<T>(
  providers: Array<{ name: string; fn: () => Promise<T> }>,
  traceId?: string
): Promise<ProviderAttempt<T> | null> {
  for (const provider of providers) {
    const attempt = await providerRegistry.tryProvider(provider.name, provider.fn, traceId);
    
    if (attempt.result !== null) {
      return attempt;
    }
    
    // Continue to next provider
  }
  
  return null;
}

