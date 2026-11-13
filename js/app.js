// app.js — NAVenza MAP v3 : interface (bibliothèque, carte, points, aperçu, réglages)
(function () {
  'use strict';
  var APP_VERSION = '5.0.0';

  // ══════════════ Outils ══════════════
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(id, cls) { return '<svg class="i ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>'; }
  function num(n, d) { return n.toFixed(d).replace('.', ','); }
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : num(m / 1000, m < 10000 ? 2 : 1) + ' km'; }
  function fmtSize(b) { return b > 1048576 ? num(b / 1048576, 1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' ko'; }
  function fmtLL(lat, lon) { return num(Math.abs(lat), 5) + (lat >= 0 ? ' N' : ' S') + '  ' + num(Math.abs(lon), 5) + (lon >= 0 ? ' E' : ' O'); }
  function fmtDate(iso) { if (!iso) return '—'; try { return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso; } }
  function fmtDay(iso) { if (!iso) return ''; try { return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(new Date(iso)); } catch (e) { return iso.slice(0, 10); } }
  function pl(n, a, b) { return n + ' ' + (n > 1 ? (b || a + 's') : a); }
  function deg(d) { return String(Math.round(d) % 360).padStart(3, '0') + '°'; }
  function rad(x) { return x * Math.PI / 180; }
  function hav(a, b) { var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon); var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)); }
  function bearing(a, b) { var y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
  function ll(p) { return { lat: p.lat, lon: p.lon != null ? p.lon : p.lng }; }
  function inPoly(poly, lat, lon) { var inside = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  function covers(c, lat, lon) { return !!(c.footprint && inPoly(c.footprint, lat, lon)); }
  function bboxArea(c) { return c.bbox ? (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]) : Infinity; }
  function cartesAt(lat, lon) { return S.cartes.filter(function (c) { return covers(c, lat, lon); }).sort(function (a, b) { return bboxArea(a) - bboxArea(b); }); }
  function areaHa(pts) { // aire d'un polygone (projection locale équirectangulaire)
    if (pts.length < 3) return 0; var lat0 = pts.reduce(function (s, p) { return s + p.lat; }, 0) / pts.length, k = 111320 * Math.cos(rad(lat0)), a = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += (p.lon * k) * (q.lat * 111320) - (q.lon * k) * (p.lat * 111320); }
    return Math.abs(a / 2) / 10000;
  }
  var toastTimer = null;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2400); }
  window.toast = toast; // utilisé par layers.js

  var CATS = [
    { id: 'observation', label: 'Observation', color: '#ff6d00' }, { id: 'faune', label: 'Faune', color: '#4caf50' },
    { id: 'peche', label: 'Pêche', color: '#2196f3' }, { id: 'camping', label: 'Camp', color: '#ffc107' },
    { id: 'danger', label: 'Danger', color: '#e53935' }, { id: 'infra', label: 'Infra', color: '#9e9e9e' }];
  var CAT = {}; CATS.forEach(function (c) { CAT[c.id] = c; });
  var SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'flag', 'house'];
  var LCOLORS = ['#FFB547', '#6EDB98', '#7FC8F8', '#FF7A59', '#C792EA', '#F2E85C', '#5AD1C8', '#FF9EC4'];
  var FCOLORS = ['#FFB547', '#7FC8F8', '#6EDB98', '#FF9EC4', '#C792EA', '#F2E85C', '#5AD1C8', '#FF7A59'];
  function shapeSvg(shape, color, size) {
    var c = color || '#ff6d00', s = {
      circle: '<circle cx="12" cy="12" r="10" fill="' + c + '" stroke="white" stroke-width="2"/>',
      square: '<rect x="2" y="2" width="20" height="20" rx="2" fill="' + c + '" stroke="white" stroke-width="2"/>',
      triangle: '<polygon points="12,2 22,22 2,22" fill="' + c + '" stroke="white" stroke-width="2"/>',
      diamond: '<polygon points="12,2 22,12 12,22 2,12" fill="' + c + '" stroke="white" stroke-width="2"/>',
      star: '<polygon points="12,1 14.9,8.5 22.5,8.5 16.8,13.5 19,21 12,16.5 5,21 7.2,13.5 1.5,8.5 9.1,8.5" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      cross: '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      flag: '<rect x="5" y="16" width="2.5" height="7" fill="' + c + '" stroke="white" stroke-width="1"/><path d="M7.5 2 L20 7 L7.5 13 Z" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      house: '<polygon points="12,2 22,10 22,22 15,22 15,15 9,15 9,22 2,22 2,10" fill="' + c + '" stroke="white" stroke-width="2"/>' };
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" aria-hidden="true">' + (s[shape] || s.circle) + '</svg>';
  }
  function fpIcon(c) {
    if (!c.footprint || !c.bbox) return '<span class="fp" aria-hidden="true"></span>';
    var b = c.bbox, w = b[2] - b[0], h = b[3] - b[1], k = 30 / Math.max(w, h * 1.5), pts = c.footprint.map(function (p) { return (5 + (p[1] - b[0]) * k + (30 - w * k) / 2).toFixed(1) + ',' + (5 + (b[3] - p[0]) * k * 1.5 + (30 - h * k * 1.5) / 2).toFixed(1); }).join(' ');
    return '<svg class="fp" viewBox="0 0 40 40" aria-hidden="true"><polygon points="' + pts + '" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/></svg>';
  }

  // ══════════════ État ══════════════
  var S = {
    folders: [], cartes: [], layers: [], wps: [], traces: [],
    tab: 'cartes', prevTab: 'cartes', libFolder: null, libQuery: '', ptsMode: 'points', ptsQuery: '', ptsCat: '',
    pos: null, acc: null, speed: null, course: null, heading: null, prevGPS: null, gpsId: null, lastHereRender: null,
    map: null, carte: null, carteLayer: null, wpGroup: null, trGroup: null, posMarker: null, posCircle: null,
    follow: false, compassOn: false, navTarget: null,
    tracing: false, tracePts: [], traceLine: null, traceStart: 0, traceTimer: null, traceSaved: 0,
    mire: null, measurePts: [], measureLayers: [], elastic: null, movingWp: null,
    form: null, wpOpen: null, wpReturn: null, sheetFns: [],
    ov: null, ovFolder: 'all', ovLayers: null, ovPos: null,
    activeLayerId: null, theme: 'sombre', edgeDismissed: {}, edgeTarget: null, wakeLock: null
  };
  function layerById(id) { return S.layers.find(function (l) { return l.id === id; }); }
  function layersById() { var o = {}; S.layers.forEach(function (l) { o[l.id] = l; }); return o; }
  function folderById(id) { return S.folders.find(function (f) { return f.id === id; }); }
  function carteById(id) { return S.cartes.find(function (c) { return c.id === id; }); }
  function wpById(id) { return S.wps.find(function (w) { return w.id === id; }); }
  function layerVisible(id) { var l = layerById(id); return !l || l.visible !== false; }
  async function loadAll() {
    var r = await Promise.all([NavDB.listFolders(), NavDB.listCartes(), NavDB.listLayers(), NavDB.listWaypoints(), NavDB.listTraces()]);
    S.folders = r[0]; S.cartes = r[1]; S.layers = r[2]; S.wps = r[3]; S.traces = r[4];
  }
  async function ensureActiveLayer() {
    if (S.activeLayerId && layerById(S.activeLayerId)) return S.activeLayerId;
    if (!S.layers.length) { var l = await NavDB.saveLayer({ name: 'Mes points' }); S.layers.push(l); }
    S.activeLayerId = S.layers[0].id; await NavDB.setMeta('activeLayerId', S.activeLayerId);
    return S.activeLayerId;
  }

  // ══════════════ Feuilles (bas d'écran) ══════════════
  function openSheet(html, fns) {
    S.sheetFns = fns || [];
    $('#sheet').innerHTML = '<div class="grip"></div>' + html;
    $('#sheet-bg').classList.add('open'); $('#sheet').classList.add('open');
  }
  function closeSheet() { $('#sheet-bg').classList.remove('open'); $('#sheet').classList.remove('open'); S.sheetFns = []; }
  // options : [{label, sub, icon, cls, fn, disabled}]
  function sheetOptions(title, text, options, noCancel) {
    var fns = [], html = '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + esc(text) + '</p>' : '') + '<div class="opts">';
    options.forEach(function (o) {
      fns.push(o.fn);
      html += '<button class="btn ' + (o.cls || '') + '" data-act="sheetOpt" data-i="' + (fns.length - 1) + '"' + (o.disabled ? ' disabled' : '') + '>' + (o.icon ? ic(o.icon) : '') +
        '<span>' + esc(o.label) + (o.sub ? '<span class="s">' + esc(o.sub) + '</span>' : '') + '</span></button>';
    });
    fns.push(null);
    html += (noCancel ? '' : '<button class="btn" data-act="closeSheet">Annuler</button>') + '</div>';
    openSheet(html, fns);
  }
  function askText(title, value, placeholder) {
    return new Promise(function (res) {
      openSheet('<h3>' + esc(title) + '</h3><div class="field"><input class="input" id="ask-input" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" maxlength="80"></div>' +
        '<div class="grid2"><button class="btn" data-act="sheetOpt" data-i="0">Annuler</button><button class="btn primary" data-act="sheetOpt" data-i="1">OK</button></div>',
        [function () { res(null); }, function () { var v = $('#ask-input').value.trim(); res(v || null); }]);
      var inp = $('#ask-input'); setTimeout(function () { inp.focus(); inp.select(); }, 250);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var v = inp.value.trim(); closeSheet(); res(v || null); } });
    });
  }
  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(function (res) {
      openSheet('<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="grid2"><button class="btn" data-act="sheetOpt" data-i="0">Annuler</button>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="sheetOpt" data-i="1">' + esc(okLabel || 'OK') + '</button></div>',
        [function () { res(false); }, function () { res(true); }]);
    });
  }

  // ══════════════ Navigation entre écrans ══════════════
  function setView(id) {
    ['cartes', 'points', 'apercu', 'reglages'].forEach(function (v) { $('#view-' + v).classList.toggle('active', v === id); });
  }
  function showTab(name) {
    if (name === 'map') { openMapDefault(); return; }
    closeMapView();
    if (name !== 'reglages') S.tab = name;
    setView(name);
    ['cartes', 'map', 'points', 'apercu'].forEach(function (t) { $('#tab-' + t).classList.toggle('on', t === name); });
    if (name === 'cartes') renderLib();
    if (name === 'points') renderPoints();
    if (name === 'apercu') renderOverview();
    if (name === 'reglages') renderSettings();
    NavDB.setMeta('lastView', name === 'reglages' ? 'cartes' : name);
  }
  function closeMapView() {
    if (!$('#view-map').classList.contains('active')) return;
    exitMire();
    $('#view-map').classList.remove('active'); document.body.classList.remove('mapmode');
  }

  // ══════════════ Bibliothèque ══════════════
  function cartesIn(fid) { return S.cartes.filter(function (c) { return fid === 'none' ? !c.folderId || !folderById(c.folderId) : c.folderId === fid; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); }); }
  function carteRow(c, showFolder) {
    var here = S.pos && covers(c, S.pos.lat, S.pos.lon), f = folderById(c.folderId);
    var sub = (c.kind === 'tiff' ? 'GeoTIFF' : 'PDF') + ' · ' + fmtSize(c.bytes || 0) + (showFolder && f ? ' · ' + f.name : '') +
      (c.footprintError ? ' · emprise illisible' : (!c.footprint ? ' · emprise en calcul' : ''));
    return '<div class="row' + (here ? ' here' : '') + '"><button class="row" style="border:none;padding:0;min-height:52px" data-act="openCarte" data-id="' + esc(c.id) + '">' + fpIcon(c) +
      '<span class="main"><span class="t">' + esc(c.name) + '</span><span class="s">' + esc(sub) + '</span></span>' + (here ? '<span class="badge">ici</span>' : '') + '</button>' +
      '<button class="more" data-act="carteMenu" data-id="' + esc(c.id) + '" aria-label="Actions pour ' + esc(c.name) + '">' + ic('more') + '</button></div>';
  }
  function renderLib() {
    var body = $('#lib-body'), q = S.libQuery.trim().toLowerCase(), html = '';
    var inFolder = !!S.libFolder;
    $('#lib-back').classList.toggle('hidden', !inFolder); $('#view-cartes').classList.toggle('infolder', inFolder);
    $('#lib-folder-more').style.display = inFolder && S.libFolder !== 'none' ? '' : 'none';
    $('#lib-title').textContent = !inFolder ? 'Bibliothèque' : (S.libFolder === 'none' ? 'Sans dossier' : ((folderById(S.libFolder) || {}).name || 'Dossier'));
    if (!S.cartes.length && !S.folders.length) {
      body.innerHTML = '<div class="empty">Aucune carte pour l\'instant.<br>Touchez <b>Importer</b> pour ajouter un GeoPDF (exporté de QGIS) ou un GeoTIFF.</div>';
      return;
    }
    if (q) {
      var cs = S.cartes.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0 || ((folderById(c.folderId) || {}).name || '').toLowerCase().indexOf(q) >= 0; });
      body.innerHTML = '<div class="section-h"><h2>Résultats</h2><span class="n mono muted">' + cs.length + '</span></div>' +
        (cs.length ? '<div class="list">' + cs.map(function (c) { return carteRow(c, true); }).join('') + '</div>' : '<div class="empty">Aucune carte trouvée.</div>');
      return;
    }
    if (inFolder) {
      var list = cartesIn(S.libFolder);
      body.innerHTML = '<div style="height:8px"></div>' + (list.length ? '<div class="list">' + list.map(function (c) { return carteRow(c, false); }).join('') + '</div>' :
        '<div class="empty">Ce dossier est vide.<br>Touchez <b>Importer</b> pour y ajouter une carte, ou déplacez-y une carte avec son bouton <b>⋯</b>.</div>');
      return;
    }
    if (S.pos) {
      var here = cartesAt(S.pos.lat, S.pos.lon).slice(0, 4);
      if (here.length) {
        html += '<div class="section-h"><h2>Sous ma position</h2><span class="mono muted" style="font-size:14px">' + here.length + ' carte' + (here.length > 1 ? 's' : '') + '</span></div><div class="here-grid">' +
          here.map(function (c) { var f = folderById(c.folderId); return '<button class="here-card" data-act="openCarte" data-id="' + esc(c.id) + '">' + fpIcon(c) + '<span class="t">' + esc(c.name) + '</span><span class="s">' + esc(f ? f.name : 'Sans dossier') + '</span></button>'; }).join('') + '</div>';
      }
    }
    html += '<div class="section-h"><h2>Dossiers</h2><button class="btn" style="min-height:44px" data-act="newFolder">' + ic('plus', 'sm') + 'Nouveau</button></div><div class="list">';
    S.folders.forEach(function (f) {
      var n = cartesIn(f.id).length;
      html += '<div class="row"><button class="row" style="border:none;padding:0;min-height:52px" data-act="openFolder" data-id="' + esc(f.id) + '"><svg class="i" style="color:var(--accent-text)"><use href="#i-folder"/></svg><span class="main"><span class="t">' + esc(f.name) + '</span></span><span class="n">' + n + '</span>' + ic('chev', 'sm muted') + '</button>' +
        '<button class="more" data-act="folderMenu" data-id="' + esc(f.id) + '" aria-label="Actions pour ' + esc(f.name) + '">' + ic('more') + '</button></div>';
    });
    var none = cartesIn('none').length;
    if (none || !S.folders.length) html += '<button class="row" data-act="openFolder" data-id="none">' + ic('map', 'muted') + '<span class="main"><span class="t">Sans dossier</span></span><span class="n">' + none + '</span>' + ic('chev', 'sm muted') + '</button>';
    html += '</div>';
    var pending = S.cartes.filter(function (c) { return !c.footprint && !c.footprintError; }).length;
    if (pending) html += '<p class="muted" style="font-size:14px;margin:12px 4px">Calcul de l\'emprise de ' + pending + ' carte' + (pending > 1 ? 's' : '') + ' en cours…</p>';
    body.innerHTML = html;
  }

  async function importFiles(files) {
    var folderId = S.tab === 'cartes' && S.libFolder && S.libFolder !== 'none' ? S.libFolder : null, done = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      toast('Import ' + (i + 1) + '/' + files.length + ' : ' + f.name, 20000);
      try {
        var ab = await f.arrayBuffer(), kind = window.carteKind(ab);
        if (!kind) throw new Error('format non reconnu (GeoPDF ou GeoTIFF attendu)');
        var blob = new Blob([ab], { type: kind === 'pdf' ? 'application/pdf' : 'image/tiff' });
        var fp = await window.carteFootprint(blob);
        var name = f.name.replace(/\.(pdf|tiff?)$/i, '').replace(/_/g, ' ').trim();
        var c = await NavDB.addCarte({ name: name, kind: kind, fileName: f.name, folderId: folderId, footprint: fp.footprint, bbox: fp.bbox }, blob);
        S.cartes.push(c); done.push(c);
      } catch (err) {
        var msg = err && err.name === 'QuotaExceededError' ? 'espace de stockage insuffisant sur l\'appareil' : (err && err.message || String(err));
        await confirmSheet('Import impossible', f.name + ' : ' + msg, 'OK');
      }
    }
    toast(done.length ? done.length + ' carte' + (done.length > 1 ? 's importées' : ' importée') : 'Aucune carte importée');
    renderLib();
    if (done.length === 1) sheetOptions('Carte importée', done[0].name, [{ label: 'Ouvrir maintenant', icon: 'map', cls: 'primary', fn: function () { openMap(done[0].id); } }, { label: 'Rester dans la bibliothèque', fn: function () {} }], true);
  }
  async function moveCarteSheet(c) {
    var opts = S.folders.map(function (f) { return { label: f.name, icon: 'folder', cls: f.id === c.folderId ? 'primary' : '', fn: async function () { c.folderId = f.id; await NavDB.saveCarte(c); renderLib(); toast('Déplacée dans « ' + f.name + ' »'); } }; });
    opts.push({ label: 'Sans dossier', icon: 'map', fn: async function () { c.folderId = null; await NavDB.saveCarte(c); renderLib(); } });
    opts.push({ label: 'Nouveau dossier…', icon: 'plus', fn: async function () { var n = await askText('Nouveau dossier', '', 'Nom du dossier'); if (!n) return; var f = await NavDB.saveFolder({ name: n }); S.folders.push(f); c.folderId = f.id; await NavDB.saveCarte(c); renderLib(); } });
    sheetOptions('Déplacer « ' + c.name + ' »', 'Choisissez le dossier :', opts);
  }

  // ══════════════ Carte en navigation ══════════════
  function ensureMap() {
    if (S.map) return;
    S.map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 120, maxZoom: 21, minZoom: 6 });
    S.map.setView([48.15, -68.6], 12);
    S.trGroup = L.layerGroup().addTo(S.map);
    S.wpGroup = L.layerGroup().addTo(S.map);
    S.map.on('zoomend', function () { $('#map').classList.toggle('labels', S.map.getZoom() >= 15.5); });
    S.map.on('dragstart', function () { if (S.follow) setFollow(false); });
    S.map.on('move', onMapMove);
  }
  function openMapDefault() {
    if (S.carte) { openMap(S.carte.id); return; }
    if (!S.cartes.length) { toast('Importez d\'abord une carte'); showTab('cartes'); return; }
    NavDB.getMeta('lastCarteId').then(function (id) {
      var c = (id && carteById(id)) || (S.pos && cartesAt(S.pos.lat, S.pos.lon)[0]) || S.cartes.slice().sort(function (a, b) { return (b.lastOpened || '').localeCompare(a.lastOpened || ''); })[0];
      openMap(c.id);
    });
  }
  async function openMap(id, opts) {
    opts = opts || {};
    var c = carteById(id); if (!c) { toast('Carte introuvable'); return; }
    if (!$('#view-map').classList.contains('active')) S.prevTab = S.tab;
    ['cartes', 'points', 'apercu', 'reglages'].forEach(function (v) { $('#view-' + v).classList.remove('active'); });
    $('#view-map').classList.add('active'); document.body.classList.add('mapmode');
    ensureMap(); S.map.invalidateSize();
    if (!S.carte || S.carte.id !== id || !S.carteLayer) {
      if (S.carteLayer) { S.map.removeLayer(S.carteLayer); S.carteLayer = null; }
      S.carte = c; S.edgeTarget = null; $('#edge-banner').classList.add('hidden');
      var blob = await NavDB.getCarteBlob(id);
      if (!blob) { toast('Fichier de carte introuvable'); return; }
      var keep = true;
      if (opts.center) S.map.setView(opts.center, opts.zoom || Math.max(S.map.getZoom(), 15));
      else if (S.pos && covers(c, S.pos.lat, S.pos.lon)) S.map.setView([S.pos.lat, S.pos.lon], 15);
      else if (c.bbox) S.map.fitBounds([[c.bbox[1], c.bbox[0]], [c.bbox[3], c.bbox[2]]]);
      else keep = false;
      toast('Ouverture de « ' + c.name + ' »…', 8000);
      var ab = await blob.arrayBuffer();
      if (S.carte !== c) return; // une autre carte a été demandée entre-temps
      S.carteLayer = window.createTiffLayer(ab, { keepView: keep,
        onReady: function () { toast('« ' + c.name + ' » prête'); },
        onError: function (m) { toast('Erreur de carte : ' + m, 6000); } });
      S.carteLayer.addTo(S.map);
      c.lastOpened = new Date().toISOString(); NavDB.saveCarte(c);
      NavDB.setMeta('lastCarteId', id);
    } else if (opts.center) S.map.setView(opts.center, opts.zoom || Math.max(S.map.getZoom(), 15));
    NavDB.setMeta('lastView', 'map');
    renderOverlays(); updateMapHeader(); updatePosMarker(); updateCoordsBar(); updateNav(); updateRec();
  }
  function updateMapHeader() {
    if (!S.carte) return;
    $('#m-carte-name').textContent = S.carte.name;
    var ref = S.pos && covers(S.carte, S.pos.lat, S.pos.lon) ? S.pos : (S.map ? ll(S.map.getCenter()) : null);
    var others = ref ? cartesAt(ref.lat, ref.lon).filter(function (x) { return x.id !== S.carte.id; }).length : 0;
    $('#m-carte-sub').textContent = others ? '+' + others + ' autre' + (others > 1 ? 's cartes' : ' carte') + ' ici' : 'Changer de carte';
    $('#m-count').textContent = S.wps.filter(function (w) { return layerVisible(w.layerId); }).length + ' points';
  }
  var _hdrT = null;
  function onMapMove() {
    if (S.mire) updateMire();
    clearTimeout(_hdrT); _hdrT = setTimeout(updateMapHeader, 300);
  }
  function renderOverlays() {
    if (!S.map) return;
    S.wpGroup.clearLayers(); S.trGroup.clearLayers();
    S.traces.forEach(function (t) {
      if (!layerVisible(t.layerId) || !t.points || t.points.length < 2) return;
      L.polyline(t.points.map(function (p) { return [p.lat, p.lon]; }), { color: t.color || '#ff3d00', weight: t.weight || 4, opacity: .9 })
        .on('click', function () { traceMenu(t); }).addTo(S.trGroup);
    });
    S.wps.forEach(function (w) {
      if (!layerVisible(w.layerId)) return;
      var icon = L.divIcon({ className: '', html: '<div class="wp-icon' + (S.navTarget === w.id ? ' target' : '') + '">' + shapeSvg(w.shape, w.color, 28) + '<div class="wp-label">' + esc(w.name) + '</div></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([w.lat, w.lon], { icon: icon, keyboard: false }).on('click', function () { if (S.mire) return; openWp(w.id, 'map'); }).addTo(S.wpGroup);
    });
    if (S.tracing && S.traceLine) S.traceLine.addTo(S.map);
    updateMapHeader();
  }
  function updatePosMarker() {
    if (!S.map || !S.pos) return;
    var p = [S.pos.lat, S.pos.lon];
    if (!S.posMarker) {
      S.posCircle = L.circle(p, { radius: S.acc || 10, color: '#2F7DF6', fillColor: '#2F7DF6', fillOpacity: .1, weight: 1, interactive: false }).addTo(S.map);
      S.posMarker = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="pos-marker"><div class="pos-head hidden"></div></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(S.map);
    } else { S.posMarker.setLatLng(p); S.posCircle.setLatLng(p).setRadius(S.acc || 10); }
    var h = S.compassOn && S.heading != null ? S.heading : (S.speed > 1 && S.course != null ? S.course : null), el = S.posMarker.getElement();
    var head = el && el.querySelector('.pos-head');
    if (head) { head.classList.toggle('hidden', h == null); if (h != null) head.style.transform = 'rotate(' + h + 'deg)'; }
  }
  function updateCoordsBar() {
    if (!S.pos) { $('#m-coords').textContent = 'Position GPS en attente…'; $('#m-acc').textContent = ''; return; }
    if (!(S.mire === 'measure')) $('#m-coords').textContent = fmtLL(S.pos.lat, S.pos.lon);
    $('#m-acc').textContent = '±' + Math.round(S.acc) + ' m';
    $('#m-speed').textContent = S.speed != null && S.speed > 0.3 ? num(S.speed, 1) + ' km/h' : '';
    $('#m-head').textContent = S.course != null && S.speed > 0.3 ? 'direction ' + deg(S.course) : '';
  }
  function setFollow(on) {
    S.follow = on; $('#m-follow').classList.toggle('on', on);
    if (on) { if (!S.pos) { toast('Pas encore de position GPS'); S.follow = false; $('#m-follow').classList.remove('on'); return; } S.map.setView([S.pos.lat, S.pos.lon], Math.max(S.map.getZoom(), 15)); }
  }
  function checkEdge() {
    if (!S.carte || !S.pos || !S.carte.footprint || !$('#view-map').classList.contains('active')) return;
    var b = $('#edge-banner');
    if (covers(S.carte, S.pos.lat, S.pos.lon)) { b.classList.add('hidden'); S.edgeTarget = null; return; }
    var alt = cartesAt(S.pos.lat, S.pos.lon)[0];
    if (!alt || S.edgeDismissed[alt.id]) { b.classList.add('hidden'); return; }
    S.edgeTarget = alt.id;
    $('#edge-text').textContent = 'Vous êtes hors de cette carte. « ' + alt.name + ' » couvre votre position.';
    b.classList.remove('hidden');
  }

  // ── GPS ──
  function startGPS() {
    if (!navigator.geolocation) { $('#gps-status').textContent = 'GPS non disponible'; return; }
    if (S.gpsId != null) navigator.geolocation.clearWatch(S.gpsId);
    S.gpsId = navigator.geolocation.watchPosition(onGPS, function (err) {
      $('#gps-status').textContent = err.code === 1 ? 'GPS refusé' : 'GPS : pas de signal';
      if (err.code === 1) toast('Accès à la position refusé — vérifiez les réglages de l\'appareil', 5000);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }
  function onGPS(pos) {
    var c = pos.coords, lat = c.latitude, lon = c.longitude, now = pos.timestamp, spd = null, hdg = null;
    if (c.speed != null && c.speed >= 0) spd = c.speed * 3.6;
    if (c.heading != null && c.heading >= 0 && !isNaN(c.heading)) hdg = c.heading;
    if (S.prevGPS && (spd === null || hdg === null)) {
      var dt = (now - S.prevGPS.t) / 1000;
      if (dt > 0.5) { var d = hav(S.prevGPS, { lat: lat, lon: lon }); if (spd === null) spd = d / dt * 3.6; if (hdg === null && d > 2) hdg = bearing(S.prevGPS, { lat: lat, lon: lon }); }
    }
    S.prevGPS = { lat: lat, lon: lon, t: now };
    var moved = !S.lastHereRender || hav(S.lastHereRender, { lat: lat, lon: lon }) > 30;
    S.pos = { lat: lat, lon: lon }; S.acc = c.accuracy; S.speed = spd; S.course = hdg;
    $('#gps-status').innerHTML = '<span class="ok">GPS ±' + Math.round(c.accuracy) + ' m</span>';
    if (S.tracing) {
      var last = S.tracePts[S.tracePts.length - 1];
      if (!last || hav(last, S.pos) > 1 || c.accuracy < 15) { S.tracePts.push({ lat: lat, lon: lon, t: new Date(now).toISOString() }); if (S.traceLine) S.traceLine.addLatLng([lat, lon]); }
      if (S.tracePts.length - S.traceSaved >= 10) persistTrace();
    }
    updatePosMarker(); updateCoordsBar(); updateNav();
    if (S.follow && S.map) S.map.panTo([lat, lon], { animate: true });
    if (moved) {
      S.lastHereRender = S.pos;
      if ($('#view-cartes').classList.contains('active') && !S.libQuery) renderLib();
      if ($('#view-apercu').classList.contains('active')) renderOvSheet();
      checkEdge(); updateMapHeader();
    }
    if (S.ov && S.ovPos) S.ovPos.setLatLng([lat, lon]);
    if (S.wpOpen != null && $('#view-wp').classList.contains('active')) updateWpLive();
  }

  // ── Boussole ──
  function onHeading(e) {
    var h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute' ? (360 - (e.alpha || 0)) % 360 : null);
    if (h == null) return;
    S.heading = h; $('#m-compass-lbl').textContent = deg(h);
    updatePosMarker(); updateNav();
  }
  function compassEvent() { return 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'; }
  async function toggleCompass() {
    if (S.compassOn) {
      window.removeEventListener(compassEvent(), onHeading); S.compassOn = false; S.heading = null;
      $('#m-compass').classList.remove('on'); $('#m-compass-lbl').textContent = 'N'; updatePosMarker(); updateNav(); return;
    }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        var r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Permission boussole refusée'); return; }
      }
      window.addEventListener(compassEvent(), onHeading);
      S.compassOn = true; $('#m-compass').classList.add('on'); toast('Boussole activée — la carte reste nord en haut');
    } catch (err) { toast('Boussole indisponible : ' + err.message); }
  }

  // ── Navigation vers un point ──
  function startNav(id) {
    S.navTarget = id; renderOverlays(); updateNav(); keepAwake();
    var w = wpById(id); if (w) toast('Navigation vers « ' + w.name + ' »');
  }
  function stopNav() { S.navTarget = null; $('#nav-banner').classList.add('hidden'); renderOverlays(); keepAwake(); }
  function updateNav() {
    var b = $('#nav-banner');
    if (!S.navTarget) { b.classList.add('hidden'); return; }
    var w = wpById(S.navTarget); if (!w) { stopNav(); return; }
    b.classList.remove('hidden');
    $('#nav-name').textContent = 'Vers · ' + w.name;
    if (!S.pos) { $('#nav-dist').textContent = '—'; $('#nav-sub').textContent = 'en attente du GPS'; return; }
    var d = hav(S.pos, w), br = bearing(S.pos, w);
    $('#nav-dist').textContent = fmtDist(d);
    var eta = S.speed > 0.5 ? ' · ≈ ' + Math.max(1, Math.round(d / 1000 / S.speed * 60)) + ' min' : '';
    $('#nav-sub').textContent = 'cap ' + deg(br) + eta;
    var ref = S.compassOn && S.heading != null ? S.heading : (S.speed > 1 && S.course != null ? S.course : 0);
    $('#nav-arrow').style.transform = 'rotate(' + ((br - ref + 360) % 360) + 'deg)';
    if (d < 10 && !S._arrived) { S._arrived = true; toast('Arrivé à « ' + w.name + ' »', 4000); if (navigator.vibrate) navigator.vibrate(300); }
    if (d > 25) S._arrived = false;
  }

  // ── Écran allumé pendant un tracé ou une navigation ──
  async function keepAwake() {
    var want = S.tracing || !!S.navTarget;
    try {
      if (want && !S.wakeLock && navigator.wakeLock) { S.wakeLock = await navigator.wakeLock.request('screen'); S.wakeLock.addEventListener('release', function () { S.wakeLock = null; }); }
      if (!want && S.wakeLock) { await S.wakeLock.release(); S.wakeLock = null; }
    } catch (e) { /* non pris en charge : sans conséquence */ }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') keepAwake(); else if (S.tracing) persistTrace(); });

  // ── Tracé ──
  function traceDist(pts) { var d = 0; for (var i = 1; i < pts.length; i++) d += hav(pts[i - 1], pts[i]); return d; }
  function startTrace() {
    S.tracing = true; S.tracePts = []; S.traceStart = Date.now(); S.traceSaved = 0;
    if (S.pos) S.tracePts.push({ lat: S.pos.lat, lon: S.pos.lon, t: new Date().toISOString() });
    S.traceLine = L.polyline(S.tracePts.map(function (p) { return [p.lat, p.lon]; }), { color: '#FF3D00', weight: 5, opacity: .95 }).addTo(S.map);
    S.traceTimer = setInterval(updateRec, 1000);
    updateRec(); keepAwake(); toast('Tracé démarré');
  }
  function updateRec() {
    var on = S.tracing; $('#rec-banner').classList.toggle('hidden', !on); $('#m-trace').classList.toggle('rec', on);
    if (!on) { $('#m-trace-lbl').textContent = 'Tracé'; return; }
    var el = Math.floor((Date.now() - S.traceStart) / 1000), d = traceDist(S.tracePts);
    var mm = Math.floor(el / 60), ss = el % 60, h = Math.floor(mm / 60);
    var dur = (h ? h + ':' + String(mm % 60).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
    $('#rec-info').textContent = 'Tracé · ' + dur + ' · ' + fmtDist(d) + (el > 0 && d > 0 ? ' · moy. ' + num(d / el * 3.6, 1) + ' km/h' : '');
    $('#m-trace-lbl').innerHTML = '<span class="mono">' + esc(fmtDist(d)) + '</span>';
  }
  function persistTrace() { if (!S.tracing) return; S.traceSaved = S.tracePts.length; NavDB.setMeta('traceEnCours', { start: S.traceStart, pts: S.tracePts }); }
  async function finishTrace(save) {
    clearInterval(S.traceTimer); S.traceTimer = null; S.tracing = false;
    if (S.traceLine) { S.map.removeLayer(S.traceLine); S.traceLine = null; }
    var pts = S.tracePts.slice(); S.tracePts = [];
    await NavDB.setMeta('traceEnCours', null);
    updateRec(); keepAwake();
    if (!save) { toast('Tracé supprimé'); return; }
    if (pts.length < 2) { toast('Tracé trop court — pas enregistré'); return; }
    await saveTracePts(pts, S.traceStart);
  }
  async function saveTracePts(pts, start) {
    var lid = await ensureActiveLayer(), n = S.traces.length + 1;
    var name = await askText('Nom du tracé', 'Tracé ' + n + ' – ' + fmtDay(new Date(start || Date.now()).toISOString()));
    var t = { id: Date.now(), layerId: lid, name: name || ('Tracé ' + n), points: pts, timestamp: new Date(start || Date.now()).toISOString(), color: (layerById(lid) || {}).color || '#ff3d00', weight: 4 };
    await NavDB.saveTrace(t); S.traces.push(t); renderOverlays();
    toast('« ' + t.name + ' » enregistré — ' + fmtDist(traceDist(pts)));
  }

  // ── Mire : placer, déplacer, mesurer ──
  function enterMire(mode) {
    exitMire(); S.mire = mode;
    $('#mire').classList.remove('hidden'); $('#mire-bar').classList.remove('hidden'); $('#map-bottom').classList.add('hidden');
    var b = $('#mire-btns');
    if (mode === 'wp') b.innerHTML = '<button class="btn" data-act="exitMire">Annuler</button><button class="btn primary" data-act="mireWp">' + ic('pin') + 'Placer ici</button>';
    if (mode === 'move') b.innerHTML = '<button class="btn" data-act="exitMire">Annuler</button><button class="btn primary" data-act="mireMove">' + ic('move') + 'Déplacer ici</button>';
    if (mode === 'measure') { S.measurePts = []; b.innerHTML = '<button class="btn" data-act="measureUndo" aria-label="Retirer le dernier point">' + ic('undo') + '</button><button class="btn primary" data-act="measureAdd">' + ic('plus') + 'Point</button><button class="btn" data-act="exitMire">Terminer</button>'; $('#m-measure').classList.add('on'); }
    updateMire();
  }
  function exitMire() {
    if (!S.mire) return;
    S.measureLayers.forEach(function (l) { S.map.removeLayer(l); }); S.measureLayers = []; S.measurePts = [];
    if (S.elastic) { S.map.removeLayer(S.elastic); S.elastic = null; }
    S.mire = null; S.movingWp = null;
    $('#mire').classList.add('hidden'); $('#mire-bar').classList.add('hidden'); $('#map-bottom').classList.remove('hidden'); $('#m-measure').classList.remove('on');
    updateCoordsBar();
  }
  function updateMire() {
    if (!S.mire || !S.map) return;
    var c = ll(S.map.getCenter()), info = fmtLL(c.lat, c.lon);
    if (S.mire === 'measure') {
      var pts = S.measurePts, tot = traceDist(pts);
      if (pts.length) {
        var seg = hav(pts[pts.length - 1], c);
        info = 'Total ' + fmtDist(tot + seg) + ' · segment ' + fmtDist(seg) + (pts.length >= 2 ? ' · aire ' + num(areaHa(pts.concat([c])), 2) + ' ha' : '');
        var a = [pts[pts.length - 1].lat, pts[pts.length - 1].lon];
        if (!S.elastic) S.elastic = L.polyline([a, [c.lat, c.lon]], { color: '#FFB547', weight: 2, dashArray: '4 6', interactive: false }).addTo(S.map);
        else S.elastic.setLatLngs([a, [c.lat, c.lon]]);
      } else info = 'Placez la mire sur le premier point, puis « Point »';
    } else if (S.mire === 'move') info = 'Nouvel emplacement : ' + info;
    $('#mire-info').textContent = info;
  }
  function measureAdd() {
    var c = ll(S.map.getCenter()), pts = S.measurePts;
    pts.push(c);
    S.measureLayers.push(L.circleMarker([c.lat, c.lon], { radius: 6, color: '#111', fillColor: '#FFB547', fillOpacity: 1, weight: 2, interactive: false }).addTo(S.map));
    if (pts.length > 1) {
      var p = pts[pts.length - 2];
      S.measureLayers.push(L.polyline([[p.lat, p.lon], [c.lat, c.lon]], { color: '#FFB547', weight: 3, interactive: false }).addTo(S.map));
      S.measureLayers.push(L.marker([(p.lat + c.lat) / 2, (p.lon + c.lon) / 2], { icon: L.divIcon({ className: 'measure-label', html: fmtDist(hav(p, c)), iconAnchor: [0, 10] }), interactive: false }).addTo(S.map));
    }
    if (S.elastic) { S.map.removeLayer(S.elastic); S.elastic = null; }
    updateMire();
  }
  function measureUndo() {
    if (!S.measurePts.length) return;
    var n = S.measurePts.length === 1 ? 1 : 3;
    S.measurePts.pop();
    for (var i = 0; i < n; i++) { var l = S.measureLayers.pop(); if (l) S.map.removeLayer(l); }
    if (S.elastic) { S.map.removeLayer(S.elastic); S.elastic = null; }
    updateMire();
  }

  // ══════════════ Fiche d'un point ══════════════
  function cartesFor(w) { return S.cartes.filter(function (c) { return covers(c, w.lat, w.lon); }); }
  async function openWp(id, from) {
    var w = wpById(id); if (!w) return;
    S.wpOpen = id; S.wpReturn = from || S.wpReturn || 'points';
    $('#view-wp').classList.add('active');
    var cat = CAT[w.cat] || CAT.observation, l = layerById(w.layerId), cs = cartesFor(w);
    $('#wp-body').innerHTML =
      '<div class="photos" id="wp-photos" style="margin-top:8px">' + (w.photoIds || []).map(function () { return '<div class="photo"></div>'; }).join('') + '</div>' +
      '<h2 style="margin:14px 0 8px;font-size:26px;line-height:1.15;-webkit-user-select:text;user-select:text">' + esc(w.name) + '</h2>' +
      '<div class="wrap" style="margin-bottom:14px"><span class="chip">' + shapeSvg(w.shape, w.color, 18) + esc(cat.label) + '</span>' +
      (l ? '<span class="chip"><span class="dot" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + '</span>' : '<span class="chip">Sans calque</span>') + '</div>' +
      '<div class="tiles" style="margin-bottom:14px"><div class="tile"><span>Distance</span><b id="wp-dist">—</b></div><div class="tile"><span>Cap</span><b id="wp-cap">—</b></div></div>' +
      '<dl class="kv"><dt>Position</dt><dd class="mono">' + fmtLL(w.lat, w.lon) + '</dd><dt>Décimal</dt><dd class="mono" style="-webkit-user-select:text;user-select:text">' + w.lat.toFixed(6) + ', ' + w.lon.toFixed(6) + '</dd>' +
      '<dt>Créé</dt><dd>' + esc(fmtDate(w.timestamp)) + '</dd><dt>Cartes</dt><dd>' + (cs.length ? 'Visible sur ' + cs.length + ' carte' + (cs.length > 1 ? 's' : '') + ' : ' + esc(cs.map(function (c) { return c.name; }).join(', ')) : 'Hors de vos cartes') + '</dd></dl>' +
      (w.comment ? '<div class="note" style="margin-top:14px">' + esc(w.comment) + '</div>' : '');
    updateWpLive();
    var photos = await NavDB.getPhotos(w);
    if (S.wpOpen !== id) return;
    $('#wp-photos').innerHTML = photos.map(function (p) { return '<button class="photo" data-act="viewPhoto" data-src="' + esc(p.id) + '"><img src="' + p.data + '" alt="Photo du point"></button>'; }).join('');
  }
  function updateWpLive() {
    var w = wpById(S.wpOpen); if (!w || !$('#wp-dist')) return;
    if (!S.pos) { $('#wp-dist').textContent = '—'; $('#wp-cap').textContent = '—'; return; }
    $('#wp-dist').textContent = fmtDist(hav(S.pos, w)); $('#wp-cap').textContent = deg(bearing(S.pos, w));
  }
  function closeWp() {
    $('#view-wp').classList.remove('active'); S.wpOpen = null;
    if (S.wpReturn === 'points' && !$('#view-map').classList.contains('active')) renderPoints();
  }
  function bestCarteFor(lat, lon) {
    if (S.carte && covers(S.carte, lat, lon)) return S.carte;
    return cartesAt(lat, lon)[0] || S.carte || S.cartes[0];
  }
  async function showOnMap(lat, lon, then) {
    var c = bestCarteFor(lat, lon);
    if (!c) { toast('Importez d\'abord une carte'); return; }
    closeWp(); await openMap(c.id, { center: [lat, lon], zoom: 16 });
    if (then) then();
  }
  async function shareWp(w) {
    var text = w.name + '\n' + w.lat.toFixed(6) + ', ' + w.lon.toFixed(6) + (w.comment ? '\n' + w.comment : '') + '\nhttps://www.google.com/maps?q=' + w.lat.toFixed(6) + ',' + w.lon.toFixed(6);
    var files = [];
    try {
      var photos = await NavDB.getPhotos(w);
      files = photos.map(function (p, i) { var b = atob(p.data.split(',')[1]), u = new Uint8Array(b.length); for (var k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return new File([u], 'photo_' + (i + 1) + '.jpg', { type: 'image/jpeg' }); });
    } catch (e) { files = []; }
    var data = { title: w.name, text: text };
    if (files.length && navigator.canShare && navigator.canShare({ files: files })) data.files = files;
    if (navigator.share) { try { await navigator.share(data); } catch (e) { if (e.name !== 'AbortError') toast('Partage impossible : ' + e.message); } }
    else { try { await navigator.clipboard.writeText(text); toast('Coordonnées copiées'); } catch (e) { toast(text, 6000); } }
  }

  // ══════════════ Formulaire d'un point ══════════════
  async function openWpForm(wp, latlng) {
    var lid = wp ? wp.layerId : await ensureActiveLayer();
    var base = wp ? Object.assign({}, wp) : { name: 'WP-' + (S.wps.length + 1), comment: '', cat: 'observation', shape: 'circle', color: CAT.observation.color, layerId: lid, lat: latlng.lat, lon: latlng.lon };
    var photos = wp ? (await NavDB.getPhotos(wp)).map(function (p) { return { id: p.id, data: p.data }; }) : [];
    S.form = { edit: !!wp, wp: base, photos: photos, removed: [], coordFmt: 'dd', showCoords: !!(latlng && latlng.manual) };
    $('#wpf-title').textContent = wp ? 'Modifier le point' : 'Nouveau point';
    $('#view-wpform').classList.add('active');
    renderWpForm();
  }
  function syncForm() {
    var f = S.form; if (!f) return;
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g('wpf-name') != null) f.wp.name = g('wpf-name');
    if (g('wpf-comment') != null) f.wp.comment = g('wpf-comment');
    if (g('wpf-layer') != null && g('wpf-layer') !== '__new') f.wp.layerId = g('wpf-layer') || null;
    if (g('wpf-color') != null) f.wp.color = g('wpf-color');
  }
  function dmsInputs(prefix, v, posL, negL) {
    var a = Math.abs(v || 0), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
    return '<div style="display:grid;grid-template-columns:1fr 1fr 1.3fr 1fr;gap:6px"><input class="input" id="' + prefix + '-d" inputmode="numeric" value="' + d + '" aria-label="degrés">' +
      '<input class="input" id="' + prefix + '-m" inputmode="numeric" value="' + m + '" aria-label="minutes"><input class="input" id="' + prefix + '-s" inputmode="decimal" value="' + s.toFixed(2) + '" aria-label="secondes">' +
      '<select class="input" id="' + prefix + '-h" aria-label="hémisphère"><option' + ((v || 0) >= 0 ? ' selected' : '') + '>' + posL + '</option><option' + ((v || 0) < 0 ? ' selected' : '') + '>' + negL + '</option></select></div>';
  }
  function renderWpForm() {
    var f = S.form, w = f.wp, html = '';
    html += '<label class="field"><span>Nom</span><input class="input" id="wpf-name" maxlength="60" value="' + esc(w.name) + '"></label>';
    html += '<label class="field"><span>Calque</span><select class="input" id="wpf-layer" data-act-change="layerSelect">' + S.layers.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === w.layerId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '<option value="__new">+ Nouveau calque…</option></select></label>';
    html += '<div class="field"><span>Catégorie</span><div class="wrap">' + CATS.map(function (c) { return '<button class="chip cat' + (w.cat === c.id ? ' on' : '') + '" data-act="fCat" data-id="' + c.id + '"><span class="dot" style="background:' + c.color + '"></span>' + c.label + '</button>'; }).join('') + '</div></div>';
    html += '<div class="field"><span>Symbole</span><div class="wrap">' + SHAPES.map(function (s) { return '<button class="sym' + (w.shape === s ? ' on' : '') + '" data-act="fShape" data-id="' + s + '" aria-label="' + s + '">' + shapeSvg(s, w.color, 26) + '</button>'; }).join('') +
      '<label class="sym" style="position:relative;overflow:hidden" aria-label="Couleur"><span style="width:28px;height:28px;border-radius:14px;background:' + esc(w.color) + ';border:2px solid #fff"></span><input type="color" id="wpf-color" value="' + esc(w.color) + '" data-act-change="fColor" style="position:absolute;inset:0;opacity:0"></label></div></div>';
    html += '<div class="field"><span>Photos</span><div class="photos">' + f.photos.map(function (p, i) { return '<div class="photo"><img src="' + p.data + '" alt=""><button class="del" data-act="fPhotoDel" data-i="' + i + '" aria-label="Retirer la photo">' + ic('x', 'sm') + '</button></div>'; }).join('') +
      '<button class="photo-add" data-act="fPhotoAdd">' + ic('camera') + 'Ajouter</button></div></div>';
    html += '<label class="field"><span>Commentaire</span><textarea class="input" id="wpf-comment" rows="3">' + esc(w.comment) + '</textarea></label>';
    html += '<div class="field"><span>Position</span><div class="mono" style="font-size:16px">' + fmtLL(w.lat, w.lon) + '</div>';
    if (!f.showCoords) html += '<button class="btn" style="margin-top:6px" data-act="fCoords">' + ic('edit', 'sm') + 'Entrer des coordonnées</button>';
    else {
      html += '<div class="seg" style="margin:8px 0"><button class="' + (f.coordFmt === 'dd' ? 'on' : '') + '" data-act="fFmt" data-id="dd">Degrés décimaux</button><button class="' + (f.coordFmt === 'dms' ? 'on' : '') + '" data-act="fFmt" data-id="dms">Degrés min. sec.</button></div>';
      if (f.coordFmt === 'dd') html += '<div class="grid2"><input class="input mono" id="wpf-lat" inputmode="decimal" value="' + w.lat.toFixed(6) + '" aria-label="Latitude"><input class="input mono" id="wpf-lon" inputmode="decimal" value="' + w.lon.toFixed(6) + '" aria-label="Longitude"></div>';
      else html += '<div style="display:flex;flex-direction:column;gap:6px"><span class="muted" style="font-size:13px">Latitude</span>' + dmsInputs('wpf-la', w.lat, 'N', 'S') + '<span class="muted" style="font-size:13px">Longitude</span>' + dmsInputs('wpf-lo', w.lon, 'E', 'O') + '</div>';
      html += '<button class="btn" style="margin-top:8px" data-act="fCoordsApply">' + ic('check', 'sm') + 'Appliquer ces coordonnées</button>';
    }
    html += '</div>';
    $('#wpf-body').innerHTML = html;
  }
  function readCoords() {
    var f = S.form, lat, lon;
    if (f.coordFmt === 'dd') { lat = parseFloat(String($('#wpf-lat').value).replace(',', '.')); lon = parseFloat(String($('#wpf-lon').value).replace(',', '.')); }
    else {
      var v = function (id) { return parseFloat(String($('#' + id).value).replace(',', '.')) || 0; };
      lat = (v('wpf-la-d') + v('wpf-la-m') / 60 + v('wpf-la-s') / 3600) * ($('#wpf-la-h').value === 'S' ? -1 : 1);
      lon = (v('wpf-lo-d') + v('wpf-lo-m') / 60 + v('wpf-lo-s') / 3600) * ($('#wpf-lo-h').value === 'O' ? -1 : 1);
    }
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { toast('Coordonnées invalides'); return false; }
    f.wp.lat = lat; f.wp.lon = lon; return true;
  }
  async function saveWpForm() {
    syncForm();
    var f = S.form, w = f.wp;
    if (f.showCoords && !readCoords()) return;
    w.name = (w.name || '').trim() || ('WP-' + (S.wps.length + 1)); w.comment = (w.comment || '').trim();
    if (!f.edit) { w.id = Date.now(); w.timestamp = new Date().toISOString(); w.photoIds = []; }
    for (var i = 0; i < f.removed.length; i++) await NavDB.deletePhoto(f.removed[i]);
    var ids = [];
    for (var j = 0; j < f.photos.length; j++) { var p = f.photos[j]; ids.push(p.id || await NavDB.addPhoto(w.id, p.data)); }
    w.photoIds = ids;
    delete w.photos;
    await NavDB.saveWaypoint(w);
    var k = S.wps.findIndex(function (x) { return x.id === w.id; });
    if (k >= 0) S.wps[k] = w; else S.wps.push(w);
    if (w.layerId) { S.activeLayerId = w.layerId; NavDB.setMeta('activeLayerId', w.layerId); }
    $('#view-wpform').classList.remove('active'); S.form = null;
    renderOverlays(); toast('« ' + w.name + ' » enregistré');
    if (f.edit && S.wpOpen === w.id) openWp(w.id);
    else if ($('#view-points').classList.contains('active')) renderPoints();
  }
  function resizePhoto(file) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var max = 1200, w = img.width, h = img.height;
          if (w > max || h > max) { if (w >= h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
          var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
          res(c.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = function () { res(null); };
        img.src = ev.target.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ══════════════ Points et tracés ══════════════
  function renderPoints() {
    var html = '<div class="section-h"><h2>Calques</h2><button class="btn" style="min-height:44px" data-act="newLayer">' + ic('plus', 'sm') + 'Nouveau</button></div>';
    if (!S.layers.length) html += '<div class="empty" style="padding:14px">Aucun calque. Il sera créé avec votre premier point.</div>';
    else {
      html += '<div class="list">' + S.layers.map(function (l) {
        var nw = S.wps.filter(function (w) { return w.layerId === l.id; }).length, nt = S.traces.filter(function (t) { return t.layerId === l.id; }).length, vis = l.visible !== false;
        return '<div class="row"><span class="dot" style="width:18px;height:18px;border-radius:9px;background:' + esc(l.color) + '"></span><span class="main"><span class="t">' + esc(l.name) + (S.activeLayerId === l.id ? ' <span class="badge">actif</span>' : '') + '</span><span class="s">' + pl(nw, 'point') + ' · ' + pl(nt, 'tracé') + '</span></span>' +
          '<button class="more" data-act="layerVis" data-id="' + esc(l.id) + '" aria-label="' + (vis ? 'Masquer' : 'Afficher') + ' le calque" style="color:' + (vis ? 'var(--text)' : 'var(--muted)') + '">' + ic(vis ? 'eye' : 'eyeoff') + '</button>' +
          '<button class="more" data-act="layerMenu" data-id="' + esc(l.id) + '" aria-label="Actions du calque">' + ic('more') + '</button></div>';
      }).join('') + '</div>';
    }
    html += '<div class="seg" style="margin:18px 0 10px"><button class="' + (S.ptsMode === 'points' ? 'on' : '') + '" data-act="ptsMode" data-id="points">Points (' + S.wps.length + ')</button><button class="' + (S.ptsMode === 'traces' ? 'on' : '') + '" data-act="ptsMode" data-id="traces">Tracés (' + S.traces.length + ')</button></div>';
    if (S.ptsMode === 'points') {
      html += '<label class="search" style="margin:0 0 8px">' + ic('search', 'sm muted') + '<span class="sr">Rechercher</span><input type="search" id="pts-search" placeholder="Rechercher un point" value="' + esc(S.ptsQuery) + '" autocomplete="off"></label>';
      html += '<div class="chips"><button class="chip' + (!S.ptsCat ? ' on' : '') + '" data-act="ptsCat" data-id="">Tous</button>' + CATS.map(function (c) { return '<button class="chip' + (S.ptsCat === c.id ? ' on' : '') + '" data-act="ptsCat" data-id="' + c.id + '"><span class="dot" style="background:' + c.color + '"></span>' + c.label + '</button>'; }).join('') + '</div>';
    }
    html += '<div id="pts-list" style="margin-top:6px"></div>';
    $('#pts-body').innerHTML = html;
    renderPtsList();
  }
  function renderPtsList() {
    var box = $('#pts-list'); if (!box) return;
    if (S.ptsMode === 'traces') {
      var ts = S.traces.slice().sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
      box.innerHTML = ts.length ? '<div class="list">' + ts.map(function (t) {
        var l = layerById(t.layerId);
        return '<div class="row"><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M3 20c5-10 9 2 13-8s5-6 7-8" fill="none" stroke="' + esc(t.color || '#ff3d00') + '" stroke-width="4" stroke-linecap="round"/></svg><span class="main"><span class="t">' + esc(t.name || 'Tracé') + '</span><span class="s">' + fmtDist(traceDist(t.points || [])) + ' · ' + esc(fmtDay(t.timestamp)) + (l ? ' · ' + esc(l.name) : '') + '</span></span>' +
          '<button class="more" data-act="traceMenu" data-id="' + t.id + '" aria-label="Actions du tracé">' + ic('more') + '</button></div>';
      }).join('') + '</div>' : '<div class="empty">Aucun tracé. Lancez-en un avec le bouton <b>Tracé</b> sur la carte.</div>';
      return;
    }
    var q = S.ptsQuery.trim().toLowerCase();
    var ws = S.wps.filter(function (w) { return (!S.ptsCat || (w.cat || 'observation') === S.ptsCat) && (!q || (w.name || '').toLowerCase().indexOf(q) >= 0 || (w.comment || '').toLowerCase().indexOf(q) >= 0); });
    if (S.pos) ws.sort(function (a, b) { return hav(S.pos, a) - hav(S.pos, b); }); else ws.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
    var shown = ws.slice(0, 300);
    box.innerHTML = shown.length ? '<div class="list">' + shown.map(function (w) {
      var l = layerById(w.layerId), c = CAT[w.cat] || CAT.observation;
      return '<button class="row" data-act="openWp" data-id="' + w.id + '">' + shapeSvg(w.shape, w.color, 26) + '<span class="main"><span class="t">' + esc(w.name) + '</span><span class="s">' + esc(c.label) + (l ? ' · ' + esc(l.name) : '') + ((w.photoIds || []).length ? ' · ' + w.photoIds.length + ' photo' + (w.photoIds.length > 1 ? 's' : '') : '') + '</span></span>' +
        (S.pos ? '<span class="n">' + fmtDist(hav(S.pos, w)) + '</span>' : '') + ic('chev', 'sm muted') + '</button>';
    }).join('') + '</div>' + (ws.length > 300 ? '<p class="muted">' + (ws.length - 300) + ' autres points : affinez la recherche.</p>' : '') :
      '<div class="empty">' + (S.wps.length ? 'Aucun point ne correspond.' : 'Aucun point. Ajoutez-en un avec le bouton <b>Point</b> sur la carte.') + '</div>';
  }
  function traceMenu(t) {
    sheetOptions(t.name || 'Tracé', fmtDist(traceDist(t.points || [])) + ' · ' + (t.points || []).length + ' points · ' + fmtDate(t.timestamp), [
      { label: 'Voir sur la carte', icon: 'map', fn: function () { var p = t.points[Math.floor(t.points.length / 2)]; showOnMap(p.lat, p.lon); } },
      { label: 'Renommer', icon: 'edit', fn: async function () { var n = await askText('Renommer le tracé', t.name); if (!n) return; t.name = n; await NavDB.saveTrace(t); refreshAfterData(); } },
      { label: 'Changer de calque', icon: 'layers', fn: function () { pickLayer(t.layerId, async function (lid) { t.layerId = lid; await NavDB.saveTrace(t); refreshAfterData(); }); } },
      { label: 'Supprimer', icon: 'trash', cls: 'danger', fn: async function () { if (!await confirmSheet('Supprimer ce tracé ?', '« ' + (t.name || 'Tracé') + ' » sera supprimé définitivement.', 'Supprimer', true)) return; await NavDB.deleteTrace(t.id); S.traces = S.traces.filter(function (x) { return x.id !== t.id; }); refreshAfterData(); toast('Tracé supprimé'); } }
    ]);
  }
  function pickLayer(current, cb) {
    var opts = S.layers.map(function (l) { return { label: l.name, cls: l.id === current ? 'primary' : '', fn: function () { cb(l.id); } }; });
    opts.push({ label: 'Nouveau calque…', icon: 'plus', fn: async function () { var n = await askText('Nouveau calque', '', 'ex. Frayères 2026'); if (!n) return; var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); cb(l.id); } });
    sheetOptions('Choisir le calque', null, opts);
  }
  function refreshAfterData() { renderOverlays(); if ($('#view-points').classList.contains('active')) renderPoints(); }
  function layerMenu(l) {
    var nw = S.wps.filter(function (w) { return w.layerId === l.id; }).length, nt = S.traces.filter(function (t) { return t.layerId === l.id; }).length;
    sheetOptions(l.name, nw + ' points · ' + nt + ' tracés', [
      { label: 'Calque actif pour les nouveaux points', icon: 'check', cls: S.activeLayerId === l.id ? 'primary' : '', fn: async function () { S.activeLayerId = l.id; await NavDB.setMeta('activeLayerId', l.id); renderPoints(); } },
      { label: 'Renommer', icon: 'edit', fn: async function () { var n = await askText('Renommer le calque', l.name); if (!n) return; l.name = n; await NavDB.saveLayer(l); renderPoints(); } },
      { label: 'Changer la couleur', icon: 'layers', fn: function () { sheetOptions('Couleur du calque', 'S\'applique aux nouveaux tracés de ce calque.', LCOLORS.map(function (c) { return { label: c, cls: c === l.color ? 'primary' : '', fn: async function () { l.color = c; await NavDB.saveLayer(l); renderPoints(); } }; })); } },
      { label: 'Exporter ce calque', icon: 'download', fn: function () { exportFormat({ label: l.name, wps: S.wps.filter(function (w) { return w.layerId === l.id; }), trs: S.traces.filter(function (t) { return t.layerId === l.id; }) }); } },
      { label: 'Supprimer le calque', icon: 'trash', cls: 'danger', fn: async function () {
        if (!await confirmSheet('Supprimer « ' + l.name + ' » ?', 'Ses ' + nw + ' points (avec leurs photos) et ' + nt + ' tracés seront supprimés définitivement. Exportez-le d\'abord si vous voulez les garder.', 'Supprimer tout', true)) return;
        await NavDB.deleteLayer(l.id);
        S.layers = S.layers.filter(function (x) { return x.id !== l.id; }); S.wps = S.wps.filter(function (w) { return w.layerId !== l.id; }); S.traces = S.traces.filter(function (t) { return t.layerId !== l.id; });
        if (S.activeLayerId === l.id) S.activeLayerId = null;
        refreshAfterData(); toast('Calque supprimé');
      } }
    ]);
  }

  // ══════════════ Exports ══════════════
  function exportMenu() {
    var opts = [{ label: 'Tout', sub: S.wps.length + ' points · ' + S.traces.length + ' tracés', icon: 'download', fn: function () { exportFormat({ label: 'tout', wps: S.wps, trs: S.traces }); } }];
    S.layers.forEach(function (l) { var w = S.wps.filter(function (x) { return x.layerId === l.id; }), t = S.traces.filter(function (x) { return x.layerId === l.id; }); opts.push({ label: 'Calque « ' + l.name + ' »', sub: w.length + ' points · ' + t.length + ' tracés', icon: 'layers', fn: function () { exportFormat({ label: l.name, wps: w, trs: t }); } }); });
    if (S.carte && S.carte.footprint) {
      var c = S.carte, w2 = S.wps.filter(function (w) { return covers(c, w.lat, w.lon); }), t2 = S.traces.filter(function (t) { return (t.points || []).some(function (p) { return covers(c, p.lat, p.lon); }); });
      opts.push({ label: 'Sur la carte « ' + c.name + ' »', sub: w2.length + ' points · ' + t2.length + ' tracés dans son emprise', icon: 'map', fn: function () { exportFormat({ label: c.name, wps: w2, trs: t2 }); } });
    }
    sheetOptions('Exporter', 'Que voulez-vous exporter ?', opts);
  }
  function exportFormat(sel) {
    if (!sel.wps.length && !sel.trs.length) { toast('Rien à exporter'); return; }
    var by = layersById(), run = function (fn) { return async function () {
      toast('Préparation du fichier…', 20000);
      try { deliver(await fn()); } catch (e) { toast('Export impossible : ' + e.message, 5000); }
    }; };
    sheetOptions('Format', sel.wps.length + ' points · ' + sel.trs.length + ' tracés', [
      { label: 'GeoJSON', sub: 'QGIS, R — points et tracés', fn: run(function () { return NVExport.geojson(sel.wps, sel.trs, by, sel.label); }) },
      { label: 'GPX', sub: 'GPS, applications de randonnée', fn: run(function () { return NVExport.gpx(sel.wps, sel.trs, by, sel.label); }) },
      { label: 'KMZ avec photos', sub: 'Google Earth — découpé au-delà de 15 Mo', fn: run(function () { return NVExport.kmz(sel.wps, sel.trs, by, sel.label, NavDB.getPhotos, 0.7, 'auto'); }) },
      { label: 'Shapefile (.zip)', sub: 'SIG — WGS84, attributs en UTF-8', fn: run(function () { return NVExport.shapefile(sel.wps, sel.trs, by, sel.label); }) }
    ]);
  }
  function download(f) { var u = URL.createObjectURL(f.blob), a = document.createElement('a'); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  function deliver(files) {
    var size = files.reduce(function (s, f) { return s + f.blob.size; }, 0);
    var fl = files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }); });
    var canShare = navigator.share && navigator.canShare && navigator.canShare({ files: fl });
    var opts = [];
    if (canShare) opts.push({ label: 'Partager', sub: 'AirDrop, courriel, Fichiers…', icon: 'share', cls: 'primary', fn: async function () { try { await navigator.share({ files: fl, title: 'NAVenza MAP' }); } catch (e) { if (e.name !== 'AbortError') toast('Partage impossible : ' + e.message); } } });
    opts.push({ label: 'Télécharger', icon: 'download', cls: canShare ? '' : 'primary', fn: async function () { for (var i = 0; i < files.length; i++) { download(files[i]); await new Promise(function (r) { setTimeout(r, 400); }); } } });
    toast('Fichier prêt');
    sheetOptions(files.length > 1 ? files.length + ' fichiers prêts' : 'Fichier prêt', files.map(function (f) { return f.name; }).join(', ') + ' — ' + fmtSize(size), opts);
  }

  // ══════════════ Aperçu de toutes les cartes ══════════════
  function folderColor(fid) { var i = S.folders.findIndex(function (f) { return f.id === fid; }); return i < 0 ? '#C9D6CC' : FCOLORS[i % FCOLORS.length]; }
  function renderOverview() {
    if (!S.ov) {
      S.ov = L.map('ov-map', { zoomControl: false, attributionControl: false, preferCanvas: true, zoomSnap: 0.5 });
      S.ov.setView([48.15, -68.62], 10);
      L.geoJSON(window.INDEX_GEOJSON, {
        filter: function (f) { return f.geometry && f.geometry.coordinates != null && f.properties.cat !== 'secteur'; },
        style: function (f) {
          var p = f.properties || {};
          if (p.cat === 'limite') return { color: '#6EDB98', weight: 2.5, dashArray: '6 5', fillOpacity: 0 };
          if (p.cat === 'lac') return { color: '#2E5A73', weight: 1, fillColor: '#3A7BD5', fillOpacity: .45 };
          if (p.cat === 'riviere') return { color: '#3A7BD5', weight: 1.5, opacity: .7 };
          if (p.cat === 'route') return p.act === '1' ? { color: '#c0392b', weight: 2.5, opacity: .85 } : (p.act === '2' ? { color: '#B9864E', weight: 1.5, opacity: .8 } : { color: '#8a8a8a', weight: 1, opacity: .6, dashArray: '3 3' });
          return { color: '#999', weight: 1 };
        }, interactive: false
      }).addTo(S.ov);
      S.ovLayers = L.layerGroup().addTo(S.ov);
      S.ovFirst = true;
    }
    setTimeout(function () { S.ov.invalidateSize(); drawOvFootprints(); }, 30);
    $('#ov-chips').innerHTML = '<button class="chip' + (S.ovFolder === 'all' ? ' on' : '') + '" data-act="ovFolder" data-id="all">Tous</button>' +
      S.folders.map(function (f) { return '<button class="chip' + (S.ovFolder === f.id ? ' on' : '') + '" data-act="ovFolder" data-id="' + esc(f.id) + '"><span class="dot" style="background:' + folderColor(f.id) + '"></span>' + esc(f.name) + '</button>'; }).join('');
    renderOvSheet();
  }
  function drawOvFootprints() {
    S.ovLayers.clearLayers();
    var bounds = [], hereIds = S.pos ? cartesAt(S.pos.lat, S.pos.lon).map(function (c) { return c.id; }) : [];
    S.cartes.forEach(function (c) {
      if (!c.footprint) return;
      if (S.ovFolder !== 'all' && c.folderId !== S.ovFolder) return;
      var col = folderColor(c.folderId), here = hereIds.indexOf(c.id) >= 0;
      L.polygon(c.footprint, { color: col, weight: here ? 4 : 2.5, fillColor: col, fillOpacity: here ? .22 : .1 })
        .bindTooltip(esc(c.name), { permanent: true, direction: 'center', className: 'ov-label' })
        .on('click', function () { openMap(c.id); }).addTo(S.ovLayers);
      c.footprint.forEach(function (p) { bounds.push(p); });
    });
    if (S.pos) {
      L.circleMarker([S.pos.lat, S.pos.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#2F7DF6', fillOpacity: 1 }).addTo(S.ovLayers);
      S.ovPos = null;
    }
    if (S.ovFirst) { S.ovFirst = false; if (bounds.length) S.ov.fitBounds(bounds, { padding: [30, 30] }); }
  }
  function renderOvSheet() {
    var box = $('#ov-sheet'), html = '';
    var noFp = S.cartes.filter(function (c) { return !c.footprint; }).length;
    if (S.pos) {
      var here = cartesAt(S.pos.lat, S.pos.lon);
      html += '<div style="display:flex;align-items:baseline;justify-content:space-between"><h2 style="margin:0;font-size:18px">Cartes sous ma position</h2><span class="mono muted">' + here.length + '</span></div>';
      html += here.length ? '<div class="list">' + here.map(function (c) { var f = folderById(c.folderId); return '<button class="row" data-act="openCarte" data-id="' + esc(c.id) + '"><span class="dot" style="width:16px;height:16px;border-radius:4px;background:' + folderColor(c.folderId) + '"></span><span class="main"><span class="t">' + esc(c.name) + '</span><span class="s">' + esc(f ? f.name : 'Sans dossier') + '</span></span><span style="font-weight:700;color:var(--accent-text)">Ouvrir</span></button>'; }).join('') + '</div>'
        : '<p class="muted" style="margin:0">Aucune de vos cartes ne couvre votre position.</p>';
    } else html += '<p class="muted" style="margin:0">Position GPS en attente. Touchez un contour pour ouvrir une carte.</p>';
    if (noFp) html += '<p class="muted" style="margin:0;font-size:14px">' + noFp + ' carte' + (noFp > 1 ? 's' : '') + ' sans emprise connue (non affichée' + (noFp > 1 ? 's' : '') + ').</p>';
    box.innerHTML = html;
    if (S.ov) drawOvFootprints();
  }

  // ══════════════ Réglages ══════════════
  var OFFLINE_FILES = ['carte_terrain.html', 'css/styles.css', 'js/app.js', 'js/db.js', 'js/layers.js', 'js/export.js', 'js/index-geojson.js',
    'lib/leaflet.min.js', 'lib/leaflet.min.css', 'lib/jszip.min.js', 'lib/utif.js', 'lib/pdf.min.mjs', 'lib/pdf.worker.min.mjs',
    'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2', 'fonts/ibm-plex-mono-latin-600-normal.woff2'];
  var offlineState = { ok: false, msg: 'Vérification…' };
  async function checkOffline() {
    var set = function (ok, msg) { offlineState = { ok: ok, msg: msg }; var el = $('#offline-status'); if (el) el.innerHTML = '<span class="' + (ok ? 'ok' : 'warn') + '">' + esc(msg) + '</span>'; };
    if (!('serviceWorker' in navigator) || !window.caches) { set(false, 'Hors ligne non pris en charge'); return; }
    try {
      var missing = 0;
      for (var i = 0; i < OFFLINE_FILES.length; i++) if (!(await caches.match(new URL(OFFLINE_FILES[i], document.baseURI).href, { ignoreSearch: true }))) missing++;
      if (missing) { set(false, navigator.onLine ? 'Préparation hors ligne… (' + (OFFLINE_FILES.length - missing) + '/' + OFFLINE_FILES.length + ')' : 'Pas prêt hors ligne'); if (navigator.onLine) setTimeout(checkOffline, 3000); }
      else if (!navigator.serviceWorker.controller) set(false, 'Presque prêt — rouvrez l\'app une fois');
      else set(true, 'Prêt hors ligne');
    } catch (e) { set(false, 'État hors ligne inconnu'); }
  }
  async function renderSettings() {
    var est = await NavDB.storageEstimate(), mig = await NavDB.getMeta('migrationV3'), persisted = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) {}
    var html = '<div class="section-h"><h2>Affichage</h2></div><div class="seg">' + [['sombre', 'Sombre'], ['soleil', 'Plein soleil'], ['nuit', 'Nuit (rouge)']].map(function (t) { return '<button class="' + (S.theme === t[0] ? 'on' : '') + '" data-act="setTheme" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    html += '<div class="section-h"><h2>Hors ligne et stockage</h2></div><div class="list">' +
      '<div class="row"><span class="main"><span class="t" style="color:' + (offlineState.ok ? 'var(--ok)' : 'var(--accent-text)') + '">' + esc(offlineState.msg) + '</span><span class="s">Application et bibliothèques en cache sur l\'appareil</span></span></div>' +
      '<div class="row"><span class="main"><span class="t">' + (est && est.usage != null ? fmtSize(est.usage) + ' utilisés' : 'Espace utilisé inconnu') + '</span><span class="s wrap-ok">' + (est && est.quota ? 'Espace disponible pour l\'app : environ ' + fmtSize(est.quota) : 'Quota non communiqué par le système') + (persisted === true ? ' · stockage protégé' : (persisted === false ? ' · stockage non garanti par le système' : '')) + '</span></span></div>' +
      '<div class="row"><span class="main"><span class="t">' + pl(S.cartes.length, 'carte') + ' · ' + pl(S.folders.length, 'dossier') + '</span><span class="s">' + pl(S.wps.length, 'point') + ' · ' + pl(S.traces.length, 'tracé') + ' · ' + pl(S.layers.length, 'calque') + '</span></span></div></div>';
    html += '<div class="section-h"><h2>Sauvegarde</h2></div><button class="btn block" data-act="backup">' + ic('download') + 'Copie de sécurité complète (GeoJSON)</button>' +
      '<p class="muted" style="font-size:14px;line-height:1.4">Tous les points et tracés, avec leur calque et leur catégorie. Les photos ne sont incluses que dans l\'export KMZ.</p>';
    if (mig) html += '<div class="section-h"><h2>Mise à jour v3</h2></div><p class="muted" style="font-size:14px;line-height:1.4">Données converties le ' + esc(fmtDate(mig.date)) + ' : ' + pl(mig.dossiers, 'dossier') + ', ' + pl(mig.cartes, 'carte') + ', ' + pl(mig.calques, 'calque') + ', ' + pl(mig.points, 'point') + ', ' + pl(mig.photos, 'photo') + ', ' + pl(mig.traces, 'tracé') + '.</p>';
    html += '<div class="section-h"><h2>À propos</h2></div><p class="muted" style="font-size:14px;line-height:1.5">NAVenza MAP ' + APP_VERSION + ' — navigation terrain hors réseau, Réserve faunique Duchénier.<br>Polices Atkinson Hyperlegible et IBM Plex Mono (licence SIL OFL 1.1). Leaflet, pdf.js, UTIF.js, JSZip.</p>';
    $('#set-body').innerHTML = html;
  }
  function applyTheme(t) {
    S.theme = t; document.body.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t === 'soleil' ? '#FFFFFF' : (t === 'nuit' ? '#0C0202' : '#0F1712'));
    $('#m-theme').innerHTML = ic(t === 'soleil' ? 'sun' : 'moon');
  }

  // ══════════════ Actions (délégation d'événements) ══════════════
  var ACT = {
    tab: function (el) { showTab(el.dataset.tab); },
    closeSheet: closeSheet,
    sheetOpt: function (el) { var fn = S.sheetFns[+el.dataset.i]; closeSheet(); if (fn) fn(); },
    import: function () { $('#file-import').click(); },
    openSettings: function () { showTab('reglages'); },
    libRoot: function () { S.libFolder = null; renderLib(); },
    openFolder: function (el) { S.libFolder = el.dataset.id; $('#lib-search').value = ''; S.libQuery = ''; renderLib(); $('#lib-body').scrollTop = 0; },
    openCarte: function (el) { openMap(el.dataset.id); },
    newFolder: async function () { var n = await askText('Nouveau dossier', '', 'ex. Planif 2026'); if (!n) return; var f = await NavDB.saveFolder({ name: n }); S.folders.push(f); renderLib(); },
    folderMenu: function (el) {
      var f = folderById(el.dataset.id || S.libFolder); if (!f) return;
      var n = cartesIn(f.id).length;
      sheetOptions(f.name, n + ' carte' + (n > 1 ? 's' : ''), [
        { label: 'Renommer', icon: 'edit', fn: async function () { var v = await askText('Renommer le dossier', f.name); if (!v) return; f.name = v; await NavDB.saveFolder(f); renderLib(); } },
        { label: 'Supprimer le dossier', sub: n ? 'Ses cartes iront dans « Sans dossier »' : '', icon: 'trash', fn: async function () { await NavDB.deleteFolder(f.id, 'move'); S.folders = S.folders.filter(function (x) { return x.id !== f.id; }); S.cartes.forEach(function (c) { if (c.folderId === f.id) c.folderId = null; }); S.libFolder = null; renderLib(); toast('Dossier supprimé'); } },
        n ? { label: 'Supprimer le dossier et ses ' + n + ' cartes', icon: 'trash', cls: 'danger', fn: async function () {
          if (!await confirmSheet('Supprimer aussi les cartes ?', 'Les ' + n + ' cartes du dossier « ' + f.name + ' » seront effacées de l\'appareil. Vos points et tracés sont conservés.', 'Supprimer', true)) return;
          await NavDB.deleteFolder(f.id, 'delete'); S.folders = S.folders.filter(function (x) { return x.id !== f.id; }); S.cartes = S.cartes.filter(function (c) { return c.folderId !== f.id; });
          if (S.carte && !carteById(S.carte.id)) { if (S.carteLayer) S.map.removeLayer(S.carteLayer); S.carteLayer = null; S.carte = null; }
          S.libFolder = null; renderLib(); toast('Dossier et cartes supprimés'); } } : null
      ].filter(Boolean));
    },
    carteMenu: function (el) {
      var c = carteById(el.dataset.id); if (!c) return;
      sheetOptions(c.name, (c.kind === 'tiff' ? 'GeoTIFF' : 'GeoPDF') + ' · ' + fmtSize(c.bytes || 0) + (c.fileName ? ' · ' + c.fileName : ''), [
        { label: 'Ouvrir', icon: 'map', cls: 'primary', fn: function () { openMap(c.id); } },
        { label: 'Renommer', icon: 'edit', fn: async function () { var v = await askText('Renommer la carte', c.name); if (!v) return; c.name = v; await NavDB.saveCarte(c); renderLib(); if (S.carte && S.carte.id === c.id) updateMapHeader(); } },
        { label: 'Déplacer vers un dossier', icon: 'folder', fn: function () { moveCarteSheet(c); } },
        { label: 'Supprimer', icon: 'trash', cls: 'danger', fn: async function () {
          if (!await confirmSheet('Supprimer cette carte ?', '« ' + c.name + ' » sera effacée de l\'appareil. Vos points et tracés sont conservés.', 'Supprimer', true)) return;
          await NavDB.deleteCarte(c.id); S.cartes = S.cartes.filter(function (x) { return x.id !== c.id; });
          if (S.carte && S.carte.id === c.id) { if (S.carteLayer) S.map.removeLayer(S.carteLayer); S.carteLayer = null; S.carte = null; }
          renderLib(); toast('Carte supprimée'); } }
      ]);
    },
    // Carte
    mapBack: function () { closeMapView(); showTab(S.prevTab && S.prevTab !== 'map' ? S.prevTab : 'cartes'); },
    carteSwitch: function () {
      var ref = S.pos && cartesAt(S.pos.lat, S.pos.lon).length ? S.pos : ll(S.map.getCenter());
      var list = cartesAt(ref.lat, ref.lon), ctr = S.map.getCenter(), z = S.map.getZoom();
      var opts = list.map(function (c) { var f = folderById(c.folderId); return { label: c.name, sub: (f ? f.name : 'Sans dossier') + (S.carte && c.id === S.carte.id ? ' · carte ouverte' : ''), icon: 'map', cls: S.carte && c.id === S.carte.id ? 'primary' : '', fn: function () { openMap(c.id, { center: [ctr.lat, ctr.lng], zoom: z }); } }; });
      opts.push({ label: 'Toutes mes cartes', sub: 'Aperçu des contours', icon: 'overview', fn: function () { showTab('apercu'); } });
      sheetOptions('Cartes ' + (ref === S.pos ? 'sous ma position' : 'au centre de l\'écran'), list.length ? null : 'Aucune carte ne couvre cet endroit.', opts);
    },
    cycleTheme: function () { var n = { sombre: 'nuit', nuit: 'soleil', soleil: 'sombre' }[S.theme] || 'sombre'; applyTheme(n); NavDB.setMeta('theme', n); toast({ sombre: 'Thème sombre', nuit: 'Mode nuit', soleil: 'Mode plein soleil' }[n]); },
    zoomIn: function () { S.map.zoomIn(1); }, zoomOut: function () { S.map.zoomOut(1); },
    follow: function () { setFollow(!S.follow); },
    compass: toggleCompass,
    stopNav: stopNav,
    edgeOpen: function () { if (S.edgeTarget) openMap(S.edgeTarget, { center: S.pos ? [S.pos.lat, S.pos.lon] : null }); },
    edgeClose: function () { if (S.edgeTarget) S.edgeDismissed[S.edgeTarget] = true; $('#edge-banner').classList.add('hidden'); },
    layersSheet: function () {
      var opts = S.layers.map(function (l) { var vis = l.visible !== false; return { label: (vis ? 'Visible : ' : 'Masqué : ') + l.name, icon: vis ? 'eye' : 'eyeoff', cls: vis ? '' : '', fn: async function () { l.visible = !vis; await NavDB.saveLayer(l); renderOverlays(); ACT.layersSheet(); } }; });
      if (!opts.length) { toast('Aucun calque pour l\'instant'); return; }
      sheetOptions('Calques affichés', 'Touchez un calque pour l\'afficher ou le masquer sur toutes les cartes.', opts);
    },
    addPoint: function () {
      sheetOptions('Nouveau point', null, [
        { label: 'À ma position GPS', sub: S.pos ? fmtLL(S.pos.lat, S.pos.lon) + ' · ±' + Math.round(S.acc) + ' m' : 'Position GPS en attente', icon: 'locate', cls: 'primary', disabled: !S.pos, fn: function () { openWpForm(null, { lat: S.pos.lat, lon: S.pos.lon }); } },
        { label: 'Avec la mire', sub: 'Viser un endroit au centre de l\'écran', icon: 'move', fn: function () { enterMire('wp'); } },
        { label: 'Entrer des coordonnées', icon: 'edit', fn: function () { var c = ll(S.map.getCenter()); openWpForm(null, { lat: c.lat, lon: c.lon, manual: true }); } }
      ]);
    },
    trace: function () {
      if (!S.tracing) { startTrace(); return; }
      sheetOptions('Tracé en cours', fmtDist(traceDist(S.tracePts)) + ' · ' + S.tracePts.length + ' points', [
        { label: 'Arrêter et enregistrer', icon: 'check', cls: 'primary', fn: function () { finishTrace(true); } },
        { label: 'Continuer l\'enregistrement', icon: 'route', fn: function () {} },
        { label: 'Arrêter sans enregistrer', icon: 'trash', cls: 'danger', fn: async function () { if (await confirmSheet('Abandonner le tracé ?', 'Les ' + S.tracePts.length + ' points enregistrés seront perdus.', 'Abandonner', true)) finishTrace(false); } }
      ]);
    },
    measure: function () { if (S.mire === 'measure') exitMire(); else enterMire('measure'); },
    exitMire: exitMire, measureAdd: measureAdd, measureUndo: measureUndo,
    mireWp: function () { var c = ll(S.map.getCenter()); exitMire(); openWpForm(null, c); },
    mireMove: async function () { var w = wpById(S.movingWp), c = ll(S.map.getCenter()); exitMire(); if (!w) return; w.lat = c.lat; w.lon = c.lon; await NavDB.saveWaypoint(w); renderOverlays(); toast('« ' + w.name + ' » déplacé'); },
    // Points
    openWp: function (el) { openWp(+el.dataset.id, 'points'); },
    closeWp: closeWp,
    wpNav: function () { var w = wpById(S.wpOpen); if (!w) return; var id = w.id; if ($('#view-map').classList.contains('active')) { closeWp(); startNav(id); } else showOnMap(S.pos ? S.pos.lat : w.lat, S.pos ? S.pos.lon : w.lon, function () { startNav(id); }); },
    wpEdit: function () { var w = wpById(S.wpOpen); if (w) openWpForm(w); },
    wpMove: function () { var w = wpById(S.wpOpen); if (!w) return; var id = w.id; showOnMap(w.lat, w.lon, function () { enterMire('move'); S.movingWp = id; updateMire(); }); },
    wpShare: function () { var w = wpById(S.wpOpen); if (w) shareWp(w); },
    wpMenu: function () {
      var w = wpById(S.wpOpen); if (!w) return;
      sheetOptions(w.name, null, [
        { label: 'Voir sur la carte', icon: 'map', fn: function () { showOnMap(w.lat, w.lon); } },
        { label: 'Changer de calque', icon: 'layers', fn: function () { pickLayer(w.layerId, async function (lid) { w.layerId = lid; await NavDB.saveWaypoint(w); renderOverlays(); openWp(w.id); }); } },
        { label: 'Supprimer le point', icon: 'trash', cls: 'danger', fn: async function () {
          if (!await confirmSheet('Supprimer ce point ?', '« ' + w.name + ' » et ses photos seront supprimés définitivement.', 'Supprimer', true)) return;
          await NavDB.deleteWaypoint(w); S.wps = S.wps.filter(function (x) { return x.id !== w.id; });
          if (S.navTarget === w.id) stopNav();
          closeWp(); renderOverlays(); toast('Point supprimé'); } }
      ]);
    },
    viewPhoto: function (el) { var img = el.querySelector('img'); if (!img) return; openSheet('<img src="' + img.src + '" alt="Photo" style="width:100%;border-radius:14px;display:block;margin-bottom:12px"><button class="btn block" data-act="closeSheet">Fermer</button>'); },
    cancelWpForm: function () { $('#view-wpform').classList.remove('active'); S.form = null; },
    saveWpForm: saveWpForm,
    fCat: function (el) { syncForm(); var c = CAT[el.dataset.id]; S.form.wp.cat = c.id; S.form.wp.color = c.color; renderWpForm(); },
    fShape: function (el) { syncForm(); S.form.wp.shape = el.dataset.id; renderWpForm(); },
    fPhotoAdd: function () { syncForm(); $('#file-photo').click(); },
    fPhotoDel: function (el) { syncForm(); var p = S.form.photos.splice(+el.dataset.i, 1)[0]; if (p && p.id) S.form.removed.push(p.id); renderWpForm(); },
    fCoords: function () { syncForm(); S.form.showCoords = true; renderWpForm(); },
    fFmt: function (el) { syncForm(); if (S.form.showCoords && !readCoords()) return; S.form.coordFmt = el.dataset.id; renderWpForm(); },
    fCoordsApply: function () { syncForm(); if (readCoords()) { S.form.showCoords = false; renderWpForm(); toast('Position mise à jour'); } },
    newLayer: async function () { var n = await askText('Nouveau calque', '', 'ex. Frayères 2026'); if (!n) return; var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); renderPoints(); },
    layerVis: async function (el) { var l = layerById(el.dataset.id); l.visible = l.visible === false; await NavDB.saveLayer(l); renderPoints(); renderOverlays(); },
    layerMenu: function (el) { layerMenu(layerById(el.dataset.id)); },
    ptsMode: function (el) { S.ptsMode = el.dataset.id; renderPoints(); },
    ptsCat: function (el) { S.ptsCat = el.dataset.id; renderPoints(); },
    traceMenu: function (el) { var t = S.traces.find(function (x) { return x.id === +el.dataset.id; }); if (t) traceMenu(t); },
    exportMenu: exportMenu,
    backup: function () { deliver(NVExport.geojson(S.wps, S.traces, layersById(), 'sauvegarde complete')); },
    setTheme: function (el) { applyTheme(el.dataset.id); NavDB.setMeta('theme', el.dataset.id); renderSettings(); },
    ovFolder: function (el) { S.ovFolder = el.dataset.id; S.ovFirst = true; renderOverview(); },
    ovLocate: function () { if (S.pos) S.ov.setView([S.pos.lat, S.pos.lon], 13); else toast('Pas encore de position GPS'); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    var fn = ACT[el.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(el, e);
  });
  document.addEventListener('change', async function (e) {
    var a = e.target.dataset.actChange;
    if (a === 'layerSelect' && e.target.value === '__new') {
      syncForm(); var n = await askText('Nouveau calque', '', 'ex. Frayères 2026');
      if (n) { var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); S.form.wp.layerId = l.id; }
      renderWpForm();
    }
    if (a === 'fColor') { syncForm(); renderWpForm(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'lib-search') { S.libQuery = e.target.value; renderLib(); }
    if (e.target.id === 'pts-search') { S.ptsQuery = e.target.value; renderPtsList(); }
  });
  $('#file-import').addEventListener('change', function (e) { var files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) importFiles(files); });
  $('#file-photo').addEventListener('change', async function (e) {
    var files = Array.from(e.target.files || []); e.target.value = '';
    for (var i = 0; i < files.length; i++) { var d = await resizePhoto(files[i]); if (d && S.form) S.form.photos.push({ data: d }); }
    if (S.form) renderWpForm();
  });

  // ══════════════ Démarrage ══════════════
  function bootMsg(m, err, retry) {
    $('#boot-msg').innerHTML = '<span class="' + (err ? 'err' : '') + '">' + esc(m) + '</span>' + (retry ? '<br><br><button class="btn primary" onclick="location.reload()">Réessayer</button>' : '');
  }
  async function boot() {
    if (window.NV_HTML_VERSION !== APP_VERSION) console.warn('[app] versions différentes : page ' + window.NV_HTML_VERSION + ', script ' + APP_VERSION);
    try { await NavDB.open(); } catch (e) { bootMsg('Impossible d\'ouvrir la base de données : ' + (e && e.message || e), true, true); return; }
    var summary = null;
    try { bootMsg('Mise à jour de vos données…'); summary = await NavDB.migrate(); }
    catch (e) { bootMsg(e.message, true, true); return; }
    applyTheme((await NavDB.getMeta('theme')) || 'sombre');
    await loadAll();
    S.activeLayerId = (await NavDB.getMeta('activeLayerId')) || null;
    startGPS();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (r) { try { r.update(); } catch (e) {} }).catch(function (e) { console.warn('SW :', e); });
      navigator.serviceWorker.addEventListener('controllerchange', checkOffline);
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    window.addEventListener('online', checkOffline); window.addEventListener('offline', checkOffline);
    setTimeout(checkOffline, 800);
    $('#boot').classList.add('hidden');
    var lastView = await NavDB.getMeta('lastView'), lastCarte = await NavDB.getMeta('lastCarteId');
    if (lastView === 'map' && lastCarte && carteById(lastCarte)) openMap(lastCarte); else showTab(lastView === 'points' || lastView === 'apercu' ? lastView : 'cartes');
    if (summary) sheetOptions('Vos données sont à jour', pl(summary.dossiers, 'dossier') + ', ' + pl(summary.cartes, 'carte') + ', ' + pl(summary.calques, 'calque') + ', ' + pl(summary.points, 'point') + ' (' + pl(summary.photos, 'photo') + ') et ' + pl(summary.traces, 'tracé') + ' ont été convertis. Chaque ancien projet est devenu un dossier et un calque du même nom.', [{ label: 'Compris', cls: 'primary', icon: 'check', fn: function () {} }], true);
    var pend = await NavDB.getMeta('traceEnCours');
    if (pend && pend.pts && pend.pts.length > 1 && !summary) {
      sheetOptions('Tracé non terminé', 'Un tracé de ' + pend.pts.length + ' points (' + fmtDist(traceDist(pend.pts)) + ') n\'a pas été enregistré.', [
        { label: 'L\'enregistrer', icon: 'check', cls: 'primary', fn: async function () { await NavDB.setMeta('traceEnCours', null); await saveTracePts(pend.pts, pend.start); } },
        { label: 'Le supprimer', icon: 'trash', cls: 'danger', fn: function () { NavDB.setMeta('traceEnCours', null); } }]);
    }
    // Emprises manquantes (cartes migrées) : en arrière-plan, une à la fois
    NavDB.fillFootprints(window.carteFootprint, function (c) {
      var k = S.cartes.findIndex(function (x) { return x.id === c.id; }); if (k >= 0) S.cartes[k] = Object.assign(S.cartes[k], c);
      if ($('#view-cartes').classList.contains('active')) renderLib();
      if ($('#view-apercu').classList.contains('active')) renderOverview();
    }).catch(function (e) { console.warn('[app] emprises :', e); });
  }
  window.__NV = { S: S, ACT: ACT, openMap: openMap, renderLib: renderLib, version: APP_VERSION, onGPS: onGPS };
  boot();
})();
