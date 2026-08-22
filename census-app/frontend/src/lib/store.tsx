/** Application state.
 *
 * One provider holds everything the screens need: session, language, the local
 * household cache, connectivity and the sync engine. Data always lands in
 * IndexedDB first — the network is treated as an optimisation, never a
 * requirement.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as api from './api';
import * as db from './db';
import { DEFAULT_LANGUAGE, detectLanguage, isLanguageCode, languageMeta, translate } from '../i18n';
import type { TranslateValues } from '../i18n';
import { blankHousehold, shouldQueueForSync } from './household';
import { validateHousehold } from './validation';
import type {
  Household,
  LanguageCode,
  Notice,
  OutboxItem,
  Role,
  Session,
  User,
  Zone,
} from './types';
import { nowIso, shortCode, uuid } from './utils';

export const APP_VERSION = '1.0.0';

/* Salted digest of the administrator password, used only when the app runs
 * without a backend. With a server present the password never leaves the
 * browser as anything but a POST body and is verified against a PBKDF2 hash
 * server-side. Device-only mode stores nothing sensitive, so this gate is a
 * convenience lock rather than a security boundary — see docs/SECURITY.md. */
export const ADMIN_HASH_SALT = 'india-census-2026';
export const ADMIN_PASSWORD_DIGEST =
  '1f0411e3725e578758a7ff1eb6b6425625d4b32e78fa9c0cd39f5023a6130402';

/** Upper bound on pages followed in one sync, so a pull can never run away. */
const MAX_PULL_PAGES = 20;

const META_LANGUAGE = 'language';
const META_SESSION = 'session';
const META_LAST_SYNC = 'lastSyncAt';
const META_ZONES = 'zones';
const META_USERS = 'users';
const META_NOTICES = 'notices';

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface SyncOutcome {
  sent: number;
  received: number;
  conflicts: number;
  failed: number;
  skipped?: 'offline' | 'device-only' | 'empty' | 'busy';
}

interface AppContextValue {
  ready: boolean;
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string, values?: TranslateValues) => string;
  locale: string;

  session: Session | null;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;

  households: Household[];
  zones: Zone[];
  users: User[];
  /** Announcements from the administrator, cached so they show offline. */
  notices: Notice[];
  setZones: (zones: Zone[]) => void;
  setUsers: (users: User[]) => void;
  setNotices: (notices: Notice[]) => void;
  refreshNotices: () => Promise<void>;

  getHousehold: (id: string) => Household | undefined;
  saveHousehold: (household: Household, options?: { queue?: boolean }) => Promise<Household>;
  submitHousehold: (household: Household) => Promise<Household>;
  deleteHousehold: (id: string) => Promise<void>;
  createHousehold: () => Household;
  importHouseholds: (households: Household[]) => Promise<number>;
  clearLocalData: () => Promise<void>;

  online: boolean;
  backend: api.HealthInfo | null;
  backendChecked: boolean;
  checkBackend: () => Promise<api.HealthInfo | null>;
  deviceOnly: boolean;

  syncing: boolean;
  lastSyncAt?: string;
  pendingCount: number;
  syncNow: (options?: { silent?: boolean }) => Promise<SyncOutcome>;

  toasts: Toast[];
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

