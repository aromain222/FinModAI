import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // TEMP: Log pathname and cookies for debugging login redirects
  if (process.env.NODE_ENV === 'development') {
    console.log('[MIDDLEWARE] Pathname:', req.nextUrl.pathname);
    console.log('[MIDDLEWARE] Cookies:', {
      cb_guest: req.cookies.get('cb_guest')?.value,
      // Add any other auth-related cookies here
    });
  }
  
  // Simple pass-through middleware; route protection is handled in server components.
  return NextResponse.next();
}

// If you later want to scope middleware to certain routes, uncomment and adjust:
// export const config = {
//   matcher: ['/dashboard/:path*', '/chat/:path*'],
// };

