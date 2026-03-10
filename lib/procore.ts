import { FeedItem } from './types';

const BASE_URL = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
const COMPANY_ID = process.env.PROCORE_COMPANY_ID!;
const DAYS_BACK = parseInt(process.env.DAYS_BACK || '14');
const PER_PAGE = parseInt(process.env.PER_PAGE || '100');
const PROJECTS_PER_PAGE = parseInt(process.env.PROJECTS_PER_PAGE || '300');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3');
const MAX_PROJECTS = parseInt(process.env.MAX_PROJECTS || '0');
const SERIALIZER_VIEW = process.env.SERIALIZER_VIEW || 'mobile_feed';

// ─── Token cache ──────────────────────────────────────────────────────────────
// Procore access tokens live for 2 hours. We keep a module-level cache so
// warm serverless instances don't re-read env vars on every request, and so
// that a refreshed token survives within an instance's lifetime.
// expiresAt of 0 means "unknown / use it but don't assume freshness"

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch; 0 = unknown age
}

let memToken: TokenCache | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Compute the OAuth redirect URI from env vars — no runtime mutation needed. */
function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = appUrl.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${appUrl}/api/auth/callback`;
}

function getEnvTokens(): { accessToken: string; refreshToken: string } {
  return {
    accessToken: process.env.PROCORE_ACCESS_TOKEN || '',
    refreshToken: process.env.PROCORE_REFRESH_TOKEN || '',
  };
}

// ─── Vercel env persistence ───────────────────────────────────────────────────
// Best-effort: writes refreshed tokens back to Vercel env vars so the next
// cold start picks them up. Requires VERCEL_TOKEN + VERCEL_PROJECT_ID.
// Fire-and-forget — failures are logged but never throw.

async function persistTokensToVercel(accessToken: string, refreshToken: string) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) {
    console.log('[InstaProcore] Skipping Vercel env update — VERCEL_TOKEN or VERCEL_PROJECT_ID not set');
    return;
  }
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  try {
    const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!listRes.ok) {
      console.warn('[InstaProcore] Vercel env list failed:', listRes.status);
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
          console.warn(`[InstaProcore] Failed to update ${key} in Vercel:`, patchRes.status);
        } else {
          console.log(`[InstaProcore] Persisted ${key} to Vercel env vars`);
        }
      }
    }
  } catch (err) {
    console.error('[InstaProcore] Vercel env update error:', err);
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────
// FIX: Compute redirect_uri directly rather than relying on
//   process.env.PROCORE_REDIRECT_URI which was set via runtime mutation in
//   app/api/auth/route.ts and does NOT survive across serverless invocations.
//
// FIX: For the refresh_token grant, redirect_uri is not required by Procore.
//   We only include it on non-localhost deployments where Procore may validate
//   it against the registered URI.

async function doTokenRefresh(): Promise<string> {
  const { refreshToken } = memToken ?? getEnvTokens();
  if (!refreshToken) {
    throw new Error('No refresh token available. Visit /api/auth to re-authenticate.');
  }

  console.log('[InstaProcore] Refreshing access token...');

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: process.env.PROCORE_CLIENT_ID || '',
    client_secret: process.env.PROCORE_CLIENT_SECRET || '',
    refresh_token: refreshToken,
  };

  const redirectUri = getRedirectUri();
  if (!redirectUri.includes('localhost')) {
    body.redirect_uri = redirectUri;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  // Cache with a 110-minute expiry (Procore tokens last 2 hours).
  // Proactively refresh before expiry rather than waiting for a 401.
  memToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + 6600 * 1000, // 110 min
  };

  console.log('[InstaProcore] Token refreshed successfully, expires in ~110 min');

  // Fire-and-forget: persist new tokens to Vercel env vars for next cold start
  persistTokensToVercel(data.access_token, memToken.refreshToken).catch(() => {});

  return data.access_token;
}

// ─── Get valid access token ───────────────────────────────────────────────────
// FIX: Old code stamped env tokens with a fake 23-hour expiry and never
//   proactively refreshed. Now we:
//   - Seed from env vars with expiresAt = 0 (unknown age)
//   - Proactively refresh when token is within 5 min of known expiry
//   - Fall through to 401 handling as a safety net for unknown-age tokens

async function getValidAccessToken(): Promise<string> {
  // Proactively refresh if token is within 5 minutes of expiry
  if (memToken && memToken.expiresAt > 0 && memToken.expiresAt - Date.now() < 5 * 60 * 1000) {
    console.log('[InstaProcore] Token expiring soon, proactively refreshing...');
    return doTokenRefresh();
  }

  // Return cached token if it's known-good
  if (memToken && (memToken.expiresAt === 0 || memToken.expiresAt > Date.now())) {
    return memToken.accessToken;
  }

  // No cache — seed from env vars with unknown age
  const { accessToken, refreshToken } = getEnvTokens();
  if (accessToken) {
    memToken = { accessToken, refreshToken, expiresAt: 0 };
    return accessToken;
  }

  throw new Error('PROCORE_ACCESS_TOKEN not configured. Visit /api/auth to authenticate.');
}

// ─── Authenticated fetch ──────────────────────────────────────────────────────

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();

  const makeRequest = (t: string) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
    });

  let res = await makeRequest(token);

  // Retry up to 3 times on 429 with exponential backoff: 2s, 4s, 8s
  for (let attempt = 1; attempt <= 3 && res.status === 429; attempt++) {
    const waitMs = Math.pow(2, attempt) * 1000;
    console.warn(`[InstaProcore] 429 rate limit — waiting ${waitMs}ms before retry ${attempt}/3`);
    await sleep(waitMs);
    res = await makeRequest(token);
  }

  if (res.status === 401) {
    console.log('[InstaProcore] 401 received — attempting token refresh...');
    try {
      const newToken = await doTokenRefresh();
      res = await makeRequest(newToken);
    } catch (refreshErr) {
      console.error('[InstaProcore] Token refresh failed:', refreshErr);
      throw new Error(
        `Procore authentication failed and token refresh could not recover. ` +
        `Visit /api/auth to re-authenticate. (${refreshErr instanceof Error ? refreshErr.message : refreshErr})`
      );
    }
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
  const url =
    `${BASE_URL}/rest/v1.0/projects` +
    `?company_id=${COMPANY_ID}` +
    `&per_page=${PROJECTS_PER_PAGE}` +
    `&filters[status]=Active`;

  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const projects: ProcoreProject[] = Array.isArray(data) ? data : [];

  // Sort by updated_at descending so most recently touched projects are first.
  // Note: Procore's project updated_at doesn't update when photos are added,
  // so we scan ALL projects — inactive ones return empty results cheaply.
  projects.sort((a, b) => {
    const da = new Date(a.updated_at || 0).getTime();
    const db = new Date(b.updated_at || 0).getTime();
    return db - da;
  });

  console.log(`[InstaProcore] Found ${projects.length} active projects — scanning all`);
  return projects;
}

// ─── Fetch images for one project ────────────────────────────────────────────

async function fetchImagesForProject(project: ProcoreProject): Promise<ProcoreImage[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString().split('T')[0];

  // End date is exclusive in Procore's filter, so use tomorrow to include today
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const url = new URL(`${BASE_URL}/rest/v1.0/images`);
  url.searchParams.set('project_id', String(project.id));
  url.searchParams.set('company_id', COMPANY_ID);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('serializer_view', SERIALIZER_VIEW);
  url.searchParams.set('filters[created_at]', `${sinceStr}...${tomorrowStr}`);

  const res = await fetchWithAuth(url.toString());

  if (!res.ok) {
    const body = await res.text();
    console.warn(
      `[InstaProcore] Project "${project.name}" (${project.id}) failed: ${res.status} — ${body.slice(0, 150)}`
    );
    return [];
  }

  const data = await res.json();
  const images: ProcoreImage[] = Array.isArray(data) ? data : [];

  if (images.length > 0) {
    console.log(`[InstaProcore] "${project.name}" — ${images.length} image(s)`);
  }

  return images.map((img) => ({ ...img, project: { id: project.id, name: project.name } }));
}

// ─── Concurrency limiter with stagger ────────────────────────────────────────
// Each worker pauses 150ms between requests to stay well under Procore's
// rate limit even when scanning all 88+ projects.
// At concurrency=3 + 150ms stagger: 88 projects takes ~4-5 seconds total,
// well within Vercel's 30s function timeout.

async function runConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
      await sleep(150); // stagger requests to avoid rate limiting
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizeImage(image: ProcoreImage, projectName: string): FeedItem {
  let commentText: string | null = null;
  if (image.comments && image.comments.length > 0) {
    const sorted = [...image.comments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
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
    .map((img) => normalizeImage(img, img.project?.name ?? 'Unknown Project'));

  // Sort by upload date newest first
  allItems.sort((a, b) => {
    const da = new Date(a.createdAt || a.takenAt || 0).getTime();
    const db = new Date(b.createdAt || b.takenAt || 0).getTime();
    return db - da;
  });

  console.log(`[InstaProcore] Total images found: ${allItems.length} across ${projects.length} projects`);

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      totalItems: allItems.length,
      projectsScanned: projects.length,
    },
    data: allItems,
  };
}
