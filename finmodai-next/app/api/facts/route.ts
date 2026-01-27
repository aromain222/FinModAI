import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { Facts, FactSourceProvider } from '@/lib/facts/types';
import {
  createEmptyFacts,
  mergeFacts,
  computeMissing,
  toUpperTicker,
  toNumberOrNull,
} from '@/lib/facts/normalize';
import { resolveEnrichedFacts } from '@/lib/enrich/pipeline';
import { getBaseUrl } from '@/lib/net/getBaseUrl';

export const runtime = 'nodejs';

/**
 * GET /api/facts?ticker=AAPL&require=price,sharesOutstanding,marketCap
 * 
 * Unified Facts endpoint that orchestrates providers in priority order:
 * 1) Existing primary providers (FMP/Finnhub/Polygon/AlphaVantage via enrichment pipeline)
 * 2) yfinance fallback (dev only)
 * 3) Last-resort manual fallback (returns missing list)
 */
export async function GET(request: NextRequest) {
  const traceId = randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');
  const requireParam = searchParams.get('require') || '';

  if (!ticker || ticker.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TICKER_REQUIRED',
        details: 'ticker query parameter is required',
        traceId,
      },
      { status: 400 }
    );
  }

  const normalizedTicker = toUpperTicker(ticker);
  const requiredFields = requireParam
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  try {
    const apiBase = getBaseUrl();
    const facts = await fetchFactsWithFallbacks(normalizedTicker, requiredFields, traceId, apiBase);
    
    // Compute missing fields
    const missing = computeMissing(facts, requiredFields);
    const finalFacts: Facts = {
      ...facts,
      missing,
    };

    return NextResponse.json(
      {
        ok: true,
        data: finalFacts,
        traceId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    console.error('[facts:route]', { traceId, ticker: normalizedTicker, error: errorMessage });
    
    // Return best-effort empty Facts with missing list
    const emptyFacts = createEmptyFacts(normalizedTicker);
    const missing = computeMissing(emptyFacts, requiredFields);
    
    return NextResponse.json(
      {
        ok: true, // Still return ok:true with missing fields
        data: {
          ...emptyFacts,
          missing,
          source: {
            primary: null,
            fallbacks: [],
          },
        },
        traceId,
      },
      { status: 200 }
    );
  }
}

/**
 * Fetch facts with provider fallback chain
 */
async function fetchFactsWithFallbacks(
  ticker: string,
  requiredFields: string[],
  traceId: string,
  baseUrl?: string
): Promise<Facts> {
  const attempts: FactSourceProvider[] = [];
  let accumulatedFacts = createEmptyFacts(ticker);

  // Priority 1: Existing enrichment pipeline (FMP/Finnhub/Polygon/AlphaVantage)
  try {
    console.log('[facts:route]', { traceId, ticker, attempt: 'enrichment-pipeline' });
    const enriched = await resolveEnrichedFacts({ ticker });
    attempts.push('fmp', 'finnhub', 'polygon', 'alphavantage');
    
    const pipelineFacts: Partial<Facts> = {
      ticker,
      companyName: enriched.companyName || null,
      currency: 'USD', // Default assumption
      exchange: null,
      price: toNumberOrNull(enriched.marketPrice),
      sharesOutstanding: toNumberOrNull(enriched.sharesOutstandingMm),
      marketCap: toNumberOrNull(enriched.marketCap),
      asOf: enriched.asOf || new Date().toISOString(),
      source: {
        primary: (enriched.sources?.shares || enriched.sources?.price || 'unknown') as FactSourceProvider,
        fallbacks: attempts,
      },
      confidence: 'high', // Enrichment pipeline is primary
      freshness: 'delayed',
      missing: [],
    };

    accumulatedFacts = mergeFacts(accumulatedFacts, pipelineFacts);
  } catch (error: any) {
    console.warn('[facts:route]', { traceId, ticker, error: 'enrichment-pipeline failed', details: error?.message });
  }

  // Priority 2: yfinance fallback (dev only)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const apiBase = baseUrl || getBaseUrl();
      const yfinanceUrl = new URL('/api/facts/yfinance', apiBase);
      yfinanceUrl.searchParams.set('ticker', ticker);
      
      console.log('[facts:route]', { traceId, ticker, attempt: 'yfinance' });
      const yfRes = await fetch(yfinanceUrl.toString(), { cache: 'no-store' });
      
      if (yfRes.ok) {
        const yfData = await yfRes.json();
        if (yfData.ok && yfData.data) {
          attempts.push('yfinance');
          accumulatedFacts = mergeFacts(accumulatedFacts, yfData.data);
        }
      }
    } catch (error: any) {
      console.warn('[facts:route]', { traceId, ticker, error: 'yfinance failed', details: error?.message });
    }
  }

  // Update fallbacks list
  accumulatedFacts.source.fallbacks = Array.from(new Set([...accumulatedFacts.source.fallbacks, ...attempts]));

  return accumulatedFacts;
}
