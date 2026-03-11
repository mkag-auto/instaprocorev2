import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const imageUrl = req.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  // Only proxy Procore-origin images
  if (!imageUrl.includes('procore.com') && !imageUrl.includes('procorecdn.com')) {
    return NextResponse.json({ error: 'Invalid image origin' }, { status: 403 });
  }

  const token = process.env.PROCORE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'No access token' }, { status: 500 });
  }

  try {
    // HEAD request only — just check if the URL is still valid
    const check = await fetch(imageUrl, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
    });

    // If valid (2xx or 3xx redirect), send browser directly to Procore CDN
    // This means ZERO image bytes flow through Vercel
    if (check.status < 400) {
      return NextResponse.redirect(imageUrl, {
        status: 302,
        headers: {
          // Cache the redirect for 1 hour so repeat loads skip Vercel entirely
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // URL has expired — return 404 so FeedClient can fall back gracefully
    return NextResponse.json({ error: `Image expired (${check.status})` }, { status: 404 });

  } catch (err) {
    console.error('[InstaProcore] Image redirect error:', err);
    return NextResponse.json({ error: 'Proxy redirect failed' }, { status: 500 });
  }
}
