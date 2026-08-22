/* India Census 2026-27 — service worker.
 *
 * Deliberately dependency-free and hash-agnostic so the same file works whether
 * the app is served from a domain root, a subfolder on shared hosting, or the
 * FastAPI backend. Strategy:
 *   - navigations   : network-first, fall back to the cached app shell (offline)
 *   - /api/ requests: never cached (the app keeps its own offline outbox)
 *   - other GETs    : cache-first, revalidate in the background
 */
const VERSION = 'census-2026-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// Resolve against the service worker's own scope so subfolder installs work.
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add individually: a single 404 must not abort the whole install.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept API traffic or cross-origin requests (map tiles, fonts).
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('./index.html', response.clone()).catch(() => undefined);
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            (await caches.match(request));
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
              '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
              '<h1>Offline</h1><p>Open the app once while connected to install it for offline use.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // Refresh in the background; hashed assets make this cheap.
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) return cache.put(request, response.clone());
              return undefined;
            })
            .catch(() => undefined),
        );
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      } catch (error) {
        const fallback = await caches.match(request);
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
