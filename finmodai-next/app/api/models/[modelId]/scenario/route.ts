import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logRequestSuccess } from '@/lib/api/logger';

export async function PATCH(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'PATCH /api/models/[modelId]/scenario';

  try {
    const body = await request.json().catch(() => ({}));
    const { scenario, scenario_adjustment_notes, scenario_summary_notes } = body || {};
    const modelId = params?.modelId;
    if (!modelId) return badRequest('modelId required', null, 'INVALID_MODEL_ID', traceId);

    const supabase = supabaseRouteClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      logRequestError({ traceId, route, modelId }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }
    const userId = session.user.id;
    logRequestStart({ traceId, route, modelId, userId });

    const updates: Record<string, any> = {};
    if (scenario && typeof scenario === 'string') updates.scenario = scenario;
    if (typeof scenario_adjustment_notes === 'string') updates.scenario_adjustment_notes = scenario_adjustment_notes.slice(0, 2000);
    if (typeof scenario_summary_notes === 'string') updates.scenario_summary_notes = scenario_summary_notes.slice(0, 2000);

    if (Object.keys(updates).length === 0) {
      return badRequest('No fields to update', null, 'NO_FIELDS', traceId);
    }

    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('id, user_id, scenario, scenario_adjustment_notes, scenario_summary_notes')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logRequestError({ traceId, route, modelId }, fetchError);
      return serverError('Database error', fetchError, traceId);
    }
    if (!model) return notFound('Model not found', `No model ${modelId}`, 'MODEL_NOT_FOUND', traceId);

    const { error: updateError } = await supabase
      .from('models')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', userId);

    if (updateError) {
      logRequestError({ traceId, route, modelId }, updateError);
      return serverError('Failed to update scenario', updateError, traceId);
    }

    logRequestSuccess({ traceId, route, modelId }, 0);
    return ok({ ...model, ...updates }, traceId);
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
