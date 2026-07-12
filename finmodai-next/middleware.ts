import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { extractSubdomain, getSubdomainPath, shouldBypassSubdomainRouting } from '@/lib/subdomains';
import { expectedAccessSessionToken } from '@/lib/auth/accessSession';
import { authorizePMMutationRequest, isPMMutationRequest } from '@/lib/pm/api/mutationAuth';

const PUBLIC_PATHS = ['/login', '/api'];
const STATIC_PREFIXES = ['/_next', '/favicon.ico'];

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const expected = await expectedAccessSessionToken();
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
  const response = NextResponse.next();

  if (isPMMutationRequest(req)) {
    let auth = await authorizePMMutationRequest(req);
    if (!auth.authorized) {
      try {
        const supabase = createMiddlewareClient({ req, res: response });
        const { data } = await supabase.auth.getUser();
        auth = await authorizePMMutationRequest(req, { userSessionAuthenticated: Boolean(data.user) });
      } catch {
        // Missing Supabase config or an unavailable auth service is not authorization.
      }
    }
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'PM write access requires a valid session or bearer secret.' },
        { status: 401 },
      );
    }
  }

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

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
