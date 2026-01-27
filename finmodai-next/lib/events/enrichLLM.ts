import type { EventImpact, EventWithImpact } from './types';

const cache = new Map<string, EventImpact>();

/**
 * Optional LLM enrichment for event impact.
 * Guarded by EVENTS_LLM_ENRICH and OPENAI_API_KEY. Returns baseline if disabled or missing.
 * This stub currently returns the baseline to stay deterministic; extend with OpenAI call if enabled.
 */
export async function enrichEventImpactLLM<T extends EventWithImpact>(
  event: T,
  baseline: EventImpact
): Promise<EventImpact> {
  const enrichFlag = process.env.EVENTS_LLM_ENRICH === '1';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!enrichFlag || !apiKey) {
    return baseline;
  }

  const cacheKey = `${event?.['id'] ?? event?.['key'] ?? baseline.whyItMatters}:${event?.['timestamp'] ?? ''}`;
  if (cacheKey && cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  // Placeholder: return baseline deterministically to avoid surprises in prod.
  cache.set(cacheKey, baseline);
  return baseline;
}
