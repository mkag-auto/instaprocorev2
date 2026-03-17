import { NextRequest, NextResponse } from 'next/server';

// Called by Vercel Cron every hour to proactively refresh tokens.
// Protected by a shared secret so it can't be triggered by random callers.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const BASE_URL = process.env.PROCORE_BASE_URL || 'https://api.procore.com';

  // Read the LATEST refresh token from Vercel's env API, NOT process.env.
  // Why: procore.ts may have rotated the token from a warm container and
  // persisted the new one to Vercel env vars. process.env in THIS container
  // could still hold the old (consumed) token from its last cold start.
  const liveTokens = await getLatestTokensFromVercel();
  const refreshToken = liveTokens?.refreshToken || process.env.PROCORE_REFRESH_TOKEN;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token configured' }, { status: 500 });
  }

  console.log('[InstaProcore] Cron refresh starting...',
    liveTokens ? '(using token from Vercel API)' : '(using process.env fallback)');

  // NOTE: redirect_uri must NOT be included in refresh_token grants.
  // Procore only accepts it during the initial authorization_code exchange.
  // Including it here causes "invalid_grant" errors.
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: process.env.PROCORE_CLIENT_ID || '',
    client_secret: process.env.PROCORE_CLIENT_SECRET || '',
    refresh_token: refreshToken,
  };

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

  // Persist new tokens back to Vercel env vars
  await persistToVercel(data.access_token, data.refresh_token || refreshToken);

  console.log('[InstaProcore] Cron token refresh successful');
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}

// Fetch the current PROCORE_REFRESH_TOKEN value from Vercel's env API
// so we always use the latest token, not a stale process.env value.
async function getLatestTokensFromVercel(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) return null;

  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  try {
    const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!listRes.ok) {
      console.warn('[InstaProcore] Could not read Vercel env vars:', listRes.status);
      return null;
    }
    const { envs } = await listRes.json();

    let accessToken = '';
    let refreshToken = '';
    for (const env of envs) {
      // Vercel env API returns decrypted values when using a valid VERCEL_TOKEN
      if (env.key === 'PROCORE_ACCESS_TOKEN' && env.value) accessToken = env.value;
      if (env.key === 'PROCORE_REFRESH_TOKEN' && env.value) refreshToken = env.value;
    }

    if (refreshToken) {
      console.log('[InstaProcore] Read live tokens from Vercel API');
      return { accessToken, refreshToken };
    }
    return null;
  } catch (err) {
    console.warn('[InstaProcore] Failed to read Vercel env vars:', err);
    return null;
  }
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
