import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.FEED_SECRET;
const COOKIE = 'feed_auth';

export function middleware(req: NextRequest) {
  // Never protect API routes or login page
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // If no secret is configured, allow everything through
  if (!SECRET) return NextResponse.next();

  // Check for ?key=... in URL (DAKboard usage)
  const keyParam = req.nextUrl.searchParams.get('key');
  if (keyParam === SECRET) {
    // Valid key — set cookie and redirect to clean URL (strip ?key from URL)
    const cleanUrl = new URL(req.nextUrl.pathname, req.url);
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set(COOKIE, SECRET, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    return res;
  }

  // Check cookie
  const cookie = req.cookies.get(COOKIE);
  if (cookie?.value === SECRET) {
    return NextResponse.next();
  }

  // No valid auth — redirect to login
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
