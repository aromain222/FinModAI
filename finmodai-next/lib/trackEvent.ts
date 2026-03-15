let cachedUserId: string | null | undefined;
let userIdLookupInFlight: Promise<string | null> | null = null;

async function resolveUserId(explicitUserId?: string): Promise<string | null> {
  if (typeof explicitUserId === 'string') {
    const trimmed = explicitUserId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (cachedUserId !== undefined) return cachedUserId;
  if (typeof window === 'undefined') return null;

  if (!userIdLookupInFlight) {
    userIdLookupInFlight = (async () => {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs');
        const supabase = createClientComponentClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        cachedUserId = session?.user?.id ?? null;
      } catch {
        cachedUserId = null;
      } finally {
        userIdLookupInFlight = null;
      }
      return cachedUserId;
    })();
  }

  return userIdLookupInFlight;
}

export async function trackEvent(
  eventName: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const normalizedEventName = eventName?.trim();
  if (!normalizedEventName) return;
  if (typeof window === 'undefined') return;

  try {
    const resolvedUserId = await resolveUserId(userId);

    const response = await fetch('/api/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: normalizedEventName,
        user_id: resolvedUserId ?? null,
        metadata: metadata ?? null,
      }),
      keepalive: true,
    });

    if (!response.ok && process.env.NODE_ENV === 'development') {
      console.warn('[trackEvent] Non-OK response while tracking event', {
        eventName: normalizedEventName,
        status: response.status,
      });
    }
  } catch {
    // Fail silently by design for analytics tracking.
  }
}
