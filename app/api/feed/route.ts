import { NextResponse } from 'next/server';
import { getFeed } from '@/lib/procore';

// Tell Next.js this route is always dynamic (no static caching)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const feed = await getFeed();

    return NextResponse.json(feed, {
      headers: {
        'Cache-Control': 's-maxage=20, stale-while-revalidate=40',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstaProcore] Feed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
