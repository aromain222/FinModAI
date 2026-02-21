import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Redirect /demo to /request-demo at the edge so cached /demo never serves old content
  if (req.nextUrl.pathname === '/demo') {
    const url = req.nextUrl.clone();
    url.pathname = '/request-demo';
    return NextResponse.redirect(url, 307);
  }

  // TEMP: Log pathname and cookies for debugging login redirects
  if (process.env.NODE_ENV === 'development') {
    console.log('[MIDDLEWARE] Pathname:', req.nextUrl.pathname);
    console.log('[MIDDLEWARE] Cookies:', {
      cb_guest: req.cookies.get('cb_guest')?.value,
    });
  }

  return NextResponse.next();
}

// If you later want to scope middleware to certain routes, uncomment and adjust:
// export const config = {
//   matcher: ['/dashboard/:path*', '/chat/:path*'],
// };

