/** Backend client.
 *
 * The app is designed to work with *or without* a server:
 *   - hosted with the FastAPI backend  → full multi-user sync, dashboards, export
 *   - dropped on static hosting alone  → device-only mode, everything stored locally
 *
 * The base URL is resolved at runtime (not baked in at build time) so the same
 * `dist/` folder can be uploaded anywhere and pointed at any API host from the
 * Profile screen.
 */

import type {
  AnalyticsSummary,
  AuditEntry,
  Household,
  Role,
  User,
  Zone,
} from './types';
import { appBasePath } from './utils';

const API_BASE_KEY = 'census:apiBase';
const TOKEN_KEY = 'census:token';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export class OfflineError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'OfflineError';
  }
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode — settings simply do not persist */
  }
}

/** Trailing-slash-free base, e.g. `https://census.example.in` or `` (same origin). */
export function getApiBase(): string {
  const override = readStored(API_BASE_KEY);
  if (override !== null) return override.replace(/\/+$/, '');
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return '';
}

export function setApiBase(base: string | null): void {
  if (base === null) writeStored(API_BASE_KEY, null);
  else writeStored(API_BASE_KEY, base.trim().replace(/\/+$/, ''));
}

/** Absolute URL for an API path, honouring the configured base. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  if (base) return `${base}${suffix}`;

  // Same origin: resolve against the directory the app is served from. Hosting
  // the app at /census/ then means /census/api/... rather than /api/..., so a
  // subfolder install never accidentally talks to a different application
  // sitting at the domain root.
  const dir = appBasePath();
  return dir === '/' ? suffix : `${dir.replace(/\/$/, '')}${suffix}`;
}

export function getToken(): string | null {
  return readStored(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  writeStored(TOKEN_KEY, token);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Abort after this many milliseconds (default 15s; field networks are slow). */
  timeoutMs?: number;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15000, auth = true } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OfflineError('Request timed out');
    }
    throw new OfflineError(error instanceof Error ? error.message : 'Network request failed');
  }
  clearTimeout(timer);

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in (payload as Record<string, unknown>)
        ? (payload as Record<string, unknown>).detail
        : payload;
    const message =
      typeof detail === 'string' ? detail : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, detail);
  }

  return payload as T;
}

/* ------------------------------------------------------------------ */
/* Health & capability discovery                                       */
/* ------------------------------------------------------------------ */

export interface HealthInfo {
  status: string;
  version: string;
  database: 'mongodb' | 'embedded';
  smsEnabled: boolean;
  aiEnabled: boolean;
  serverTime: string;
}

export async function health(timeoutMs = 6000): Promise<HealthInfo> {
  return request<HealthInfo>('/api/health', { auth: false, timeoutMs });
}

