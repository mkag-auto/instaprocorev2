import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.FEED_SECRET;
const COOKIE = 'feed_auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  if (!SECRET) return NextResponse.next();

  const keyParam = req.nextUrl.searchParams.get('key');
  if (keyParam === SECRET) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE, SECRET, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return res;
  }

  const cookie = req.cookies.get(COOKIE);
  if (cookie?.value === SECRET) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
