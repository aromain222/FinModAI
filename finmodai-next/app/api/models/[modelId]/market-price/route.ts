import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, unauthorized, notFound } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logRequestSuccess } from '@/lib/api/logger';
import { fetchLatestMarketPrice } from '@/lib/providers/market/price';

const getEffectiveUserId = (session: any) => {
  const devBypass = process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === '1';
  if (devBypass) return '00000000-0000-0000-0000-000000000000';
  return session?.user?.id ?? null;
};

export async function POST(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'POST /api/models/[modelId]/market-price';
  const startedAt = Date.now();

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
      return ok(
        { marketPrice: null, source: 'unavailable', asOf: new Date().toISOString(), warnings: ['db_fetch_failed'] },
        traceId
      );
    }
    if (!model) {
      return notFound('Model not found', `No model ${modelId}`, 'MODEL_NOT_FOUND', traceId);
    }

    let results: any = model.results;
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch {
        results = {};
      }
    }
    if (!results || typeof results !== 'object') results = {};

    const ticker = typeof model.ticker === 'string' ? model.ticker.trim().toUpperCase() : '';
    if (!ticker) {
      const nextResults = { ...results, marketPrice: null, marketPriceSource: null, marketPriceUpdatedAt: new Date().toISOString() };
      await supabase
        .from('models')
        .update({ results: nextResults, updated_at: new Date().toISOString() })
        .eq('id', modelId)
        .eq('user_id', userId);
      logRequestSuccess({ traceId, route, modelId }, Date.now() - startedAt);
      return ok({ marketPrice: null, source: 'unavailable', asOf: new Date().toISOString(), warnings: ['ticker_missing'] }, traceId);
    }

    const snapshot = await fetchLatestMarketPrice({ ticker, traceId });

    const nextResults = {
      ...results,
      marketPrice: snapshot.marketPrice,
      marketPriceSource: snapshot.source === 'unavailable' ? null : snapshot.source,
      marketPriceAsOf: snapshot.asOf,
      marketPriceUpdatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('models')
      .update({ results: nextResults, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', userId);

    if (updateError) {
      logRequestError({ traceId, route, modelId }, updateError);
      return ok(
        { marketPrice: snapshot.marketPrice, source: snapshot.source, asOf: snapshot.asOf, warnings: [...snapshot.warnings, 'db_update_failed'] },
        traceId
      );
    }

    logRequestSuccess({ traceId, route, modelId }, Date.now() - startedAt);
    return ok(
      { marketPrice: snapshot.marketPrice, source: snapshot.source, asOf: snapshot.asOf, warnings: snapshot.warnings },
      traceId
    );
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return ok(
      { marketPrice: null, source: 'unavailable', asOf: new Date().toISOString(), warnings: ['exception'] },
      traceId
    );
  }
}

