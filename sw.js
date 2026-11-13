// sw.js — Navenza Map Service Worker (v4)
// Démarrage garanti hors réseau :
//  - pré-cache des fichiers essentiels (sans '/carte-terrain/' qui renvoyait 404
//    sur GitHub Pages et faisait échouer TOUTE l'installation du cache en v3)
//  - toute navigation dans le scope sert la page en cache (même avec ?paramètres)
//  - la page est mise à jour en arrière-plan quand le réseau est disponible
const CACHE_NAME = 'navenza-v4';
const BASE = '/carte-terrain/';
const HTML = BASE + 'carte_terrain.html';
const CORE = [
  HTML,
  BASE + 'lib/leaflet.min.js',
  BASE + 'lib/leaflet.min.css',
  BASE + 'lib/jszip.min.js',
  BASE + 'lib/pdf.min.mjs',
  BASE + 'lib/pdf.worker.min.mjs',
  BASE + 'manifest.json',
];
const OPTIONAL = [
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-512.png',
  BASE + 'icons/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache:'reload' = contourne le cache HTTP pour ne pas figer une vieille version
    await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    // Les icônes ne doivent jamais bloquer l'installation
    await Promise.allSettled(OPTIONAL.map(u =>
      fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && cache.put(u, r))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('navenza-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Mise à jour silencieuse d'une ressource (ignorée si hors réseau)
function refresh(cacheKey, request) {
  return fetch(request).then(r => {
    if (r && r.ok && r.type === 'basic' && !r.redirected) {
      return caches.open(CACHE_NAME).then(c => c.put(cacheKey, r));
    }
  }).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (lancement de l'app) → toujours la page en cache d'abord
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(HTML, { ignoreSearch: true });
      if (cached) {
        e.waitUntil(refresh(HTML, new Request(HTML, { cache: 'no-cache' })));
        return cached;
      }
      try { return await fetch(req); }
      catch (err) {
        return new Response('<meta charset="utf-8"><h3 style="font-family:sans-serif">Navenza n\'est pas encore installé hors ligne.<br>Ouvrez l\'app une fois avec du réseau.</h3>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Autres fichiers → cache d'abord, réseau en secours (et mise en cache)
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const r = await fetch(req);
    if (r && r.ok && r.type === 'basic' && !r.redirected) {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, clone));
    }
    return r;
  })());
});
