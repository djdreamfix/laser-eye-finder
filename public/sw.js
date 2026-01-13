/* Laser Level Detector Service Worker
   - Cache-first for same-origin static assets
   - Network-first for navigations with offline fallback
   - Never throws inside respondWith (prevents app from failing to start)
*/

const CACHE_NAME = 'laserlevel-cache-v2';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
      } catch {
        // Ignore: SW should never block install
      } finally {
        // Activate ASAP
        // @ts-ignore
        await self.skipWaiting?.();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      } catch {
        // ignore
      } finally {
        // @ts-ignore
        await self.clients.claim?.();
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Workaround: some browsers emit requests with cache=only-if-cached that can
  // cause fetch() to throw inside a service worker.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    (async () => {
      try {
        const url = new URL(req.url);
        const isSameOrigin = url.origin === self.location.origin;

        // Navigations: network-first, fallback to cached shell
        if (req.mode === 'navigate') {
          try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put('/index.html', fresh.clone()).catch(() => {});
            }
            return fresh;
          } catch {
            const cachedShell = await caches.match('/index.html');
            if (cachedShell) return cachedShell;
            return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
          }
        }

        // Assets / API: cache-first for same-origin
        const cached = await caches.match(req);
        if (cached) return cached;

        const fresh = await fetch(req);

        // Cache only successful same-origin responses
        if (isSameOrigin && fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }

        return fresh;
      } catch {
        // Absolute last resort: try cache, else return 503
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })()
  );
});
