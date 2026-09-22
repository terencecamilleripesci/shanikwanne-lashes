/* ==========================================================================
   sw.js — NETWORK-FIRST with cache fallback.
   Cache-first bites you: she updates the app, the phone keeps serving the old
   files, and the "broken" screen is really a stale one. Bump CACHE every change.
   ========================================================================== */
const CACHE = 'shanikwanne-v9';

const CORE = [
  './',
  'index.html',
  'css/app.css',
  'js/store.js',
  'js/ui.js',
  'js/lashmap.js',
  'js/photos.js',
  'js/sketch.js',
  'js/auth.js',
  'js/demo.js',
  'js/app.js',
  'js/screens.js',
  'js/sessions.js',
  'js/settings.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole install if any one file 404s — add individually
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch((err) => {
        console.warn('[sw] could not cache', u, err);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // never touch the app's own data — that's IndexedDB/localStorage, not HTTP
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // only cache successful same-origin responses + font files
        const ok = res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');
        if (ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // offline navigation → hand back the app shell so the SPA still boots
          if (req.mode === 'navigate') return caches.match('index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});

/* Tapping a reminder should open the app, not a second copy of it. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow('index.html#/today') : null;
    })
  );
});
