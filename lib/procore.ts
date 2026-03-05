import { FeedItem } from './types';

const BASE_URL = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
const COMPANY_ID = process.env.PROCORE_COMPANY_ID!;
const DAYS_BACK = parseInt(process.env.DAYS_BACK || '14');
const PER_PAGE = parseInt(process.env.PER_PAGE || '100');
const PROJECTS_PER_PAGE = parseInt(process.env.PROJECTS_PER_PAGE || '300');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '6');
const MAX_PROJECTS = parseInt(process.env.MAX_PROJECTS || '0');
const SERIALIZER_VIEW = process.env.SERIALIZER_VIEW || 'mobile_feed';

// ─── In-memory token cache (survives within a warm serverless instance) ───────
let memToken: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

function getEnvTokens() {
  return {
    accessToken: process.env.PROCORE_ACCESS_TOKEN || '',
    refreshToken: process.env.PROCORE_REFRESH_TOKEN || '',
  };
}

/**
 * Attempt to update Vercel env vars with new tokens so the next cold start
 * picks them up. Requires VERCEL_TOKEN + VERCEL_PROJECT_ID env vars.
 * This is optional — if not configured, tokens are kept only in memory.
 */
async function persistTokensToVercel(accessToken: string, refreshToken: string) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!vercelToken || !projectId) {
    console.warn('[InstaProcore] VERCEL_TOKEN/VERCEL_PROJECT_ID not set — tokens stored in memory only. Will need manual refresh on cold start after token expiry.');
    return;
  }

  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  try {
    // Fetch current env vars to get IDs for PATCH
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );
    if (!listRes.ok) {
      console.error('[InstaProcore] Failed to list Vercel env vars:', listRes.status);
      return;
    }
    const { envs } = await listRes.json();

    for (const [key, value] of [
      ['PROCORE_ACCESS_TOKEN', accessToken],
      ['PROCORE_REFRESH_TOKEN', refreshToken],
    ] as [string, string][]) {
      const existing = envs.find((e: { key: string }) => e.key === key);
      if (existing) {
        const patchRes = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}${teamQuery}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ value, type: 'encrypted' }),
          }
        );
        if (!patchRes.ok) {
          console.error(`[InstaProcore] Failed to update ${key}:`, patchRes.status);
        } else {
          console.log(`[InstaProcore] Updated ${key} in Vercel`);
        }
      } else {
        console.warn(`[InstaProcore] Env var ${key} not found in Vercel project — skipping update`);
      }
    }
  } catch (err) {
    console.error('[InstaProcore] Vercel env update error:', err);
  }
}

async function doTokenRefresh(): Promise<string> {
  const { refreshToken } = memToken ?? getEnvTokens();
  if (!refreshToken) throw new Error('No refresh token available. Please re-authenticate at /api/auth');

  console.log('[InstaProcore] Refreshing Procore token...');

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.PROCORE_CLIENT_ID,
      client_secret: process.env.PROCORE_CLIENT_SECRET,
      redirect_uri: process.env.PROCORE_REDIRECT_URI,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const newAccess: string = data.access_token;
  const newRefresh: string = data.refresh_token;

  // Cache in memory
  memToken = {
    accessToken: newAccess,
    refreshToken: newRefresh,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000, // 23 hrs
  };

  // Persist to Vercel env vars (best-effort)
  persistTokensToVercel(newAccess, newRefresh).catch(() => {});

  return newAccess;
}

async function getValidAccessToken(): Promise<string> {
  // Use in-memory if not expired
  if (memToken && memToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return memToken.accessToken;
  }

  // Cold start: initialize from env vars
  const { accessToken, refreshToken } = getEnvTokens();
  if (accessToken) {
    memToken = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
    return accessToken;
  }

  throw new Error('PROCORE_ACCESS_TOKEN not configured. Visit /api/auth to authenticate.');
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();

  const makeRequest = (t: string) =>
    fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    });

  let res = await makeRequest(token);

  if (res.status === 401) {
    // Access token expired — refresh and retry once
    const newToken = await doTokenRefresh();
    res = await makeRequest(newToken);
  }

  return res;
}

// ─── Procore Data Types ────────────────────────────────────────────────────────

interface ProcoreProject {
  id: number;
  name: string;
  active: boolean;
}

interface ProcoreImage {
  id: number;
  filename: string;
  url: string;
  created_at: string;
  taken_at?: string;
  description?: string;
  location_name?: string;
  created_by?: { name?: string; login?: string };
  comments?: Array<{ id: number; body: string; created_at: string }>;
}

// ─── Procore API Calls ─────────────────────────────────────────────────────────

async function fetchProjects(): Promise<ProcoreProject[]> {
  const url =
    `${BASE_URL}/rest/v1.0/projects` +
    `?company_id=${COMPANY_ID}` +
    `&per_page=${PROJECTS_PER_PAGE}` +
    `&filters[status]=Active`;

  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchImagesForProject(projectId: number): Promise<ProcoreImage[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

  // Correct endpoint: top-level /images with project_id as query param (not nested under /projects)
  const url = new URL(`${BASE_URL}/rest/v1.0/images`);
  url.searchParams.set('project_id', String(projectId));
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('serializer_view', SERIALIZER_VIEW);
  url.searchParams.set('filters[created_at]', sinceStr);
  url.searchParams.set('sort', '-created_at'); // newest first

  const res = await fetchWithAuth(url.toString());

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[InstaProcore] Project ${projectId} images failed: ${res.status} — ${body.slice(0,200)}`);
    return [];
  }

  const data = await res.json();
  console.log(`[InstaProcore] Project ${projectId}: ${Array.isArray(data) ? data.length : 0} images`);
  return Array.isArray(data) ? data : [];
}

// ─── Normalization ─────────────────────────────────────────────────────────────

function normalizeImage(image: ProcoreImage, project: ProcoreProject): FeedItem {
  let commentText: string | null = null;

  if (image.comments && image.comments.length > 0) {
    const sorted = [...image.comments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    commentText = sorted[0]?.body?.trim() || null;
  }

  return {
    id: `${project.id}-${image.id}`,
    projectId: project.id,
    projectName: project.name,
    imageUrl: image.url,
    thumbnailUrl: null,
    takenAt: image.taken_at || null,
    createdAt: image.created_at || null,
    uploaderName: image.created_by?.name || null,
    locationName: image.location_name || null,
    description: image.description?.trim() || null,
    commentText,
  };
}

// ─── Concurrency Limiter ───────────────────────────────────────────────────────

async function runConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export async function getFeed() {
  let projects = await fetchProjects();

  if (MAX_PROJECTS > 0) {
    projects = projects.slice(0, MAX_PROJECTS);
  }

  const imageArrays = await runConcurrent(projects, CONCURRENCY, async (project) => {
    const images = await fetchImagesForProject(project.id);
    return images.map((img) => normalizeImage(img, project));
  });

  const allItems = imageArrays.flat();

  // Sort newest first (prefer takenAt, fall back to createdAt)
  allItems.sort((a, b) => {
    const da = new Date(a.takenAt || a.createdAt || 0).getTime();
    const db = new Date(b.takenAt || b.createdAt || 0).getTime();
    return db - da;
  });

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      totalItems: allItems.length,
      projectsScanned: projects.length,
    },
    data: allItems,
  };
}
