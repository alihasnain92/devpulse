import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy Routing Convention
 *
 * NOTE: Proxy redirects are strictly for UX routing (e.g. redirecting unauthenticated
 * users from protected UI routes). API authentication and authorization are strictly
 * enforced on every endpoint by the NestJS backend.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('devpulse_access_token')?.value;

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/monitors') || pathname.startsWith('/incidents');

  // UX navigation: unauthenticated users accessing dashboard routes get redirected to login
  if (isDashboardRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // UX navigation: authenticated users accessing login/register get redirected to dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