/** Convenience hook for components that only translate. */
export function useT(): (key: string, values?: TranslateValues) => string {
  return useApp().t;
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [session, setSession] = useState<Session | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [zones, setZonesState] = useState<Zone[]>([]);
  const [users, setUsersState] = useState<User[]>([]);
  const [notices, setNoticesState] = useState<Notice[]>([]);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [backend, setBackend] = useState<api.HealthInfo | null>(null);
  const [backendChecked, setBackendChecked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);
  const [pendingCount, setPendingCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Guards against overlapping syncs without causing re-renders.
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  // Read inside syncNow instead of closing over the state value: if `lastSyncAt`
  // were a dependency, every completed sync would give syncNow a new identity,
  // restart the scheduling effect below, and sync again in a loop.
  const lastSyncAtRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = uuid();
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    setTimeout(() => {
      if (mountedRef.current) setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    lastSyncAtRef.current = lastSyncAt;
  }, [lastSyncAt]);

  const t = useCallback(
    (key: string, values?: TranslateValues) => translate(language, key, values),
    [language],
  );

  const locale = useMemo(() => languageMeta(language).locale, [language]);

  const refreshPendingCount = useCallback(async () => {
    const outbox = await db.listOutbox();
    if (mountedRef.current) setPendingCount(outbox.length);
    return outbox.length;
  }, []);

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [
          storedLanguage,
          storedSession,
          storedSync,
          storedZones,
          storedUsers,
          storedNotices,
          rows,
        ] = await Promise.all([
          db.getMeta<string>(META_LANGUAGE),
          db.getMeta<Session>(META_SESSION),
          db.getMeta<string>(META_LAST_SYNC),
          db.getMeta<Zone[]>(META_ZONES),
          db.getMeta<User[]>(META_USERS),
          db.getMeta<Notice[]>(META_NOTICES),
          db.listHouseholds(),
        ]);

        if (cancelled) return;

        setLanguageState(
          storedLanguage && isLanguageCode(storedLanguage) ? storedLanguage : detectLanguage(),
        );
        if (storedSession) {
          setSession(storedSession);
          if (!storedSession.local) api.setToken(storedSession.token);
        }
        setLastSyncAt(storedSync);
        lastSyncAtRef.current = storedSync;
        if (Array.isArray(storedZones)) setZonesState(storedZones);
        if (Array.isArray(storedUsers)) setUsersState(storedUsers);
        if (Array.isArray(storedNotices)) setNoticesState(storedNotices);
        setHouseholds(rows);
        await refreshPendingCount();
      } catch (error) {
        console.error('census: failed to restore local state', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshPendingCount]);

  /* ---------------------------------------------------------------- */
  /* Connectivity                                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const checkBackend = useCallback(async () => {
    const info = await api.probeBackend();
    if (mountedRef.current) {
      setBackend(info);
      setBackendChecked(true);
    }
    return info;
  }, []);

  useEffect(() => {
    if (!ready) return;
    void checkBackend();
  }, [ready, checkBackend]);

  // Language is reflected on <html> so screen readers and fonts follow along.
  useEffect(() => {
    document.documentElement.lang = languageMeta(language).locale;
  }, [language]);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next);
    void db.setMeta(META_LANGUAGE, next);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Session                                                           */
  /* ---------------------------------------------------------------- */

  const signIn = useCallback(async (next: Session) => {
    setSession(next);
    if (!next.local) api.setToken(next.token);
    else api.setToken(null);
    await db.setMeta(META_SESSION, next);
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    api.setToken(null);
    await db.deleteMeta(META_SESSION);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Households                                                        */
  /* ---------------------------------------------------------------- */

  const getHousehold = useCallback(
    (id: string) => households.find((household) => household.id === id),
    [households],
  );

  const createHousehold = useCallback((): Household => {
    const zone = zones.find((candidate) => session?.user.zoneIds.includes(candidate.id));
    return blankHousehold({
      zoneId: zone?.id ?? session?.user.zoneIds[0] ?? '',
      zoneCode: zone?.code,
      enumeratorId: session?.user.id ?? 'local',
      enumeratorName: session?.user.name ?? '',
      collectedBy: session?.user.role === 'citizen' ? 'citizen' : 'enumerator',
      language,
      state: zone?.state ?? '',
      district: zone?.district ?? '',
    });
  }, [language, session, zones]);

  const upsertLocal = useCallback((household: Household) => {
    setHouseholds((current) => {
      const index = current.findIndex((item) => item.id === household.id);
      const next = index === -1 ? [household, ...current] : current.slice();
      if (index !== -1) next[index] = household;
      return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    });
  }, []);

  const saveHousehold = useCallback(
    async (household: Household, options: { queue?: boolean } = {}) => {
      const deviceOnly = session?.local ?? !backend;

      const shouldQueue = shouldQueueForSync(household, {
        deviceOnly,
        explicit: options.queue,
      });

      const next: Household = {
        ...household,
        updatedAt: nowIso(),
        flags: validateHousehold(household),
        sync: deviceOnly ? 'local' : shouldQueue ? 'pending' : household.sync,
      };

      await db.saveHousehold(next);
      upsertLocal(next);

      if (shouldQueue) {
        const existing = (await db.listOutbox()).find((item) => item.id === next.id);
        const item: OutboxItem = {
          id: next.id,
          householdId: next.id,
          // Keep the original queue time so the outbox stays FIFO while a
          // household is being edited repeatedly.
          queuedAt: existing?.queuedAt ?? nowIso(),
          attempts: 0,
        };
        await db.enqueueOutbox(item);
        await refreshPendingCount();
      }

      return next;
    },
    [backend, refreshPendingCount, session, upsertLocal],
  );

  const submitHousehold = useCallback(
    async (household: Household) => {
      const submitted: Household = {
        ...household,
        status: household.status === 'approved' ? 'approved' : 'submitted',
        submittedAt: household.submittedAt ?? nowIso(),
        acknowledgementId:
          household.acknowledgementId ??
          (household.collectedBy === 'citizen' ? `CEN26-${shortCode(8)}` : undefined),
      };
      return saveHousehold(submitted, { queue: true });
    },
    [saveHousehold],
  );

  const deleteHousehold = useCallback(
    async (id: string) => {
      await db.deleteHousehold(id);
      await db.dequeueOutbox(id);
      setHouseholds((current) => current.filter((item) => item.id !== id));
      await refreshPendingCount();
    },
    [refreshPendingCount],
  );

  const importHouseholds = useCallback(
    async (incoming: Household[]) => {
      if (!incoming.length) return 0;
      await db.saveHouseholds(incoming);

      // Restoring onto a replacement phone is the documented recovery path, so
      // anything already submitted has to be queued — otherwise the work would
      // sit on the new device looking complete and never reach the server.
      const deviceOnly = session?.local ?? !backend;
      if (!deviceOnly) {
        const queueTime = nowIso();
        for (const household of incoming) {
          if (household.status === 'draft') continue;
          await db.enqueueOutbox({
            id: household.id,
            householdId: household.id,
            queuedAt: queueTime,
            attempts: 0,
          });
        }
        await refreshPendingCount();
      }

      const rows = await db.listHouseholds();
      if (mountedRef.current) setHouseholds(rows);
      return incoming.length;
    },
    [backend, refreshPendingCount, session],
  );

  const clearLocalData = useCallback(async () => {
    await db.clearCollectedData(false);
    setHouseholds([]);
    setPendingCount(0);
  }, []);

  const setZones = useCallback((next: Zone[]) => {
    setZonesState(next);
    void db.setMeta(META_ZONES, next);
  }, []);

  const setUsers = useCallback((next: User[]) => {
    setUsersState(next);
    void db.setMeta(META_USERS, next);
  }, []);

  const setNotices = useCallback((next: Notice[]) => {
    setNoticesState(next);
    void db.setMeta(META_NOTICES, next);
  }, []);

  /** Pull notices directly — used by the admin panel after publishing one. */
  const refreshNotices = useCallback(async () => {
    if (!backend || session?.local) return;
    try {
      setNotices(await api.listNotices());
    } catch (error) {
      console.warn('census: could not refresh notices', error);
    }
  }, [backend, session, setNotices]);

  /* ---------------------------------------------------------------- */
  /* Sync engine                                                       */
  /* ---------------------------------------------------------------- */

  const syncNow = useCallback(
    async (options: { silent?: boolean } = {}): Promise<SyncOutcome> => {
      const empty: SyncOutcome = { sent: 0, received: 0, conflicts: 0, failed: 0 };

      if (syncingRef.current) return { ...empty, skipped: 'busy' };
      if (!session || session.local) return { ...empty, skipped: 'device-only' };
      if (!online) return { ...empty, skipped: 'offline' };

      syncingRef.current = true;
      setSyncing(true);

      try {
        // Confirm the backend is actually reachable before touching the queue.
        const health = await api.probeBackend();
        if (mountedRef.current) {
          setBackend(health);
          setBackendChecked(true);
        }
        if (!health) {
          if (!options.silent) toast(translate(language, 'sync.failed'), 'error');
          return { ...empty, skipped: 'offline' };
        }

        const outcome: SyncOutcome = { sent: 0, received: 0, conflicts: 0, failed: 0 };

        /* Push ------------------------------------------------------- */
        const queue = await db.listOutbox();
        if (queue.length) {
          const payload: Household[] = [];
          for (const item of queue) {
            const household = await db.getHousehold(item.householdId);
            if (household) payload.push(household);
            else await db.dequeueOutbox(item.id);
          }

          if (payload.length) {
            const results = await api.pushHouseholds(payload);
            const updated: Household[] = [];

            for (const result of results) {
              const local = payload.find((item) => item.id === result.id);
              if (!local) continue;

              if (result.status === 'accepted') {
                updated.push({ ...local, rev: result.rev, sync: 'synced', syncError: undefined });
                await db.dequeueOutbox(result.id);
                outcome.sent += 1;
              } else if (result.status === 'conflict' && result.household) {
                // Server copy wins; the enumerator sees the refreshed record.
                updated.push({ ...result.household, sync: 'synced' });
                await db.dequeueOutbox(result.id);
                outcome.conflicts += 1;
              } else {
                updated.push({ ...local, sync: 'error', syncError: result.message ?? 'rejected' });
                const queued = queue.find((entry) => entry.id === result.id);
                if (queued) {
                  await db.enqueueOutbox({
                    ...queued,
                    attempts: queued.attempts + 1,
                    lastError: result.message,
                  });
                }
                outcome.failed += 1;
              }
            }

            if (updated.length) await db.saveHouseholds(updated);
          }
        }

        /* Pull ------------------------------------------------------- */
        try {
          // The server pages large pulls. Follow the cursor rather than waiting
          // for the next scheduled sync, but stop after a sane number of pages
          // so one call can never run away.
          for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
            const pulled = await api.pullChanges(lastSyncAtRef.current);

            if (pulled.households.length) {
              const merged = pulled.households.map(
                (household): Household => ({ ...household, sync: 'synced' }),
              );
              await db.saveHouseholds(merged);
              outcome.received += merged.length;
            }
            if (pulled.zones.length) setZones(pulled.zones);
            if (pulled.users.length) setUsers(pulled.users);
            // Replace rather than merge: a withdrawn notice has to disappear.
            if (pulled.notices) setNotices(pulled.notices);

            const stamp = pulled.serverTime || nowIso();
            lastSyncAtRef.current = stamp;
            setLastSyncAt(stamp);
            await db.setMeta(META_LAST_SYNC, stamp);

            if (!pulled.hasMore) break;
          }
        } catch (error) {
          // A push that succeeded is still progress — report but do not throw.
          console.warn('census: pull failed', error);
        }

        const rows = await db.listHouseholds();
        if (mountedRef.current) setHouseholds(rows);
        await refreshPendingCount();

        if (!options.silent) {
          if (outcome.sent || outcome.received) {
            toast(
              translate(language, 'sync.result', {
                sent: outcome.sent,
                received: outcome.received,
              }),
              'success',
            );
          } else if (!outcome.failed) {
            toast(translate(language, 'sync.nothingToSync'));
          }
          if (outcome.conflicts) {
            toast(translate(language, 'sync.conflict', { count: outcome.conflicts }), 'info');
          }
          if (outcome.failed) toast(translate(language, 'sync.failed'), 'error');
        }

        return outcome;
      } catch (error) {
        console.error('census: sync failed', error);

        // A rejected token means the account was disabled or the session aged
        // out. Say so plainly instead of showing "sync failed" for ever — the
        // local data stays on the device either way.
        if (
          error instanceof api.ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          api.setToken(null);
          setSession(null);
          await db.deleteMeta(META_SESSION);
          toast(translate(language, 'error.sessionExpired'), 'error');
          return { ...empty, failed: 1 };
        }

        if (!options.silent) toast(translate(language, 'sync.failed'), 'error');
        return { ...empty, failed: 1 };
      } finally {
        syncingRef.current = false;
        if (mountedRef.current) setSyncing(false);
      }
    },
    [language, online, refreshPendingCount, session, setNotices, setUsers, setZones, toast],
  );

  // Opportunistic background sync: on reconnect and every few minutes.
  useEffect(() => {
    if (!ready || !session || session.local || !online) return undefined;

    const timer = window.setTimeout(() => void syncNow({ silent: true }), 1500);
    const interval = window.setInterval(() => void syncNow({ silent: true }), 5 * 60 * 1000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [online, ready, session, syncNow]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      language,
      setLanguage,
      t,
      locale,
      session,
      signIn,
      signOut,
      households,
      zones,
      users,
      notices,
      setZones,
      setUsers,
      setNotices,
      refreshNotices,
      getHousehold,
      saveHousehold,
      submitHousehold,
      deleteHousehold,
      createHousehold,
      importHouseholds,
      clearLocalData,
      online,
      backend,
      backendChecked,
      checkBackend,
      deviceOnly: session?.local ?? !backend,
      syncing,
      lastSyncAt,
      pendingCount,
      syncNow,
      toasts,
      toast,
      dismissToast,
    }),
    [
      backend,
      backendChecked,
      checkBackend,
      clearLocalData,
      createHousehold,
      deleteHousehold,
      dismissToast,
      getHousehold,
      households,
      importHouseholds,
      language,
      lastSyncAt,
      locale,
      notices,
      online,
      pendingCount,
      ready,
      refreshNotices,
      saveHousehold,
      session,
      setLanguage,
      setNotices,
      setUsers,
      setZones,
      signIn,
      signOut,
      submitHousehold,
      syncNow,
      syncing,
      t,
      toast,
      toasts,
      users,
      zones,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Build a session for device-only mode (no backend reachable). */
export function localSession(name: string, mobile: string, role: Role): Session {
  return {
    token: `local-${uuid()}`,
    local: true,
    issuedAt: nowIso(),
    user: {
      id: `local-${role}-${mobile || shortCode(6)}`,
      name: name || 'Field user',
      mobile,
      role,
      zoneIds: [],
      active: true,
      createdAt: nowIso(),
    },
  };
}
