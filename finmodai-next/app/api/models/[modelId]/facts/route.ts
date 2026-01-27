import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, unauthorized, notFound, serverError } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logRequestSuccess } from '@/lib/api/logger';

const MS_24H = 24 * 60 * 60 * 1000;

const getEffectiveUserId = (session: any) => {
  const devBypass = process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === '1';
  if (devBypass) return '00000000-0000-0000-0000-000000000000';
  return session?.user?.id ?? null;
};

export async function GET(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'GET /api/models/[modelId]/facts';
  try {
    const supabase = supabaseRouteClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    const userId = getEffectiveUserId(session);
    if (authError || !userId) {
      logRequestError({ traceId, route }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }
    const modelId = params?.modelId;
    logRequestStart({ traceId, route, modelId, userId });

    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('id, user_id, ticker, results')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logRequestError({ traceId, route, modelId }, fetchError);
      return serverError('Database error', fetchError, traceId);
    }
    if (!model) return notFound('Model not found', `No model ${modelId}`, 'MODEL_NOT_FOUND', traceId);

    let results: any = model.results;
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch {
        results = {};
      }
    }

    const facts = results?.facts ?? null;
    return ok(
      {
        facts,
        sharesOutstandingMm: results?.sharesOutstandingMm ?? null,
        marketPrice: results?.marketPrice ?? null,
        marketCap: results?.marketCap ?? null,
        netDebt: results?.netDebt ?? null,
        companyName: results?.companyName ?? null,
      },
      traceId
    );
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}

export async function POST(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'POST /api/models/[modelId]/facts';
  try {
    const supabase = supabaseRouteClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    const userId = getEffectiveUserId(session);
    if (authError || !userId) {
      logRequestError({ traceId, route }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }
    const modelId = params?.modelId;
    logRequestStart({ traceId, route, modelId, userId });

    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('id, user_id, ticker, results')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logRequestError({ traceId, route, modelId }, fetchError);
      return serverError('Database error', fetchError, traceId);
    }
    if (!model) return notFound('Model not found', `No model ${modelId}`, 'MODEL_NOT_FOUND', traceId);

    let results: any = model.results;
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch {
        results = {};
      }
    }

    const updatedAt = results?.factsUpdatedAt ? new Date(results.factsUpdatedAt).getTime() : 0;
    const fresh = Date.now() - updatedAt < MS_24H;
    if (fresh && results?.factsUpdatedAt && results?.facts) {
      return ok(
        {
          facts: results.facts,
          sharesOutstandingMm: results.sharesOutstandingMm ?? results.facts?.sharesOutstandingMm ?? null,
          marketPrice: results.marketPrice ?? results.facts?.marketPrice ?? null,
          marketCap: results.marketCap ?? results.facts?.marketCap ?? null,
          companyName: results.companyName ?? results.facts?.companyName ?? null,
          netDebt: results.netDebt ?? results.facts?.netDebt ?? null,
        },
        traceId
      );
    }

    if (!model.ticker) {
      return ok({ sharesOutstandingMm: null, marketPrice: null, marketCap: null, companyName: null }, traceId);
    }

    const res = await fetch(`${request.nextUrl.origin}/api/enrichment/facts?ticker=${encodeURIComponent(model.ticker)}`, {
      cache: 'no-store',
    });
    const facts = await res.json();

    const equityValue =
      results?.valuation?.equityValue ??
      results?.equityValue ??
      results?.outputs?.equityValue ??
      null;

    const pricePerShare =
      equityValue && facts?.sharesOutstandingMm
        ? equityValue / facts.sharesOutstandingMm
        : results?.pricePerShare ?? null;

    const nextResults = {
      ...results,
      facts: facts,
      sharesOutstandingMm: facts?.sharesOutstandingMm ?? results?.sharesOutstandingMm ?? null,
      marketPrice: facts?.marketPrice ?? results?.marketPrice ?? null,
      marketCap: facts?.marketCap ?? results?.marketCap ?? null,
      netDebt: facts?.netDebt ?? results?.netDebt ?? null,
      companyName: facts?.companyName ?? results?.companyName ?? null,
      pricePerShare: pricePerShare,
      factSources: {
        shares: facts?.sharesSource ?? facts?.sources?.shares ?? 'unknown',
        price: facts?.priceSource ?? facts?.sources?.price ?? 'unknown',
      },
      factsUpdatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('models')
      .update({ results: nextResults, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', userId);

    if (updateError) {
      logRequestError({ traceId, route, modelId }, updateError);
      return serverError('Failed to store facts', updateError, traceId);
    }

    logRequestSuccess({ traceId, route, modelId }, 0);
    return ok(
      {
        facts: nextResults.facts,
        sharesOutstandingMm: nextResults.sharesOutstandingMm,
        marketPrice: nextResults.marketPrice,
        marketCap: nextResults.marketCap ?? null,
        netDebt: nextResults.netDebt ?? null,
        companyName: nextResults.companyName ?? null,
        pricePerShare: nextResults.pricePerShare ?? null,
      },
      traceId
    );
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
