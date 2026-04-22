import { type NextRequest } from 'next/server';
import { handleEvents } from '@/lib/news/api/events';
import { handleHeadlines } from '@/lib/news/api/headlines';
import {
  getSupabaseClient,
  isDev,
  json,
  parseParams,
  RANGE_VALUES,
  TYPE_VALUES,
} from '@/lib/news/api/shared';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const parsed = parseParams(request);
  if (!parsed.ok) {
    return json(
      {
        ok: false,
        error: 'invalid_params',
        details: parsed.details,
        allowed: { type: TYPE_VALUES, range: RANGE_VALUES, limit: '1..100' },
      },
      400
    );
  }

  const params = parsed.value;
  const supabase = getSupabaseClient();
  try {
    if (params.type === 'events') {
      const eventsPayload = await handleEvents(params, supabase);
      return json(eventsPayload, 200);
    }
    const headlinesPayload = await handleHeadlines(params, supabase);
    return json(headlinesPayload, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'route_failed';
    if (isDev()) console.error('[api/news] fatal', message);
    return json(
      {
        ok: false,
        error: 'provider_failed',
        details: { message },
      },
      502
    );
  }
}
