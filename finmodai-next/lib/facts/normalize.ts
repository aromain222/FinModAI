/**
 * Facts normalization helpers
 * Utilities for converting, merging, and validating Facts objects
 */

import type { Facts, FactSourceProvider } from './types';

/**
 * Convert value to number or null
 */
export function toNumberOrNull(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Normalize ticker to uppercase, strip whitespace
 */
export function toUpperTicker(ticker: string | null | undefined): string {
  if (!ticker || typeof ticker !== 'string') return '';
  return ticker.trim().toUpperCase();
}

/**
 * Merge Facts objects: prefers base unless null, appends fallbacks, updates missing
 */
export function mergeFacts(base: Partial<Facts>, next: Partial<Facts>): Facts {
  const ticker = toUpperTicker(next.ticker || base.ticker || '');
  
  // Merge source fallbacks
  const baseFallbacks = base.source?.fallbacks || [];
  const nextFallbacks = next.source?.fallbacks || [];
  const allFallbacks = Array.from(new Set([...baseFallbacks, ...nextFallbacks]));
  
  // Determine primary source (prefer next if it has one, else base)
  const primary = next.source?.primary || base.source?.primary || null;
  
  // Merge values: prefer next if not null, else base
  const merged: Facts = {
    ticker,
    companyName: next.companyName ?? base.companyName ?? null,
    currency: next.currency ?? base.currency ?? null,
    exchange: next.exchange ?? base.exchange ?? null,
    price: next.price ?? base.price ?? null,
    sharesOutstanding: next.sharesOutstanding ?? base.sharesOutstanding ?? null,
    marketCap: next.marketCap ?? base.marketCap ?? null,
    asOf: next.asOf ?? base.asOf ?? null,
    source: {
      primary,
      fallbacks: allFallbacks,
    },
    confidence: next.confidence || base.confidence || 'low',
    freshness: next.freshness || base.freshness || 'unknown',
    missing: computeMissing({ ...base, ...merged, ...next }, []),
  };
  
  return merged;
}

/**
 * Compute missing fields from requiredFields list
 */
export function computeMissing(facts: Partial<Facts>, requiredFields: string[]): string[] {
  if (requiredFields.length === 0) return [];
  
  const missing: string[] = [];
  const fieldMap: Record<string, (f: Partial<Facts>) => any> = {
    price: (f) => f.price,
    sharesOutstanding: (f) => f.sharesOutstanding,
    marketCap: (f) => f.marketCap,
    companyName: (f) => f.companyName,
    currency: (f) => f.currency,
    exchange: (f) => f.exchange,
  };
  
  for (const field of requiredFields) {
    const getter = fieldMap[field];
    if (getter) {
      const value = getter(facts);
      if (value === null || value === undefined) {
        missing.push(field);
      }
    } else {
      // Unknown field, assume missing
      missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Create an empty Facts object with defaults
 */
export function createEmptyFacts(ticker: string): Facts {
  return {
    ticker: toUpperTicker(ticker),
    companyName: null,
    currency: null,
    exchange: null,
    price: null,
    sharesOutstanding: null,
    marketCap: null,
    asOf: null,
    source: {
      primary: null,
      fallbacks: [],
    },
    confidence: 'low',
    freshness: 'unknown',
    missing: [],
  };
}

/**
 * Validate Facts object has required ticker
 */
export function isValidFacts(facts: Partial<Facts>): boolean {
  return typeof facts.ticker === 'string' && facts.ticker.trim().length > 0;
}

