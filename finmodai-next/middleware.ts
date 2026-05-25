import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { extractSubdomain, getSubdomainPath, shouldBypassSubdomainRouting } from '@/lib/subdomains';

const PUBLIC_PATHS = ['/login', '/api/auth/password'];
const STATIC_PREFIXES = ['/_next', '/favicon.ico', '/api/rank/cron', '/api/pm/brief', '/api/pm/monitor-cron'];

function cookieToken(): string | null {
  const password = process.env.ACCESS_PASSWORD;
  const secret   = process.env.COOKIE_SECRET ?? 'cb-default-secret';
  if (!password) return null;
  return createHmac('sha256', secret).update(password).digest('hex');
}

function isAuthenticated(req: NextRequest): boolean {
  const expected = cookieToken();
  if (!expected) return true; // no password set → open access (dev mode)
  return req.cookies.get('cb_access')?.value === expected;
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return true;
  if (STATIC_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const pathname = req.nextUrl.pathname;

  // Password gate — skip for public paths and static assets
  if (!isPublicPath(pathname) && !isAuthenticated(req)) {
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
