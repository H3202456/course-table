/* Course Table PWA: offline app shell only. Never cache API responses or personal data. */
'use strict';
const CACHE_NAME = 'course-table-shell-v10-date-center-20261026';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './static/styles.css?v=11',
  './static/data-tools.css?v=10',
  './static/storage.js?v=6',
  './static/app.js?v=9',
  './static/school-html-parser.js?v=2',
  './static/data-tools.js?v=9',
  './static/school-html-import-ui.js?v=3',
  './static/pwa.js?v=1',
  './static/icons/icon-192-v2.png',
  './static/icons/icon-512-v2.png',
  './static/icons/apple-touch-icon-v2.png',
  './static/icons/favicon-32-v2.png',
];
const allowed = new Set(CORE.map(path => new URL(path, self.registration.scope).href));
const fallback = new URL('./index.html', self.registration.scope).href;
const apiPrefix = new URL('./api/', self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const all = await caches.keys();
    await Promise.all(all.filter(key => key.startsWith('course-table-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.startsWith(apiPrefix)) return; // school import + legacy APIs: network only
  const isNavigation = request.mode === 'navigate';
  if (!isNavigation && !allowed.has(url.href)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(request) || (isNavigation ? await cache.match(fallback) : undefined)
        || Response.error();
    }
  })());
});
