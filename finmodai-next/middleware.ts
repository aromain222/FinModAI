import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractSubdomain, getSubdomainPath, shouldBypassSubdomainRouting } from '@/lib/subdomains';

const PUBLIC_PATHS = ['/login', '/api/auth/password'];
const STATIC_PREFIXES = ['/_next', '/favicon.ico', '/api/rank/cron', '/api/pm/brief', '/api/pm/monitor-cron'];

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cookieToken(): Promise<string | null> {
  const password = process.env.ACCESS_PASSWORD;
  const secret   = process.env.COOKIE_SECRET ?? 'cb-default-secret';
  if (!password) return null;
  return hmacHex(secret, password);
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const expected = await cookieToken();
  if (!expected) return true; // no password set → open access (dev mode)
  return req.cookies.get('cb_access')?.value === expected;
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return true;
  if (STATIC_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const pathname = req.nextUrl.pathname;

  // Password gate — skip for public paths and static assets
  if (!isPublicPath(pathname) && !(await isAuthenticated(req))) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?from=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Subdomain routing (existing behaviour)
  if (!shouldBypassSubdomainRouting(pathname)) {
    const subdomain = extractSubdomain(host);
    const basePath = getSubdomainPath(subdomain);
    if (basePath && basePath !== '/' && !pathname.startsWith(`${basePath}/`) && pathname !== basePath) {
      const url = req.nextUrl.clone();
      url.pathname = pathname === '/' ? basePath : `${basePath}${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
