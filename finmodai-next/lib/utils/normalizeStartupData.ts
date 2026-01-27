/**
 * Utility to safely normalize startup data
 * Ensures whyTrending is always string[] to prevent runtime crashes
 */

import type { StartupCard } from '@/lib/data/types';

export interface NormalizedStartup extends Omit<StartupCard, 'whyTrending'> {
  whyTrending: string[];
}

/**
 * Normalizes whyTrending field to always be string[]
 * Handles: string | null | undefined | object | string[]
 */
export function normalizeWhyTrending(value: any): string[] {
  // Already an array
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }

  // String: split by newlines or return as single item
  if (typeof value === 'string' && value.trim().length > 0) {
    // Check if it contains newlines or bullet points
    if (value.includes('\n') || value.includes('•') || value.includes('-')) {
      return value
        .split(/\n|•|-/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return [value.trim()];
  }

  // Null, undefined, or empty
  return ['No specific signals detected'];
}

/**
 * Normalizes a single startup card
 */
export function normalizeStartup(startup: StartupCard): NormalizedStartup {
  return {
    ...startup,
    whyTrending: normalizeWhyTrending(startup.whyTrending),
  };
}

/**
 * Normalizes an array of startup cards
 */
export function normalizeStartups(startups: StartupCard[]): NormalizedStartup[] {
  return startups.map(normalizeStartup);
}

