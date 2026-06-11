const FORWARDED_HEADERS = [
  'authorization',
  'cookie',
  'x-vercel-protection-bypass',
] as const;

export function internalRequestHeaders(source?: Headers): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (!source) return headers;

  for (const name of FORWARDED_HEADERS) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}
