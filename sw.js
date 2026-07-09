// sw.js — Navenza Map Service Worker
// Cache-first : sert depuis le cache, réseau en fallback
const CACHE_NAME = 'navenza-v3';
const ASSETS = [
  '/carte-terrain/carte_terrain.html',
  '/carte-terrain/',
  '/carte-terrain/lib/leaflet.min.js',
  '/carte-terrain/lib/leaflet.min.css',
  '/carte-terrain/lib/jszip.min.js',
  '/carte-terrain/manifest.json',
  '/carte-terrain/icons/icon-192.png',
  '/carte-terrain/icons/icon-512.png',
  '/carte-terrain/icons/icon-maskable-512.png',
  '/carte-terrain/icons/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match('/carte-terrain/carte_terrain.html'));
    })
  );
});
