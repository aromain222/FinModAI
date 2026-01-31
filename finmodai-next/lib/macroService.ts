/**
 * Macro Service
 * Thin wrapper around macroData with caching-friendly structure
 */

import { getMacroSnapshot, type MacroSnapshot, type TimeRange } from './macroData';

// Simple in-memory cache
const cache = new Map<string, { data: MacroSnapshot; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch macro snapshot with caching
 */
export async function fetchMacroSnapshot(range: TimeRange = '1M'): Promise<MacroSnapshot> {
  const cacheKey = `macro-${range}`;
  const now = Date.now();
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  // Generate fresh data
  const data = getMacroSnapshot(range);
  
  // Update cache
  cache.set(cacheKey, { data, timestamp: now });
  
  return data;
}

// Re-export types
export type { MacroSnapshot, TimeRange } from './macroData';
