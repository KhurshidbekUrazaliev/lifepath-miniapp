// The phone app's offline copy (registered there by src/native/bridge.ts), and the notifications of
// the website and the iPhone home-screen app (registered by src/store/webPush.ts when they are turned
// on). The phone app is loaded from this site, so a new deploy reaches every phone; this keeps the last
// one it loaded for when there is no internet. Pages: the network first, the saved copy when offline. Files with a hash in their name
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

// ---------- notifications (worker/src/push.ts sends them) ----------

self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || 'LifePath', {
      body: m.body || '',
      tag: m.tag || undefined,
      icon: '/icon-192.png',
      data: { open: m.open || null },
    }),
  );
});

// A tap opens the app at the part the reminder is about (?open= works as on the bot's buttons).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const open = event.notification.data && event.notification.data.open;
  const url = new URL(open ? `/?open=${encodeURIComponent(open)}` : '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const here = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (here) return here.focus().then((c) => (open && c && 'navigate' in c ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});
