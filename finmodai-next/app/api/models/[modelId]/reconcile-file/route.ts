import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, unauthorized, notFound, serverError } from '@/lib/api/respond';
import { logRequestError, logRequestStart, logRequestSuccess } from '@/lib/api/logger';
import { reconcileFilePointer } from '@/lib/reconcileFile';

export async function POST(request: NextRequest, { params }: { params: { modelId: string } }) {
  const traceId = generateTraceId();
  const route = 'POST /api/models/[modelId]/reconcile-file';

  try {
    const { modelId } = params;
    const supabase = supabaseRouteClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      logRequestError({ traceId, route, modelId }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }
    const userId = session.user.id;
    logRequestStart({ traceId, route, modelId, userId });

    const { pointer, model } = await reconcileFilePointer({ supabase, modelId, userId });
    if (!model) {
      return notFound('Model not found', `No model ${modelId}`, 'MODEL_NOT_FOUND', traceId);
    }
    if (!pointer) {
      return new Response(JSON.stringify({ error: 'FILE_NOT_READY', traceId }), { status: 409 });
    }

    logRequestSuccess({ traceId, route, modelId }, 0);
    return ok({ file_pointer: pointer.value, file_kind: pointer.kind }, traceId);
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
