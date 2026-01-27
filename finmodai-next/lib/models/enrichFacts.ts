/**
 * Model Facts Enrichment Helper
 * Calls /api/facts endpoint and returns normalized Facts
 * Never throws; returns best-effort Facts with missing list
 */

import type { Facts } from '@/lib/facts/types';
import { createEmptyFacts, toUpperTicker } from '@/lib/facts/normalize';
import { getBaseUrl } from '@/lib/net/getBaseUrl';

export type ModelType = 'dcf' | 'lbo' | 'comps' | 'three-statement' | 'merger' | 'operating';

/**
 * Determine required fields per model type
 */
export function getRequiredFieldsForModelType(modelType: ModelType): string[] {
  switch (modelType) {
    case 'dcf':
      return ['price', 'sharesOutstanding', 'currency'];
    case 'lbo':
      return ['price', 'sharesOutstanding', 'marketCap']; // All optional but useful
    case 'comps':
      return ['marketCap', 'price']; // Optional but useful
    case 'three-statement':
      return ['currency']; // Optional
    case 'merger':
    case 'operating':
      return []; // Minimal requirements
    default:
      return [];
  }
}

export type EnrichFactsOptions = {
  ticker: string;
  modelType?: ModelType;
  requiredFields?: string[];
  traceId?: string;
  baseUrl?: string;
};

/**
 * Enrich facts for a model
 * Never throws; returns best-effort Facts with missing list
 */
export async function enrichFacts(options: EnrichFactsOptions): Promise<Facts> {
  const { ticker, modelType, requiredFields, traceId, baseUrl } = options;
  const normalizedTicker = toUpperTicker(ticker);

  // Determine required fields
  const fields =
    requiredFields ||
    (modelType ? getRequiredFieldsForModelType(modelType) : []);

  try {
    const apiBase = baseUrl || getBaseUrl();
    const factsUrl = new URL('/api/facts', apiBase);
    factsUrl.searchParams.set('ticker', normalizedTicker);
    if (fields.length > 0) {
      factsUrl.searchParams.set('require', fields.join(','));
    }

    const res = await fetch(factsUrl.toString(), {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn('[enrichFacts]', {
        traceId,
        ticker: normalizedTicker,
        status: res.status,
        error: 'facts endpoint returned non-ok',
      });
      return createEmptyFacts(normalizedTicker);
    }

    const json = await res.json();
    if (json.ok && json.data) {
      return json.data as Facts;
    }

    console.warn('[enrichFacts]', {
      traceId,
      ticker: normalizedTicker,
      error: 'facts endpoint returned ok:false',
    });
    return createEmptyFacts(normalizedTicker);
  } catch (error: any) {
    console.error('[enrichFacts]', {
      traceId,
      ticker: normalizedTicker,
      error: error?.message || String(error),
    });
    // Never throw; return empty Facts
    return createEmptyFacts(normalizedTicker);
  }
}

