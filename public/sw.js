// Vite replaces __BUILD_ID__ and __PRECACHE__ after building (scripts/postbuild.mjs).
const ROOT = new URL('./', self.location.href).href;
const PREFIX = `daylight:${new URL(ROOT).pathname}:`;
const CACHE = PREFIX + '__BUILD_ID__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('message', event => {
  if (event.data === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  const index = new URL('index.html', ROOT);
  const appNavigation = event.request.mode === 'navigate' &&
    (url.pathname === new URL(ROOT).pathname || url.pathname === index.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(appNavigation ? index.href : event.request);
    return cached ?? fetch(event.request);
  })());
});
