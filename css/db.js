// db.js — Navenza Map v3 : base IndexedDB, migration v2 → v3, accès aux données
// Même base que la v2 (carte_terrain_db_v2), version 3. Voir claude/modele-donnees-v3.md.
(function () {
  'use strict';

  // Copie de test (dépôt « …-test ») : base séparée, pour ne jamais toucher aux données de production
  var IS_TEST = /-test\//.test(location.pathname);
  var DB_NAME = IS_TEST ? 'navenza_test_db' : 'carte_terrain_db_v2';
  var DB_VER = 3;
  var SCHEMA = 3;
  var db = null;

  var NEW_STORES = {
    folders:    { keyPath: 'id' },
    cartes:     { keyPath: 'id', indexes: ['folderId'] },
    carteFiles: { keyPath: 'id' },
    layers:     { keyPath: 'id' },
    photos:     { keyPath: 'id', indexes: ['wpId'] },
    meta:       { keyPath: 'key' }
  };
  var LAYER_COLORS = ['#FFB547', '#6EDB98', '#7FC8F8', '#FF7A59', '#C792EA', '#F2E85C', '#5AD1C8', '#FF9EC4'];

  // ══════════════ Ouverture ══════════════
  function open() {
    return new Promise(function (res, rej) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { rej(e); return; }
      req.onupgradeneeded = function (e) {
        // Création des magasins et index SEULEMENT (synchrone). Aucune copie de données ici.
        var d = e.target.result, tx = e.target.transaction;
        Object.keys(NEW_STORES).forEach(function (name) {
          try {
            if (!d.objectStoreNames.contains(name)) {
              var s = d.createObjectStore(name, { keyPath: NEW_STORES[name].keyPath });
              (NEW_STORES[name].indexes || []).forEach(function (ix) { s.createIndex(ix, ix); });
            }
          } catch (err) { console.warn('[db] création ' + name + ' :', err); }
        });
        ['waypoints', 'traces'].forEach(function (name) {
          try {
            var s = d.objectStoreNames.contains(name)
              ? tx.objectStore(name)
              : d.createObjectStore(name, { keyPath: 'id' });
            if (!s.indexNames.contains('layerId')) s.createIndex('layerId', 'layerId');
          } catch (err) { console.warn('[db] index layerId ' + name + ' :', err); }
        });
      };
      req.onblocked = function () { console.warn('[db] ouverture bloquée : un autre onglet utilise l\'ancienne version'); };
      req.onsuccess = function (e) {
        db = e.target.result;
        db.onversionchange = function () { db.close(); };
        res(db);
      };
      req.onerror = function (e) { rej(e.target.error); };
    });
  }

  // ══════════════ Petits utilitaires ══════════════
  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function txDone(tx) {
    return new Promise(function (res, rej) {
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error || new Error('Transaction annulée')); };
    });
  }
  function store(name, mode) { return db.transaction(name, mode || 'readonly').objectStore(name); }
  function getAll(name) { return reqP(store(name).getAll()); }
  function get(name, key) { return reqP(store(name).get(key)); }
  function put(name, val) { return reqP(store(name, 'readwrite').put(val)); }
  function del(name, key) { return reqP(store(name, 'readwrite').delete(key)); }
  function byIndex(name, ix, val) { return reqP(store(name).index(ix).getAll(val)); }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function has(name) { return db.objectStoreNames.contains(name); }

  async function getMeta(key) { var r = await get('meta', key); return r ? r.value : undefined; }
  function setMeta(key, value) { return put('meta', { key: key, value: value }); }

  // ══════════════ Migration v2 → v3 ══════════════
  // Une seule transaction sur tous les magasins : tout réussit, ou rien ne change.
  async function migrate() {
    if ((await getMeta('schema')) === SCHEMA) return null;
    var legacy = ['projects', 'maps'].filter(has);
    if (!legacy.length) { await setMeta('schema', SCHEMA); return null; } // installation neuve

    var names = ['projects', 'maps', 'waypoints', 'traces', 'folders', 'cartes', 'carteFiles', 'layers', 'photos', 'meta'].filter(has);
    var tx = db.transaction(names, 'readwrite');
    var done = txDone(tx);
    var summary = null;
    var S = function (n) { return tx.objectStore(n); };
    var pending = 4, data = {};
    function load(name, key) {
      if (!has(name)) { data[key] = []; if (!--pending) apply(); return; }
      var r = S(name).getAll();
      r.onsuccess = function () { data[key] = r.result || []; if (!--pending) apply(); };
    }
    function apply() {
      try {
        if (window.__NV_FAIL_MIGRATION === 'debut') throw new Error('Panne simulée (début)');
        var projects = data.projects.slice();
        var known = {};
        projects.forEach(function (p) { known[p.id] = true; });
        // Projets référencés mais absents de « projects » (orphelins)
        data.maps.concat(data.wps, data.trs).forEach(function (r) {
          var pid = r.projectId;
          if (pid && !known[pid]) { known[pid] = true; projects.push({ id: pid, name: 'Projet sans nom', created: null, lastOpened: null }); }
        });
        projects.sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); });

        var usedNames = {}, folderOf = {}, layerOf = {}, nameOf = {};
        var withData = {};
        data.wps.concat(data.trs).forEach(function (r) { if (r.projectId) withData[r.projectId] = true; });
        var nF = 0, nL = 0, nC = 0, nW = 0, nPh = 0, nT = 0;

        projects.forEach(function (p, i) {
          var base = String(p.name || 'Projet sans nom').trim() || 'Projet sans nom', name = base, k = 2;
          while (usedNames[name.toLowerCase()]) name = base + ' (' + (k++) + ')';
          usedNames[name.toLowerCase()] = true;
          nameOf[p.id] = name;
          folderOf[p.id] = 'f_' + p.id;
          S('folders').put({ id: 'f_' + p.id, name: name, parentId: null, order: i, created: p.created || new Date().toISOString() });
          nF++;
          if (withData[p.id]) {
            layerOf[p.id] = 'l_' + p.id;
            S('layers').put({ id: 'l_' + p.id, name: name, color: LAYER_COLORS[nL % LAYER_COLORS.length], visible: true, order: nL, created: p.created || new Date().toISOString() });
            nL++;
          }
        });

        // Cartes (secteurs) : métadonnées + fichier, puis suppression de l'ancien enregistrement
        var lastCarte = null, lastOpened = '';
        data.maps.forEach(function (rec) {
          var sectors = rec.sectors || (rec.cogBlob ? [{ id: 'main', name: '#1 – Carte principale', cogBlob: rec.cogBlob }] : []);
          var proj = projects.filter(function (p) { return p.id === rec.projectId; })[0] || {};
          sectors.forEach(function (s, j) {
            if (!s || !s.cogBlob) return;
            var cid = 'c_' + rec.projectId + '_' + s.id;
            var t = (s.cogBlob.type || '').toLowerCase();
            var kind = t.indexOf('pdf') >= 0 ? 'pdf' : (t.indexOf('tif') >= 0 ? 'tiff' : null);
            var nm = String(s.name || '').replace(/^#\d+\s*[–—-]\s*/, '').trim() || ('Carte ' + (j + 1));
            S('carteFiles').put({ id: cid, blob: s.cogBlob });
            S('cartes').put({
              id: cid, folderId: folderOf[rec.projectId] || null, name: nm,
              kind: kind, fileName: s.fichier || nm, bytes: s.cogBlob.size || 0,
              created: proj.created || new Date().toISOString(),
              lastOpened: rec.activeSectorId === s.id ? (proj.lastOpened || null) : null,
              footprint: null, bbox: null, order: j
            });
            nC++;
            if (rec.activeSectorId === s.id && (proj.lastOpened || '') >= lastOpened) { lastOpened = proj.lastOpened || ''; lastCarte = cid; }
          });
          S('maps').delete(rec.projectId);
        });
        if (window.__NV_FAIL_MIGRATION === 'milieu') throw new Error('Panne simulée (milieu)');

        // Waypoints : calque + photos déplacées
        data.wps.forEach(function (wp) {
          if (wp.layerId) return; // déjà migré
          var ids = [];
          (wp.photos || []).forEach(function (d, i) {
            var phid = 'ph_' + wp.id + '_' + i;
            S('photos').put({ id: phid, wpId: wp.id, data: d });
            ids.push(phid); nPh++;
          });
          var nwp = Object.assign({}, wp);
          delete nwp.photos;
          nwp.photoIds = ids;
          nwp.layerId = layerOf[wp.projectId] || null;
          nwp.legacyProjectId = wp.projectId || null;
          delete nwp.projectId;
          S('waypoints').put(nwp); nW++;
        });
        data.trs.forEach(function (tr) {
          if (tr.layerId) return;
          var ntr = Object.assign({}, tr);
          ntr.layerId = layerOf[tr.projectId] || null;
          ntr.legacyProjectId = tr.projectId || null;
          delete ntr.projectId;
          S('traces').put(ntr); nT++;
        });

        var theme = 'sombre';
        try { if (localStorage.getItem('navenza-sun-mode') === '1') theme = 'soleil'; } catch (e) {}
        summary = { date: new Date().toISOString(), dossiers: nF, calques: nL, cartes: nC, points: nW, photos: nPh, traces: nT };
        S('meta').put({ key: 'theme', value: theme });
        if (lastCarte) S('meta').put({ key: 'lastCarteId', value: lastCarte });
        S('meta').put({ key: 'migrationV3', value: summary });
        S('meta').put({ key: 'schema', value: SCHEMA });
        if (window.__NV_FAIL_MIGRATION === 'fin') throw new Error('Panne simulée (fin)');
      } catch (err) {
        console.error('[db] migration annulée :', err);
        try { tx.abort(); } catch (e) {}
      }
    }
    load('projects', 'projects'); load('maps', 'maps'); load('waypoints', 'wps'); load('traces', 'trs');
    try {
      await done;
    } catch (err) {
      try { await setMeta('migrationErreur', { date: new Date().toISOString(), message: String(err && err.message || err) }); } catch (e) {}
      throw new Error('La mise à jour des données a échoué ; vos données d\'origine sont intactes. ' + (err && err.message || ''));
    }
    return summary;
  }

  // ══════════════ Emprises en arrière-plan ══════════════
  // fn(blob) → { kind, footprint, bbox }. Une carte à la fois, transactions séparées.
  async function fillFootprints(fn, onEach) {
    var list = (await getAll('cartes')).filter(function (c) { return !c.footprint && !c.footprintError; });
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      try {
        var f = await get('carteFiles', c.id);
        if (!f || !f.blob) throw new Error('Fichier introuvable');
        var r = await fn(f.blob);
        c.footprint = r.footprint; c.bbox = r.bbox; if (r.kind) c.kind = r.kind;
      } catch (err) {
        c.footprintError = String(err && err.message || err);
      }
      await put('cartes', c);
      if (onEach) try { onEach(c); } catch (e) {}
    }
    return list.length;
  }

  // ══════════════ Dossiers ══════════════
  async function listFolders() {
    var l = await getAll('folders');
    return l.sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'fr'); });
  }
  async function saveFolder(f) {
    if (!f.id) { var l = await getAll('folders'); f = Object.assign({ id: uid('f_'), parentId: null, order: l.length, created: new Date().toISOString() }, f); }
    await put('folders', f); return f;
  }
  // mode : 'move' (cartes → Sans dossier) ou 'delete' (supprime aussi les cartes)
  async function deleteFolder(id, mode) {
    var cs = await byIndex('cartes', 'folderId', id);
    var tx = db.transaction(['folders', 'cartes', 'carteFiles'], 'readwrite'), done = txDone(tx);
    cs.forEach(function (c) {
      if (mode === 'delete') { tx.objectStore('cartes').delete(c.id); tx.objectStore('carteFiles').delete(c.id); }
      else { c.folderId = null; tx.objectStore('cartes').put(c); }
    });
    tx.objectStore('folders').delete(id);
    await done;
  }

  // ══════════════ Cartes ══════════════
  function listCartes() { return getAll('cartes'); }
  function getCarte(id) { return get('cartes', id); }
  async function getCarteBlob(id) { var r = await get('carteFiles', id); return r ? r.blob : null; }
  function saveCarte(c) { return put('cartes', c); }
  async function addCarte(meta, blob) {
    var c = Object.assign({ id: uid('c_'), folderId: null, created: new Date().toISOString(), lastOpened: null, bytes: blob.size }, meta);
    var tx = db.transaction(['cartes', 'carteFiles'], 'readwrite'), done = txDone(tx);
    tx.objectStore('carteFiles').put({ id: c.id, blob: blob });
    tx.objectStore('cartes').put(c);
    await done; return c;
  }
  async function deleteCarte(id) {
    var tx = db.transaction(['cartes', 'carteFiles'], 'readwrite'), done = txDone(tx);
    tx.objectStore('cartes').delete(id); tx.objectStore('carteFiles').delete(id);
    await done;
  }

  // ══════════════ Calques ══════════════
  async function listLayers() {
    var l = await getAll('layers');
    return l.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  async function saveLayer(l) {
    if (!l.id) { var all = await getAll('layers'); l = Object.assign({ id: uid('l_'), visible: true, order: all.length, color: LAYER_COLORS[all.length % LAYER_COLORS.length], created: new Date().toISOString() }, l); }
    await put('layers', l); return l;
  }
  // Supprime le calque ET ses points, photos et tracés
  async function deleteLayer(id) {
    var wps = await byIndex('waypoints', 'layerId', id), trs = await byIndex('traces', 'layerId', id);
    var tx = db.transaction(['layers', 'waypoints', 'traces', 'photos'], 'readwrite'), done = txDone(tx);
    wps.forEach(function (w) { (w.photoIds || []).forEach(function (p) { tx.objectStore('photos').delete(p); }); tx.objectStore('waypoints').delete(w.id); });
    trs.forEach(function (t) { tx.objectStore('traces').delete(t.id); });
    tx.objectStore('layers').delete(id);
    await done;
  }

  // ══════════════ Waypoints et photos ══════════════
  function listWaypoints() { return getAll('waypoints'); }
  function saveWaypoint(wp) { return put('waypoints', wp); }
  async function addPhoto(wpId, data, taken) { var id = uid('ph_'); await put('photos', { id: id, wpId: wpId, data: data, taken: taken || null }); return id; }
  function deletePhoto(id) { return del('photos', id); }
  async function getPhotos(wp) {
    var out = [];
    for (var i = 0; i < (wp.photoIds || []).length; i++) { var p = await get('photos', wp.photoIds[i]); if (p) out.push(p); }
    return out;
  }
  async function deleteWaypoint(wp) {
    var tx = db.transaction(['waypoints', 'photos'], 'readwrite'), done = txDone(tx);
    (wp.photoIds || []).forEach(function (p) { tx.objectStore('photos').delete(p); });
    tx.objectStore('waypoints').delete(wp.id);
    await done;
  }

  // ══════════════ Tracés ══════════════
  function listTraces() { return getAll('traces'); }
  function saveTrace(t) { return put('traces', t); }
  function deleteTrace(id) { return del('traces', id); }

  async function storageEstimate() {
    try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; }
  }

  window.NavDB = {
    DB_NAME: DB_NAME, DB_VER: DB_VER, IS_TEST: IS_TEST,
    open: open, migrate: migrate, fillFootprints: fillFootprints,
    getMeta: getMeta, setMeta: setMeta, uid: uid,
    listFolders: listFolders, saveFolder: saveFolder, deleteFolder: deleteFolder,
    listCartes: listCartes, getCarte: getCarte, getCarteBlob: getCarteBlob, saveCarte: saveCarte, addCarte: addCarte, deleteCarte: deleteCarte,
    listLayers: listLayers, saveLayer: saveLayer, deleteLayer: deleteLayer,
    listWaypoints: listWaypoints, saveWaypoint: saveWaypoint, deleteWaypoint: deleteWaypoint,
    addPhoto: addPhoto, deletePhoto: deletePhoto, getPhotos: getPhotos,
    listTraces: listTraces, saveTrace: saveTrace, deleteTrace: deleteTrace,
    storageEstimate: storageEstimate,
    _raw: function () { return db; }
  };
})();
