import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logRequestSuccess } from '@/lib/api/logger';

export async function POST(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'POST /api/models/[modelId]/enrich';

  try {
    const { modelId } = params;
    if (!modelId) return badRequest('modelId required', null, 'INVALID_MODEL_ID', traceId);

    const supabase = supabaseRouteClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    const devBypass = process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === '1';
    const userId = devBypass ? '00000000-0000-0000-0000-000000000000' : session?.user?.id;
    if (authError || !userId) {
      logRequestError({ traceId, route, modelId }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }
    logRequestStart({ traceId, route, modelId, userId });

    const { data: modelRow, error: fetchError } = await supabase
      .from('models')
      .select('id, ticker, results, preview, r2_key, file_name')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logRequestError({ traceId, route, modelId }, fetchError);
      return serverError('Database error', fetchError, traceId);
    }
    if (!modelRow) {
      return notFound('Model not found', `No model with id ${modelId}`, 'MODEL_NOT_FOUND', traceId);
    }

    let results: any = modelRow.results;
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch {
        results = {};
      }
    }
    const equityValue = results?.valuation?.equityValue ?? results?.equityValue ?? results?.outputs?.equityValue;
    const existingShares = results?.sharesOutstandingMm ?? results?.shares ?? results?.sharesOutstanding;
    if (existingShares && existingShares > 0 && results?.pricePerShare) {
      return ok(
        {
          sharesOutstandingMm: existingShares,
          pricePerShare: results.pricePerShare,
          marketPrice: results?.marketPrice ?? null,
          source: results.sharesSource,
        },
        traceId
      );
    }

    if (!modelRow.ticker) {
      return ok({ sharesOutstandingMm: null, pricePerShare: null, note: 'Ticker missing' }, traceId);
    }

    const enrichRes = await fetch(
      `${request.nextUrl.origin}/api/enrichment/facts?ticker=${encodeURIComponent(modelRow.ticker)}`,
      { cache: 'no-store' }
    );
    const data = await enrichRes.json();
    const sharesMm = data?.sharesOutstandingMm;
    const source = data?.sharesSource ?? data?.sources?.shares ?? 'unknown';

    if (!sharesMm || !Number.isFinite(sharesMm) || sharesMm <= 0) {
      return ok(
        {
          sharesOutstandingMm: null,
          pricePerShare: null,
          marketPrice: data?.marketPrice ?? null,
          source,
          warnings: data?.warnings ?? [],
        },
        traceId
      );
    }

    // Update results
    const nextResults = {
      ...results,
      facts: data,
      sharesOutstandingMm: sharesMm,
      sharesSource: source,
      marketPrice: data?.marketPrice ?? results?.marketPrice ?? null,
      marketCap: data?.marketCap ?? results?.marketCap ?? null,
      lastEnrichedAt: new Date().toISOString(),
    };
    if (!nextResults.valuation) nextResults.valuation = {};
    if (!nextResults.valuation.sharesOutstandingMm) nextResults.valuation.sharesOutstandingMm = sharesMm;

    if (!nextResults.pricePerShare && equityValue && sharesMm > 0) {
      nextResults.pricePerShare = equityValue / sharesMm;
    }

    const { error: updateError } = await supabase
      .from('models')
      .update({ results: nextResults, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', userId);

    if (updateError) {
      logRequestError({ traceId, route, modelId }, updateError);
      return serverError('Failed to store enrichment', updateError, traceId);
    }

    logRequestSuccess({ traceId, route, modelId }, 0);
    return ok(
      {
        sharesOutstandingMm: sharesMm,
        pricePerShare: nextResults.pricePerShare ?? null,
        marketPrice: nextResults.marketPrice ?? null,
        source,
        facts: data,
      },
      traceId
    );
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
