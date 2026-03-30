export function responseBodyLooksLikeHtml(rawBody: string): boolean {
  const trimmed = rawBody.trim();
  return /^<!doctype html>/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

export function buildClientVisibleBackendError(params: {
  rawBody: string;
  payload: Record<string, unknown> | null;
  fallbackStatusText?: string;
}): string {
  const { rawBody, payload, fallbackStatusText } = params;
  if (payload && typeof payload.reply === 'string' && payload.reply.trim().length > 0) {
    return payload.reply.trim();
  }
  if (payload && typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error.trim();
  }
  if (rawBody.trim().length === 0) {
    return fallbackStatusText ?? 'Analyst Chat request failed.';
  }
  if (responseBodyLooksLikeHtml(rawBody)) {
    return 'The server returned an unexpected internal error page before Analyst Chat could produce a structured response.';
  }
  return rawBody.trim();
}
