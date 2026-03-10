import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractSubdomain, getSubdomainPath, shouldBypassSubdomainRouting } from '@/lib/subdomains';

export function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const pathname = req.nextUrl.pathname;

  if (process.env.NODE_ENV === 'development') {
    console.log('[MIDDLEWARE] Host:', host);
    console.log('[MIDDLEWARE] Pathname:', pathname);
    console.log('[MIDDLEWARE] Cookies:', { cb_guest: req.cookies.get('cb_guest')?.value });
  }

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
