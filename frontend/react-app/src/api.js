/**
 * Every call goes to the Java gateway, which decides whether Django or the C#
 * service answers. If the backend is not running the site still renders: each
 * request falls back to the seed content in src/data/fallback.js, so a fresh
 * checkout is never a blank page.
 */
import { FALLBACK } from './data/fallback.js';

const BASE = import.meta.env.VITE_API_BASE ?? '';
const TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Reads are cached for the length of the visit. Navigating between pages then
 * costs nothing, and the server sees one request per collection instead of one
 * per page view. Writes never touch this.
 */
const cache = new Map();
const CACHE_TTL_MS = 60_000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(BASE + path, {
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    const isJson = (response.headers.get('content-type') || '').includes('json');
    const payload = isJson ? await response.json() : null;
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || `Request failed (${response.status})`;
      throw new ApiError(detail, response.status);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a collection. A network or server failure is not fatal for a public
 * page — the seed content stands in and the caller is told it is offline.
 */
export async function load(key, path) {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const data = await request(path);
    const result = (Array.isArray(data) && data.length === 0 && FALLBACK[key]?.length)
      ? { data: FALLBACK[key], live: false, reason: 'empty' }
      : { data, live: true, reason: null };
    cache.set(path, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    // A failure is not cached — the next page view tries the server again.
    return { data: FALLBACK[key] ?? null, live: false, reason: error.message };
  }
}

/**
 * The site endpoint names its fields for the database, not for this app.
 * Translate them once, here, so no component has to know both spellings.
 */
function toSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    organizationName: raw.name,
    shortName: raw.shortName ?? raw.name,
    slogan: raw.slogan,
    establishedYear: raw.established,
    registrationNo: raw.registration,
    addressLine: raw.address,
    phone: raw.phone,
    email: raw.email,
    officeHours: raw.officeHours,
    introduction: raw.introduction,
    authority: raw.authority,
  };
}

export const api = {
  site: async () => {
    const result = await load('site', '/api/site');
    if (!result.live) return result;
    // Drop keys the API left empty so the seed values show through.
    const mapped = Object.fromEntries(
      Object.entries(toSite(result.data) ?? {}).filter(([, value]) => value != null && value !== ''),
    );
    return { ...result, data: mapped };
  },
  events: (scope = 'upcoming', limit = 12) =>
    load('events', `/api/events?scope=${encodeURIComponent(scope)}&limit=${limit}`),
  notices: (limit = 8) => load('notices', `/api/notices?limit=${limit}`),
  articles: (limit = 9) => load('articles', `/api/articles?limit=${limit}`),
  activities: () => load('activities', '/api/activities'),
  gallery: (limit = 24) => load('gallery', `/api/gallery?limit=${limit}`),
  team: () => load('team', '/api/team'),
  statistics: () => load('statistics', '/api/statistics'),

  /** The contact form is a write, so a failure here must be reported, not hidden. */
  sendEnquiry: (enquiry) =>
    request('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enquiry),
    }),
};

/** Media paths come back relative; make them absolute against the gateway. */
export function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return BASE + (path.startsWith('/') ? path : `/media/${path}`);
}
