const FORWARDED_HEADERS = [
  'authorization',
  'cookie',
  'x-vercel-protection-bypass',
] as const;

export function internalRequestHeaders(source?: Headers): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (source) {
    for (const name of FORWARDED_HEADERS) {
      const value = source.get(name);
      if (value) headers.set(name, value);
    }
  }

  // Server-side scheduled jobs do not have a browser request to forward. Vercel
  // exposes this short-lived bypass token to its own runtime, allowing internal
  // calls to protected app routes without ever exposing it to the client.
  if (!headers.has('x-vercel-protection-bypass')) {
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) headers.set('x-vercel-protection-bypass', bypass);
  }

  return headers;
}
