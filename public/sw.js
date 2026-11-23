// The phone app's offline copy (registered only there: src/native/bridge.ts). The app is loaded from
// this site, so a new deploy reaches every phone; this keeps the last one it loaded for when there is
// no internet. Pages: the network first, the saved copy when offline. Files with a hash in their name
// never change: the saved copy first. The API is never cached.
const CACHE = 'lifepath-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|tg|admin|s)\//.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
    return;
  }

  const immutable = url.pathname.startsWith('/assets/') || /\/companion\/.+\.glb$/.test(url.pathname);
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit && immutable) return hit;
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      // A saved copy answers at once; the fresh one replaces it for next time.
      return hit || fresh;
    }),
  );
});