/** Probe the backend without throwing — used to pick online vs device-only mode. */
export async function probeBackend(): Promise<HealthInfo | null> {
  try {
    return await health();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export interface OtpChallenge {
  requestId: string;
  expiresInSeconds: number;
  /** Present only when SMS delivery is not configured (development mode). */
  devOtp?: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export async function requestOtp(mobile: string, role: Role): Promise<OtpChallenge> {
  return request<OtpChallenge>('/api/auth/otp/request', {
    method: 'POST',
    body: { mobile, role },
    auth: false,
  });
}

export async function verifyOtp(params: {
  requestId: string;
  mobile: string;
  otp: string;
  name?: string;
  role: Role;
}): Promise<AuthResult> {
  return request<AuthResult>('/api/auth/otp/verify', {
    method: 'POST',
    body: params,
    auth: false,
  });
}

export async function adminLogin(password: string): Promise<AuthResult> {
  return request<AuthResult>('/api/auth/admin/login', {
    method: 'POST',
    body: { password },
    auth: false,
  });
}

export async function currentUser(): Promise<User> {
  return request<User>('/api/auth/me');
}

/* ------------------------------------------------------------------ */
/* Households & sync                                                   */
/* ------------------------------------------------------------------ */

export interface SyncPushResult {
  id: string;
  rev: number;
  status: 'accepted' | 'conflict' | 'rejected';
  message?: string;
  household?: Household;
}

export async function pushHouseholds(households: Household[]): Promise<SyncPushResult[]> {
  const payload = await request<{ results: SyncPushResult[] }>('/api/sync/push', {
    method: 'POST',
    body: { households },
    timeoutMs: 60000,
  });
  return payload.results;
}

export interface PullResult {
  households: Household[];
  zones: Zone[];
  users: User[];
  serverTime: string;
}

export async function pullChanges(since?: string): Promise<PullResult> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<PullResult>(`/api/sync/pull${query}`, { timeoutMs: 60000 });
}

export async function listHouseholds(params: {
  status?: string;
  zoneId?: string;
  enumeratorId?: string;
  limit?: number;
} = {}): Promise<Household[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.zoneId) search.set('zone_id', params.zoneId);
  if (params.enumeratorId) search.set('enumerator_id', params.enumeratorId);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const payload = await request<{ households: Household[] }>(
    `/api/households${query ? `?${query}` : ''}`,
  );
  return payload.households;
}

export async function reviewHousehold(
  id: string,
  action: 'approved' | 'flagged' | 'comment' | 'reopened',
  text: string,
): Promise<Household> {
  return request<Household>(`/api/households/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: { action, text },
  });
}

export async function lookupAcknowledgement(code: string): Promise<Household> {
  return request<Household>(`/api/households/acknowledgement/${encodeURIComponent(code)}`, {
    auth: false,
  });
}

/* ------------------------------------------------------------------ */
/* Zones, users, analytics, export, audit (supervisor / admin)         */
/* ------------------------------------------------------------------ */

export async function listZones(): Promise<Zone[]> {
  const payload = await request<{ zones: Zone[] }>('/api/zones');
  return payload.zones;
}

export async function saveZone(zone: Partial<Zone> & { id?: string }): Promise<Zone> {
  if (zone.id) {
    return request<Zone>(`/api/zones/${encodeURIComponent(zone.id)}`, {
      method: 'PATCH',
      body: zone,
    });
  }
  return request<Zone>('/api/zones', { method: 'POST', body: zone });
}

export async function deleteZone(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/zones/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listUsers(): Promise<User[]> {
  const payload = await request<{ users: User[] }>('/api/users');
  return payload.users;
}

export async function saveUser(user: Partial<User> & { id?: string }): Promise<User> {
  if (user.id) {
    return request<User>(`/api/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: user,
    });
  }
  return request<User>('/api/users', { method: 'POST', body: user });
}

export async function deleteUser(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function analytics(zoneId?: string): Promise<AnalyticsSummary> {
  const query = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : '';
  return request<AnalyticsSummary>(`/api/analytics/summary${query}`);
}

export async function auditLog(limit = 200): Promise<AuditEntry[]> {
  const payload = await request<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`);
  return payload.entries;
}

/** Server-side export URL (includes the bearer token as a query param). */
export function exportUrl(format: 'csv' | 'json', scope: 'households' | 'members'): string {
  const token = getToken() ?? '';
  const search = new URLSearchParams({ format, scope });
  if (token) search.set('token', token);
  return apiUrl(`/api/export?${search.toString()}`);
}

/* ------------------------------------------------------------------ */
/* Optional AI assistance                                              */
/* ------------------------------------------------------------------ */

export interface AiValidationIssue {
  memberId?: string;
  field?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export async function aiValidate(household: Household): Promise<AiValidationIssue[]> {
  const payload = await request<{ issues: AiValidationIssue[] }>('/api/ai/validate', {
    method: 'POST',
    body: { household },
    timeoutMs: 30000,
  });
  return payload.issues;
}

export async function aiTranslate(
  text: string,
  targetLanguage: string,
): Promise<{ text: string; provider: string }> {
  return request<{ text: string; provider: string }>('/api/ai/translate', {
    method: 'POST',
    body: { text, targetLanguage },
    timeoutMs: 30000,
  });
}
