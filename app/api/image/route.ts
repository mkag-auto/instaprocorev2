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
    const upstream = await fetch(imageUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      // Don't follow redirects blindly — some CDN URLs don't need auth
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[InstaProcore] Image proxy error:', err);
    return NextResponse.json({ error: 'Proxy fetch failed' }, { status: 500 });
  }
}
