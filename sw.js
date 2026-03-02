/* China Trip PWA SW — cache-first shell, network-first for HTML */
const CACHE_NAME = 'china-trip-v0.16.1';
const CORE = [
  './',
  './index.html',
  './app.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

// Network-first for navigations, otherwise cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, {ignoreSearch:true});
      if (cached) {
        // Revalidate in background
        event.waitUntil(fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); }).catch(()=>{}));
        return cached;
      }
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
  }
});