import { NextRequest } from 'next/server';
import { resolveEnrichedFacts } from '@/lib/enrich/pipeline';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');
  const traceId = crypto.randomUUID();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required', traceId }), { status: 400 });
  }

  try {
    const resolved = await resolveEnrichedFacts({ ticker });
    console.log('[enrichment:facts]', {
      traceId,
      ticker,
      shares: resolved.sharesOutstandingMm,
      price: resolved.marketPrice,
      sources: resolved.sources,
    });

    return new Response(
      JSON.stringify({
        ticker,
        sharesOutstandingMm: resolved.sharesOutstandingMm ?? null,
        sharesSource: resolved.sources?.shares ?? 'unknown',
        marketPrice: resolved.marketPrice ?? null,
        priceSource: resolved.sources?.price ?? 'unknown',
        marketCap: resolved.marketCap ?? null,
        companyName: resolved.companyName ?? null,
        netDebt: resolved.netDebt ?? null,
        confidence: resolved.confidence ?? {},
        sources: resolved.sources ?? {},
        traceId,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: 'ENRICHMENT_FAILED',
        details: error?.message || 'Failed to enrich facts',
        traceId,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
