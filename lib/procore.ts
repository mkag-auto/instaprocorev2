import { FeedItem } from './types';

const BASE_URL = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
const COMPANY_ID = process.env.PROCORE_COMPANY_ID!;
const DAYS_BACK = parseInt(process.env.DAYS_BACK || '14');
const PER_PAGE = parseInt(process.env.PER_PAGE || '100');
const PROJECTS_PER_PAGE = parseInt(process.env.PROJECTS_PER_PAGE || '300');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3');
const MAX_PROJECTS = parseInt(process.env.MAX_PROJECTS || '0');
const SERIALIZER_VIEW = process.env.SERIALIZER_VIEW || 'mobile_feed';

// ─── In-memory token cache ────────────────────────────────────────────────────
let memToken: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

// ─── Refresh lock ─────────────────────────────────────────────────────────────
// Prevents multiple concurrent 401 responses from each triggering separate
// refresh requests. Procore uses rotating refresh tokens — the first refresh
// consumes the old token, so a second concurrent refresh would get "invalid_grant".
let refreshInFlight: Promise<string> | null = null;

function getEnvTokens() {
  return {
    accessToken: process.env.PROCORE_ACCESS_TOKEN || '',
    refreshToken: process.env.PROCORE_REFRESH_TOKEN || '',
  };
}

async function persistTokensToVercel(accessToken: string, refreshToken: string) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) return;
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  try {
    const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!listRes.ok) return;
    const { envs } = await listRes.json();
    for (const [key, value] of [['PROCORE_ACCESS_TOKEN', accessToken], ['PROCORE_REFRESH_TOKEN', refreshToken]] as [string, string][]) {
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
  } catch (err) {
    console.error('[InstaProcore] Vercel env update error:', err);
  }
}

async function _doTokenRefreshInternal(): Promise<string> {
  const { refreshToken } = memToken ?? getEnvTokens();
  if (!refreshToken) throw new Error('No refresh token. Visit /api/auth to authenticate.');

  console.log('[InstaProcore] Refreshing access token...');

  // NOTE: redirect_uri must NOT be included in refresh_token grants.
  // Procore only accepts it during the initial authorization_code exchange.
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.PROCORE_CLIENT_ID,
      client_secret: process.env.PROCORE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[InstaProcore] Token refresh failed:', res.status, errText);
    // Clear memToken so next request re-reads env vars (cron may have updated them)
    memToken = null;
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  memToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Procore tokens last ~2 hours; set slightly under to trigger proactive refresh
    expiresAt: Date.now() + 110 * 60 * 1000,
  };

  console.log('[InstaProcore] Token refresh successful, persisting to Vercel...');
  persistTokensToVercel(data.access_token, data.refresh_token).catch(() => {});

  return data.access_token;
}

// Locked wrapper: only one refresh can happen at a time.
// If a refresh is already in flight, all callers await the same promise.
async function doTokenRefresh(): Promise<string> {
  if (refreshInFlight) {
    console.log('[InstaProcore] Refresh already in flight, waiting...');
    return refreshInFlight;
  }

  refreshInFlight = _doTokenRefreshInternal().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function getValidAccessToken(): Promise<string> {
  // If we have a cached token that isn't close to expiring, use it
  if (memToken && memToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return memToken.accessToken;
  }

  // Cold start: read from env vars. These are updated by cron or prior refreshes.
  // Use a conservative 2-hour expiry — if the token was refreshed by cron an hour ago,
  // it's still valid. If it's stale, the 401 handler in fetchWithAuth will refresh it.
  const { accessToken, refreshToken } = getEnvTokens();
  if (accessToken) {
    memToken = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    return accessToken;
  }

  throw new Error('PROCORE_ACCESS_TOKEN not configured. Visit /api/auth to authenticate.');
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  const makeRequest = (t: string) =>
    fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });

  let res = await makeRequest(token);

  if (res.status === 401) {
    console.log('[InstaProcore] Got 401, triggering token refresh...');
    const newToken = await doTokenRefresh();
    res = await makeRequest(newToken);
  }

  return res;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcoreProject {
  id: number;
  name: string;
  active: boolean;
  updated_at?: string;
}

interface ProcoreImage {
  id: number;
  filename: string;
  url: string;
  thumbnail_url?: string;
  created_at: string;
  updated_at?: string;
  taken_at?: string;
  description?: string;
  location?: { id: number; name: string };
  project?: { id: number; name: string };
  uploader?: { id?: number; name?: string; login?: string };
  created_by?: { name?: string; login?: string };
  comments?: Array<{ id: number; body: string; created_at: string }>;
}

// ─── Fetch projects ───────────────────────────────────────────────────────────

