/** Offline storage.
 *
 * Field devices lose connectivity constantly, so every write goes to local
 * storage first and syncs later. IndexedDB is the primary engine; when it is
 * unavailable (private browsing, locked-down kiosk browsers, `file://` on some
 * Android builds) we transparently fall back to a localStorage-backed store so
 * the app still works — just with less room for photos.
 */

import type { Household, OutboxItem } from './types';

export const DB_NAME = 'india-census-2026';
export const DB_VERSION = 1;

export type StoreName = 'households' | 'outbox' | 'meta';

const STORES: StoreName[] = ['households', 'outbox', 'meta'];

interface MetaRecord {
  key: string;
  value: unknown;
}

interface Engine {
  readonly kind: 'indexeddb' | 'localstorage';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  put(store: StoreName, value: unknown): Promise<void>;
  putMany(store: StoreName, values: unknown[]): Promise<void>;
  remove(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

function keyPathFor(store: StoreName): string {
  return store === 'meta' ? 'key' : 'id';
}

function recordKey(store: StoreName, value: unknown): string {
  const key = (value as Record<string, unknown>)[keyPathFor(store)];
  if (typeof key !== 'string' || !key) {
    throw new Error(`Record for "${store}" is missing a string "${keyPathFor(store)}"`);
  }
  return key;
}

/* ------------------------------------------------------------------ */
/* IndexedDB engine                                                    */
/* ------------------------------------------------------------------ */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const objectStore = db.createObjectStore(store, { keyPath: keyPathFor(store) });
          if (store === 'households') {
            objectStore.createIndex('status', 'status', { unique: false });
            objectStore.createIndex('zoneId', 'zoneId', { unique: false });
            objectStore.createIndex('enumeratorId', 'enumeratorId', { unique: false });
            objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A second tab upgrading the schema would otherwise block forever.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
}

function createIdbEngine(db: IDBDatabase): Engine {
  const run = <T>(
    store: StoreName,
    mode: IDBTransactionMode,
    body: (objectStore: IDBObjectStore) => IDBRequest<T> | null,
  ): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(store, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let result: T | undefined;
      const request = body(transaction.objectStore(store));
      if (request) request.onsuccess = () => (result = request.result);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });

  return {
    kind: 'indexeddb',
    async get<T>(store: StoreName, key: string) {
      return (await run<T>(store, 'readonly', (os) => os.get(key) as IDBRequest<T>)) ?? undefined;
    },
    async getAll<T>(store: StoreName) {
      return (await run<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)) ?? [];
    },
    async put(store: StoreName, value: unknown) {
      recordKey(store, value); // validate before opening a transaction
      await run(store, 'readwrite', (os) => os.put(value) as IDBRequest<IDBValidKey>);
    },
    async putMany(store: StoreName, values: unknown[]) {
      if (!values.length) return;
      values.forEach((value) => recordKey(store, value));
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite');
        const objectStore = transaction.objectStore(store);
        for (const value of values) objectStore.put(value);
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB bulk write failed'));
      });
    },
    async remove(store: StoreName, key: string) {
      await run(store, 'readwrite', (os) => os.delete(key) as unknown as IDBRequest<undefined>);
    },
    async clear(store: StoreName) {
      await run(store, 'readwrite', (os) => os.clear() as unknown as IDBRequest<undefined>);
    },
  };
}

/* ------------------------------------------------------------------ */
/* localStorage fallback engine                                        */
/* ------------------------------------------------------------------ */

function createFallbackEngine(): Engine {
  const memory = new Map<StoreName, Map<string, unknown>>();
  const canPersist = (() => {
    try {
      const probe = '__census_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })();

  const storageKey = (store: StoreName) => `census:${store}`;

  const load = (store: StoreName): Map<string, unknown> => {
    const cached = memory.get(store);
    if (cached) return cached;
    const map = new Map<string, unknown>();
    if (canPersist) {
      try {
        const raw = window.localStorage.getItem(storageKey(store));
        if (raw) {
          const parsed = JSON.parse(raw) as unknown[];
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              try {
                map.set(recordKey(store, item), item);
              } catch {
                /* skip malformed rows rather than losing the whole store */
              }
            }
          }
        }
      } catch {
        /* corrupted payload — start clean */
      }
    }
    memory.set(store, map);
    return map;
  };

  const persist = (store: StoreName) => {
    if (!canPersist) return;
    try {
      window.localStorage.setItem(
        storageKey(store),
        JSON.stringify(Array.from(load(store).values())),
      );
    } catch (error) {
      // Quota exceeded: keep the in-memory copy so the current session survives.
      console.warn(`census: could not persist "${store}" to localStorage`, error);
    }
  };

  return {
    kind: 'localstorage',
    async get<T>(store: StoreName, key: string) {
      return load(store).get(key) as T | undefined;
    },
    async getAll<T>(store: StoreName) {
      return Array.from(load(store).values()) as T[];
    },
    async put(store: StoreName, value: unknown) {
      load(store).set(recordKey(store, value), value);
      persist(store);
    },
    async putMany(store: StoreName, values: unknown[]) {
      const map = load(store);
      for (const value of values) map.set(recordKey(store, value), value);
      persist(store);
    },
    async remove(store: StoreName, key: string) {
      load(store).delete(key);
      persist(store);
    },
    async clear(store: StoreName) {
      memory.set(store, new Map());
      persist(store);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

let enginePromise: Promise<Engine> | null = null;

function engine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (typeof indexedDB === 'undefined') return createFallbackEngine();
      try {
        return createIdbEngine(await openDatabase());
      } catch (error) {
        console.warn('census: IndexedDB unavailable, falling back to localStorage', error);
        return createFallbackEngine();
      }
    })();
  }
  return enginePromise;
}

export async function storageKind(): Promise<'indexeddb' | 'localstorage'> {
  return (await engine()).kind;
}

export async function getHousehold(id: string): Promise<Household | undefined> {
  return (await engine()).get<Household>('households', id);
}

export async function listHouseholds(): Promise<Household[]> {
  const rows = await (await engine()).getAll<Household>('households');
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveHousehold(household: Household): Promise<void> {
  await (await engine()).put('households', household);
}

export async function saveHouseholds(households: Household[]): Promise<void> {
  await (await engine()).putMany('households', households);
}

export async function deleteHousehold(id: string): Promise<void> {
  await (await engine()).remove('households', id);
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const rows = await (await engine()).getAll<OutboxItem>('outbox');
  return rows.sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1));
}

export async function enqueueOutbox(item: OutboxItem): Promise<void> {
  await (await engine()).put('outbox', item);
}

export async function dequeueOutbox(id: string): Promise<void> {
  await (await engine()).remove('outbox', id);
}

export async function clearOutbox(): Promise<void> {
  await (await engine()).clear('outbox');
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await (await engine()).get<MetaRecord>('meta', key);
  return record ? (record.value as T) : undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await engine()).put('meta', { key, value } satisfies MetaRecord);
}

export async function deleteMeta(key: string): Promise<void> {
  await (await engine()).remove('meta', key);
}

/** Wipe collected data. Meta (session, settings) is preserved unless asked. */
export async function clearCollectedData(includeMeta = false): Promise<void> {
  const db = await engine();
  await db.clear('households');
  await db.clear('outbox');
  if (includeMeta) await db.clear('meta');
}

/** Rough storage report for the profile screen. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}
