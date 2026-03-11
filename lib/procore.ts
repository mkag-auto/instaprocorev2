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
// client_credentials: we request a fresh token whenever the cached one is
// about to expire. No refresh tokens, no Vercel API writes, nothing to rotate.

let memToken: { accessToken: string; expiresAt: number } | null = null;

async function getValidAccessToken(): Promise<string> {
  // Return cached token if it still has more than 60 seconds left
  if (memToken && memToken.expiresAt > Date.now() + 60_000) {
    return memToken.accessToken;
  }

  const clientId = process.env.PROCORE_CLIENT_ID;
  const clientSecret = process.env.PROCORE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'PROCORE_CLIENT_ID and PROCORE_CLIENT_SECRET must be set in environment variables.'
    );
  }

  console.log('[InstaProcore] Requesting new access token via client_credentials...');

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to obtain access token (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Procore returns expires_in in seconds; default to 2 hours if missing
  const expiresIn = data.expires_in ? data.expires_in * 1000 : 2 * 60 * 60 * 1000;
  memToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn,
  };

  console.log(
    `[InstaProcore] New token obtained, expires in ${Math.round(expiresIn / 60000)} minutes.`
  );
  return memToken.accessToken;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
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
  let projects: ProcoreProject[] = Array.isArray(data) ? data : [];

  // Sort by updated_at descending so most recently active projects come first
  projects.sort((a, b) => {
    const da = new Date(a.updated_at || 0).getTime();
    const db = new Date(b.updated_at || 0).getTime();
    return db - da;
  });

  // Cap at top 25 — image date filter handles the rest
  const PROJECT_CAP = 25;
  if (projects.length > PROJECT_CAP) {
    console.log(`[InstaProcore] Capping from ${projects.length} to top ${PROJECT_CAP} projects`);
    projects = projects.slice(0, PROJECT_CAP);
  }

  console.log(
    `[InstaProcore] Scanning ${projects.length} projects:`,
    projects.map((p) => p.name)
  );
  return projects;
}

// ─── Fetch images for ONE project ────────────────────────────────────────────

async function fetchImagesForProject(project: ProcoreProject): Promise<ProcoreImage[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const url = new URL(`${BASE_URL}/rest/v1.0/images`);
  url.searchParams.set('project_id', String(project.id));
  url.searchParams.set('company_id', COMPANY_ID);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('serializer_view', SERIALIZER_VIEW);
  // End date is exclusive — use tomorrow so today's photos are included
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
    const sample = images[0] as unknown as Record<string, unknown>;
    console.log(`[InstaProcore] Sample image fields from "${project.name}":`, {
      id: sample.id,
      created_at: sample.created_at,
      taken_at: sample.taken_at,
    });
  }

  // Stamp project info onto each image
  return images.map((img) => ({ ...img, project: { id: project.id, name: project.name } }));
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
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

  console.log(
    `[InstaProcore] Scanning ${projects.length} projects for images in last ${DAYS_BACK} days...`
  );

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

  console.log(`[InstaProcore] Total images found: ${allItems.length}`);
  console.log(
    `[InstaProcore] Top 5 after sort:`,
    allItems.slice(0, 5).map((i) => ({
      project: i.projectName,
      createdAt: i.createdAt,
      takenAt: i.takenAt,
    }))
  );

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      totalItems: allItems.length,
      projectsScanned: projects.length,
    },
    data: allItems,
  };
}
