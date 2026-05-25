import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_NAME    = 'cb_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function cookieToken(): string | null {
  const password = process.env.ACCESS_PASSWORD;
  const secret   = process.env.COOKIE_SECRET ?? 'cb-default-secret';
  if (!password) return null;
  return createHmac('sha256', secret).update(password).digest('hex');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as { password?: string; action?: string };

  // Sign out
  if (body.action === 'sign-out') {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // No password configured → open access
  const expected = cookieToken();
  if (!expected) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, 'open', { httpOnly: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE, path: '/' });
    return res;
  }

  const submitted = typeof body.password === 'string'
    ? createHmac('sha256', process.env.COOKIE_SECRET ?? 'cb-default-secret').update(body.password).digest('hex')
    : null;

  if (submitted !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
