import type { NextRequest } from 'next/server';

async function hmacHex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function expectedAccessSessionToken(): Promise<string | null> {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return null;
  return hmacHex(process.env.COOKIE_SECRET ?? 'cb-default-secret', password);
}

export async function hasValidAccessSession(req: NextRequest): Promise<boolean> {
  const expected = await expectedAccessSessionToken();
  return Boolean(expected && req.cookies.get('cb_access')?.value === expected);
}
