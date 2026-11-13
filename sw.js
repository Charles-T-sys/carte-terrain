// sw.js — NAVenza MAP 5.1 (navenza-v6)
// Hors ligne d'abord : tous les fichiers de l'app sont pré-cachés à l'installation.
// Une nouvelle version ne s'installe QUE par un nouveau CACHE_NAME : la page et ses scripts
// viennent toujours du même lot (pas de mélange ancienne page / nouveaux scripts).
const CACHE_NAME = 'navenza-v6';
const BASE = new URL('./', self.location).pathname;   // '/carte-terrain/' sur GitHub Pages
const HTML = BASE + 'carte_terrain.html';
const CORE = [
  'carte_terrain.html', 'manifest.json',
  'css/styles.css',
  'js/app.js', 'js/db.js', 'js/layers.js', 'js/export.js', 'js/index-geojson.js', 'js/coords.js', 'js/symbols.js', 'js/importer.js',
  'lib/leaflet.min.js', 'lib/leaflet.min.css', 'lib/jszip.min.js', 'lib/utif.js', 'lib/pdf.min.mjs', 'lib/pdf.worker.min.mjs',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2', 'fonts/ibm-plex-mono-latin-600-normal.woff2',
].map(f => BASE + f);
const OPTIONAL = ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))); }
    catch (err) { console.error('[sw] installation ' + CACHE_NAME + ' échouée (sera retentée) :', err && err.message); throw err; }
    await Promise.allSettled(OPTIONAL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && cache.put(u, r))));
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(HTML, { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetch(req); }
      catch (err) {
        return new Response('<meta charset="utf-8"><h3 style="font-family:sans-serif">NAVenza MAP n\'est pas encore installée hors ligne.<br>Ouvrez l\'app une fois avec du réseau.</h3>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const r = await fetch(req);
    if (r && r.ok && r.type === 'basic' && !r.redirected && url.pathname.startsWith(BASE)) {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, clone));
    }
    return r;
  })());
});
