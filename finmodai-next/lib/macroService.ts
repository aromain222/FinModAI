/**
 * Macro Service
 * Thin wrapper around macroData with caching-friendly structure
 */

import { getMacroSnapshot, type MacroSnapshot, type TimeRange } from './macroData';

// Simple in-memory cache
const cache = new Map<string, { data: MacroSnapshot; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (reduced from 1 hour for fresher data)

/**
 * Fetch macro snapshot with caching
 * @param range - Time range for data
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 */
export async function fetchMacroSnapshot(range: TimeRange = '1M', forceRefresh: boolean = false): Promise<MacroSnapshot> {
  const cacheKey = `macro-${range}`;
  const now = Date.now();
  
  // Check cache (unless forcing refresh)
  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log(`[macroService] Using cached snapshot (age: ${Math.round((now - cached.timestamp) / 1000 / 60)} minutes)`);
      return cached.data;
    }
  }
  
  console.log(`[macroService] Generating fresh macro snapshot (range: ${range}, forceRefresh: ${forceRefresh})`);
  
  // Generate fresh data
  const data = await getMacroSnapshot(range);
  
  // Ensure asOf timestamp is current
  data.asOf = new Date().toISOString();
  
  // Update cache
  cache.set(cacheKey, { data, timestamp: now });
  
  console.log(`[macroService] ✅ Fresh snapshot generated with asOf: ${data.asOf}`);
  
  return data;
}

/**
 * Clear macro snapshot cache
 */
export function clearMacroCache(): void {
  cache.clear();
  console.log('[macroService] Cache cleared');
}

// Re-export types
export type { MacroSnapshot, TimeRange } from './macroData';
