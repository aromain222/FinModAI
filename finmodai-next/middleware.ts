import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[MIDDLEWARE] Pathname:', req.nextUrl.pathname);
    console.log('[MIDDLEWARE] Cookies:', { cb_guest: req.cookies.get('cb_guest')?.value });
  }
  return NextResponse.next();
}

// If you later want to scope middleware to certain routes, uncomment and adjust:
// export const config = {
//   matcher: ['/dashboard/:path*', '/chat/:path*'],
// };