async function fetchProjects(): Promise<ProcoreProject[]> {
  // Fetch ALL active projects — we can't filter by photo activity since
  // Procore's project updated_at doesn't reflect photo uploads
  const url =
    `${BASE_URL}/rest/v1.0/projects` +
    `?company_id=${COMPANY_ID}` +
    `&per_page=${PROJECTS_PER_PAGE}` +
    `&filters[status]=Active`;

  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let projects: ProcoreProject[] = Array.isArray(data) ? data : [];

  // Sort by updated_at descending so most active projects are first
  projects.sort((a, b) => {
    const da = new Date(a.updated_at || 0).getTime();
    const db = new Date(b.updated_at || 0).getTime();
    return db - da;
  });

  console.log(`[InstaProcore] Scanning all ${projects.length} projects:`, projects.map(p => p.name));
  return projects;
}

// ─── Fetch images for ONE project (14-day filter) ─────────────────────────────

async function fetchImagesForProject(project: ProcoreProject): Promise<ProcoreImage[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString().split('T')[0];

  const url = new URL(`${BASE_URL}/rest/v1.0/images`);
  url.searchParams.set('project_id', String(project.id));
  url.searchParams.set('company_id', COMPANY_ID);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('serializer_view', SERIALIZER_VIEW);
  // Procore requires created_at as a range: "YYYY-MM-DD...YYYY-MM-DD"
  // Use tomorrow as end date — Procore treats end date as exclusive so today's photos get cut off
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  url.searchParams.set('filters[created_at]', `${sinceStr}...${tomorrowStr}`);
  // sort param removed — Procore may not support it, JS sort handles ordering

  const res = await fetchWithAuth(url.toString());

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[InstaProcore] Project "${project.name}" (${project.id}) failed: ${res.status} — ${body.slice(0, 150)}`);
    return [];
  }

  const data = await res.json();
  const images: ProcoreImage[] = Array.isArray(data) ? data : [];

  // Debug: log first image's raw date fields so we can verify field names
  if (images.length > 0) {
    const sample = images[0] as unknown as Record<string, unknown>;
    console.log(`[InstaProcore] Sample image fields from "${project.name}":`, {
      id: sample.id,
      created_at: sample.created_at,
      taken_at: sample.taken_at,
      uploaded_at: sample.uploaded_at,
      date: sample.date,
    });
  }

  // Stamp project info onto each image since we know it
  return images.map(img => ({ ...img, project: { id: project.id, name: project.name } }));
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

async function runConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
      await new Promise(res => setTimeout(res, 200));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizeImage(image: ProcoreImage, projectName: string): FeedItem {
  let commentText: string | null = null;
  if (image.comments && image.comments.length > 0) {
    const sorted = [...image.comments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    commentText = sorted[0]?.body?.trim() || null;
  }
  return {
    id: `${image.project?.id ?? 0}-${image.id}`,
    projectId: image.project?.id ?? 0,
    projectName: image.project?.name ?? projectName,
    imageUrl: image.url,
    thumbnailUrl: image.thumbnail_url || null,
    takenAt: image.taken_at || null,
    createdAt: image.created_at || null,
    uploaderName: image.uploader?.name || image.created_by?.name || null,
    locationName: image.location?.name || null,
    description: image.description?.trim() || null,
    commentText,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getFeed() {
  let projects = await fetchProjects();
  if (MAX_PROJECTS > 0) projects = projects.slice(0, MAX_PROJECTS);

  console.log(`[InstaProcore] Scanning ${projects.length} projects for images in last ${DAYS_BACK} days...`);

  const imageArrays = await runConcurrent(projects, CONCURRENCY, (project) =>
    fetchImagesForProject(project)
  );

  const allItems = imageArrays
    .flat()
    .map(img => normalizeImage(img, img.project?.name ?? 'Unknown Project'));

  // Sort by upload date (createdAt) newest first so today's uploads always appear at the top
  // takenAt can be weeks old even if uploaded today, so we don't use it for sorting
  allItems.sort((a, b) => {
    const da = new Date(a.createdAt || a.takenAt || 0).getTime();
    const db = new Date(b.createdAt || b.takenAt || 0).getTime();
    return db - da;
  });

  // Debug: show first 5 items after sort to verify ordering
  console.log(`[InstaProcore] Total images found: ${allItems.length}`);
  console.log(`[InstaProcore] Top 5 after sort:`, allItems.slice(0, 5).map(i => ({
    project: i.projectName,
    createdAt: i.createdAt,
    takenAt: i.takenAt,
  })));

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      totalItems: allItems.length,
      projectsScanned: projects.length,
    },
    data: allItems,
  };
}
