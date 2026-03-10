import { NextRequest, NextResponse } from 'next/server';

// Called by Vercel Cron every hour to proactively refresh tokens.
// Protected by a shared secret so it can't be triggered by random callers.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const BASE_URL = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
  const refreshToken = process.env.PROCORE_REFRESH_TOKEN;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token configured' }, { status: 500 });
  }

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: process.env.PROCORE_CLIENT_ID || '',
    client_secret: process.env.PROCORE_CLIENT_SECRET || '',
    refresh_token: refreshToken,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  if (appUrl && !appUrl.includes('localhost')) {
    body.redirect_uri = `https://${appUrl}/api/auth/callback`;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[InstaProcore] Cron refresh failed:', res.status, text);
    return NextResponse.json({ error: `Refresh failed: ${res.status}` }, { status: 500 });
  }

  const data = await res.json();

  // Persist back to Vercel env vars
  await persistToVercel(data.access_token, data.refresh_token || refreshToken);

  console.log('[InstaProcore] Cron token refresh successful');
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}

async function persistToVercel(accessToken: string, refreshToken: string) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) {
    console.warn('[InstaProcore] Cannot persist — VERCEL_TOKEN or VERCEL_PROJECT_ID missing');
    return;
  }
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (!listRes.ok) return;
  const { envs } = await listRes.json();

  for (const [key, value] of [
    ['PROCORE_ACCESS_TOKEN', accessToken],
    ['PROCORE_REFRESH_TOKEN', refreshToken],
  ] as [string, string][]) {
    const existing = envs.find((e: { key: string }) => e.key === key);
    if (existing) {
      await fetch(`https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}${teamQuery}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type: 'encrypted' }),
      });
    }
  }
  console.log('[InstaProcore] Tokens persisted to Vercel env vars');
}
