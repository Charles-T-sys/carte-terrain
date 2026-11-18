// app.js — NAVenza MAP v3 : interface (bibliothèque, carte, points, aperçu, réglages)
(function () {
  'use strict';
  var APP_VERSION = '5.7.5';
  var NOUVEAUTES = ['Cartes PDF : une image trop lourde pour le téléphone est ignorée au lieu de faire fermer l\'application, et l\'import vous avertit', 'Mettre à jour un calque : les corrections du bureau arrivent aussi sur les sites déjà visités ; seul ce que vous avez changé et pas encore envoyé est gardé', 'Sécurité : si une carte fait fermer l\'application, elle n\'est plus rouverte automatiquement au démarrage', 'Météo du jour et du lendemain dans le bandeau (prise quand il y a du réseau, gardée pour la journée)', 'Envoyer au bureau : l\'adresse est copiée, il suffit de la coller dans « À »', 'Un calque (GeoJSON, KML, GPX) choisi par erreur dans la Bibliothèque est envoyé vers l\'import de calques']; 

  // ══════════════ Outils ══════════════
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(id, cls) { return '<svg class="i ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>'; }
  function num(n, d) { return n.toFixed(d).replace('.', ','); }
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : num(m / 1000, m < 10000 ? 2 : 1) + ' km'; }
  function fmtSize(b) { return b > 1048576 ? num(b / 1048576, 1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' ko'; }
  function fmtLL(lat, lon, f) { return NVCoords.format(lat, lon, f || S.coordFmt); }
  function fmtDate(iso) { if (!iso) return '—'; try { return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso; } }
  function fmtDay(iso) { if (!iso) return ''; try { return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(new Date(iso)); } catch (e) { return iso.slice(0, 10); } }
  function card(b) { return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((b % 360) + 360) % 360 / 45) % 8]; }
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
  function isPoly(t) { return t && t.geom === 'polygone'; }
  function trLen(t) { var p = (t.points || []); return traceDist(isPoly(t) && p.length > 2 ? p.concat([p[0]]) : p); }
  function trById(id) { return S.traces.find(function (x) { return x.id === id; }); }
  function areaHa(pts) { // aire d'un polygone (projection locale équirectangulaire)
    if (pts.length < 3) return 0; var lat0 = pts.reduce(function (s, p) { return s + p.lat; }, 0) / pts.length, k = 111320 * Math.cos(rad(lat0)), a = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += (p.lon * k) * (q.lat * 111320) - (q.lon * k) * (p.lat * 111320); }
    return Math.abs(a / 2) / 10000;
  }
  var toastTimer = null;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2400); }
  window.toast = toast; // utilisé par layers.js

  var LCOLORS = ['#FFB547', '#6EDB98', '#7FC8F8', '#FF7A59', '#C792EA', '#F2E85C', '#5AD1C8', '#FF9EC4'];
  var FCOLORS = ['#FFB547', '#7FC8F8', '#6EDB98', '#FF9EC4', '#C792EA', '#F2E85C', '#5AD1C8', '#FF7A59'];
  function wpIcon(w, size) { return NVSym.forWp(w, size); }
  function statutBadge(w) {
    if (w.statut === 'fait') return '<span class="st st-fait" aria-label="Fait"><svg viewBox="0 0 12 12"><path d="m2.5 6.2 2.3 2.3 4.7-4.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    if (w.statut === 'probleme') return '<span class="st st-pb" aria-label="Problème"><svg viewBox="0 0 12 12"><rect x="5.1" y="2.2" width="1.8" height="4.8" rx=".9" fill="#fff"/><circle cx="6" cy="9.2" r="1" fill="#fff"/></svg></span>';
    if (w.statut === 'a_faire') return '<span class="st st-todo" aria-label="À faire"></span>';
    return '';
  }
  function fpIcon(c) {
    if (!c.footprint || !c.bbox) return '<span class="fp" aria-hidden="true"></span>';
    var b = c.bbox, w = b[2] - b[0], h = b[3] - b[1], k = 30 / Math.max(w, h * 1.5), pts = c.footprint.map(function (p) { return (5 + (p[1] - b[0]) * k + (30 - w * k) / 2).toFixed(1) + ',' + (5 + (b[3] - p[0]) * k * 1.5 + (30 - h * k * 1.5) / 2).toFixed(1); }).join(' ');
    return '<svg class="fp" viewBox="0 0 40 40" aria-hidden="true"><polygon points="' + pts + '" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/></svg>';
  }

  // ══════════════ État ══════════════
  var S = {
    folders: [], cartes: [], layers: [], wps: [], traces: [],
    tab: 'cartes', prevTab: 'cartes', libFolder: null, libQuery: '', ptsMode: 'points', ptsQuery: '', ptsSym: '', coordFmt: 'dd', viseur: false, employee: '', officeEmail: 'faune@terfa.ca',
    pos: null, acc: null, speed: null, course: null, heading: null, prevGPS: null, gpsId: null, lastHereRender: null,
    map: null, carte: null, carteLayer: null, wpGroup: null, trGroup: null, posMarker: null, posCircle: null,
    follow: false, compassOn: false, navTarget: null,
    tracing: false, tracePts: [], traceLine: null, traceStart: 0, traceTimer: null, traceSaved: 0,
    mire: null, measurePts: [], measureLayers: [], elastic: null, movingWp: null,
    form: null, wpOpen: null, wpReturn: null, sheetFns: [], deviceId: '', ptsStat: '',
    ov: null, ovFolder: 'all', ovLayers: null, ovPos: null,
    fonds: {}, fondLayers: {}, carteOpacity: 1, carteBlend: false,
    activeLayerId: null, theme: 'sombre', edgeDismissed: {}, edgeTarget: null, wakeLock: null,
    serie: null, serieCfg: null, hideDone: false, lastCarteId: null, lastBackup: null, meteo: null, meteoOn: true
  };
  function newUid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var h = function () { return Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1); };
    return h() + h() + '-' + h() + '-4' + h().slice(1) + '-' + h() + '-' + h() + h() + h();
  }
  // Tampon d'auteur et de date : à chaque création ou modification sur cet appareil
  function stamp(o, creating) {
    var now = new Date().toISOString();
    if (creating || !o.uid) { o.uid = o.uid || newUid(); o.author = o.author || S.employee || ''; o.device = o.device || S.deviceId; }
    o.updatedAt = now; o.updatedBy = S.employee || '';
    return o;
  }
  var STATUTS = [['a_faire', 'À faire'], ['fait', 'Fait'], ['probleme', 'Problème']];
  var STATUT_LBL = { a_faire: 'À faire', fait: 'Fait', probleme: 'Problème' };
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
  // Donne un identifiant unique (et l'appareil d'origine) aux points et tracés créés avant la 5.2
  async function ensureUids() {
    var n = 0;
    for (var i = 0; i < S.wps.length; i++) { var w = S.wps[i]; if (w.uid) continue; w.uid = w.imported && w.extId ? 'site:' + w.extId : newUid(); w.device = w.device || S.deviceId; w.author = w.author || ''; await NavDB.saveWaypoint(w); n++; }
    for (var j = 0; j < S.traces.length; j++) { var t = S.traces[j]; if (t.uid) continue; t.uid = newUid(); t.device = t.device || S.deviceId; t.author = t.author || ''; await NavDB.saveTrace(t); n++; }
    return n;
  }
  async function ensureActiveLayer() {
    if (S.activeLayerId && layerById(S.activeLayerId)) return S.activeLayerId;
    if (!S.layers.length) { var l = await NavDB.saveLayer({ name: 'Mes points' }); S.layers.push(l); }
    S.activeLayerId = S.layers[0].id; await NavDB.setMeta('activeLayerId', S.activeLayerId);
    return S.activeLayerId;
  }

  // ══════════════ Feuilles (bas d'écran) ══════════════
  function openSheet(html, fns) {
    $('#sheet').classList.remove('compact'); $('#sheet-bg').classList.remove('clear');
    clearTimeout(toastTimer); $('#toast').classList.remove('show');
    S.sheetFns = fns || [];
    $('#sheet').innerHTML = '<div class="grip"></div>' + html;
    $('#sheet-bg').classList.add('open'); $('#sheet').classList.add('open');
  }
  function closeSheet() { $('#sheet-bg').classList.remove('open', 'clear'); $('#sheet').classList.remove('open', 'compact'); S.sheetFns = []; if (S.avg) stopAvg(); }
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
    gardeRetire();
    exitMire(); serieEnd();
    $('#view-map').classList.remove('active'); document.body.classList.remove('mapmode');
  }

  // ══════════════ Bibliothèque ══════════════
  function cartesIn(fid) { return S.cartes.filter(function (c) { return fid === 'none' ? !c.folderId || !folderById(c.folderId) : c.folderId === fid; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); }); }
  function kindLabel(c) { return c.kind === 'tuiles' ? 'Mosaïque en tuiles' : c.kind === 'tiff' ? 'GeoTIFF' : 'GeoPDF'; }
  function isFond(c) { return c && c.kind === 'tuiles'; }
  function carteRow(c, showFolder) {
    var here = S.pos && covers(c, S.pos.lat, S.pos.lon), f = folderById(c.folderId);
    var sub = kindLabel(c) + (isFond(c) && S.fonds[c.id] && S.fonds[c.id].on ? ' · fond affiché' : '') + ' · ' + fmtSize(c.bytes || 0) + (showFolder && f ? ' · ' + f.name : '') +
      (c.footprintError ? ' · emprise illisible' : (!c.footprint ? ' · emprise en calcul' : ''));
    return '<div class="row' + (here ? ' here' : '') + '"><button class="row" style="border:none;padding:0;min-height:52px" data-act="openCarte" data-id="' + esc(c.id) + '">' + fpIcon(c) +
      '<span class="main"><span class="t">' + esc(c.name) + '</span><span class="s">' + esc(sub) + '</span></span>' + (here ? '<span class="badge">ici</span>' : '') + '</button>' +
      '<button class="more" data-act="carteMenu" data-id="' + esc(c.id) + '" aria-label="Actions pour ' + esc(c.name) + '">' + ic('more') + '</button></div>';
  }

  // ══════════════ Météo (Open-Meteo, modèle GEM du Service météorologique du Canada) ══════════════
  // Point fixe : centre de la Réserve faunique Duchénier (aucune position d'employé n'est transmise)
  var METEO_PT = { lat: 48.1428, lon: -68.6286 };
  var METEO_URL = 'https://api.open-meteo.com/v1/forecast?latitude=' + METEO_PT.lat + '&longitude=' + METEO_PT.lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant' +
    '&timezone=America%2FToronto&forecast_days=2&models=gem_seamless';
  function wmoTxt(c) {
    if (c == null) return '';
    if (c === 0) return 'Ensoleillé'; if (c <= 2) return 'Éclaircies'; if (c === 3) return 'Nuageux'; if (c === 45 || c === 48) return 'Brouillard';
    if (c >= 51 && c <= 57) return 'Bruine'; if (c >= 61 && c <= 67) return 'Pluie'; if (c >= 71 && c <= 77) return 'Neige';
    if (c >= 80 && c <= 82) return 'Averses'; if (c === 85 || c === 86) return 'Averses de neige'; if (c >= 95) return 'Orages'; return '';
  }
  function localDay(off) { var d = new Date(Date.now() + (off || 0) * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function meteoDay(off) { // { jour, … } pour aujourd'hui (0) ou demain (1), ou null
    var m = S.meteo; if (!m || !m.daily) return null;
    var k = m.daily.time.indexOf(localDay(off)); if (k < 0) return null;
    var g = function (n) { var a = m.daily[n]; return a ? a[k] : null; };
    return { code: g('weather_code'), tmax: g('temperature_2m_max'), tmin: g('temperature_2m_min'), pluie: g('precipitation_sum'), prob: g('precipitation_probability_max'),
      vent: g('wind_speed_10m_max'), rafales: g('wind_gusts_10m_max'), dir: g('wind_direction_10m_dominant') };
  }
  function r0(x) { return x == null ? '–' : String(Math.round(x)); }
  function meteoLine(d) {
    var pl_ = d.pluie != null && d.pluie >= 0.2 ? fmtNum(d.pluie) + ' mm' + (d.prob != null ? ' (' + Math.round(d.prob) + ' %)' : '') : 'pas de pluie';
    return (wmoTxt(d.code) ? wmoTxt(d.code) + ' · ' : '') + r0(d.tmin) + '° → ' + r0(d.tmax) + '° · vent ' + (d.dir != null ? card(d.dir + 0) + ' ' : '') + r0(d.vent) + ' km/h, rafales ' + r0(d.rafales) + ' · ' + pl_;
  }
  function fmtNum(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }
  async function refreshMeteo(force) {
    if (!S.meteoOn || !navigator.onLine) return;
    var age = S.meteo && S.meteo.at ? Date.now() - Date.parse(S.meteo.at) : Infinity;
    if (!force && age < 2 * 3600e3 && meteoDay(0)) return;
    try {
      var ctl = window.AbortController ? new AbortController() : null; if (ctl) setTimeout(function () { ctl.abort(); }, 12000);
      var r = await fetch(METEO_URL, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }); if (!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json(); if (!j.daily || !j.daily.time) throw new Error('réponse inattendue');
      S.meteo = { at: new Date().toISOString(), daily: j.daily }; await NavDB.setMeta('meteo', S.meteo);
      if (S.tab === 'cartes') renderLib();
    } catch (e) { console.warn('[météo]', e && e.message); }
  }
  function meteoHtml() {
    if (!S.meteoOn) return '';
    var d = meteoDay(0), t = meteoDay(1), h = new Date().getHours();
    if (!d && !t) return navigator.onLine ? '' : '<div class="dash-meteo muted">Météo : pas encore reçue aujourd\'hui (il faut du réseau)</div>';
    var at = S.meteo.at ? new Date(S.meteo.at) : null;
    var age = at ? ' · ' + (localDay(0) === at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0') + '-' + String(at.getDate()).padStart(2, '0') ? 'prise à ' + at.getHours() + ' h ' + String(at.getMinutes()).padStart(2, '0') : 'prise le ' + at.getDate() + '/' + (at.getMonth() + 1)) : '';
    var gust = d && d.rafales != null && d.rafales >= 50;
    return '<button class="dash-meteo' + (gust ? ' warn' : '') + '" data-act="meteoSheet">' +
      (d ? '<span><b>Aujourd\'hui</b> ' + esc(meteoLine(d)) + '</span>' : '') +
      (t && (!d || h >= 14) ? '<span><b>Demain</b> ' + esc(meteoLine(t)) + '</span>' : '') +
      '<span class="src">Open-Meteo · GEM (ECCC)' + esc(age) + '</span></button>';
  }
  function meteoSheet() {
    var rows = [[0, 'Aujourd\'hui'], [1, 'Demain']].map(function (x) {
      var d = meteoDay(x[0]); if (!d) return '';
      return '<div class="disp"><b>' + x[1] + '</b> · ' + esc(wmoTxt(d.code) || '') + '<div class="muted" style="font-size:15px;line-height:1.5;margin-top:4px">' +
        'Température : ' + r0(d.tmin) + ' à ' + r0(d.tmax) + ' °C<br>Vent : ' + r0(d.vent) + ' km/h' + (d.dir != null ? ' de ' + card(d.dir) + ' (' + Math.round(d.dir) + '°)' : '') + ', rafales jusqu\'à ' + r0(d.rafales) + ' km/h<br>' +
        'Précipitations : ' + (d.pluie != null ? fmtNum(d.pluie) + ' mm' : '–') + (d.prob != null ? ', probabilité max. ' + Math.round(d.prob) + ' %' : '') + '</div></div>';
    }).join('');
    openSheet('<h3>Météo à Duchénier</h3>' + (rows || '<p class="muted">Pas de prévision en mémoire.</p>') +
      '<p class="muted" style="font-size:13px;line-height:1.45;margin:10px 2px">Prévision pour le centre de la réserve, prise quand le téléphone avait du réseau' + (S.meteo && S.meteo.at ? ' (' + new Date(S.meteo.at).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) + ')' : '') +
      '. Ce n\'est pas un avertissement officiel : consultez Environnement Canada pour les alertes.<br>Données : Open-Meteo.com (CC BY 4.0), modèle GEM du Service météorologique du Canada.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-act="closeSheet">Fermer</button><button class="btn primary" data-act="meteoRefresh"' + (navigator.onLine ? '' : ' disabled') + '>Actualiser</button></div>');
  }

  // Bandeau de la Bibliothèque : qui, quoi envoyer, quoi faire, reprendre
  function dashHtml() {
    var u = unsent(), nU = u.wps.length + u.trs.length;
    var todo = S.wps.filter(function (w) { return w.statut === 'a_faire' && layerVisible(w.layerId); });
    var lb = S.lastBackup, days = lb ? (Date.now() - Date.parse(lb)) / 864e5 : null, nb = notBackedUp(lb), backupLate = nb > 0 && (days === null || days > 7);
    var last = S.lastCarteId && carteById(S.lastCarteId);
    var who = S.employee ? '<b>' + esc(S.employee) + '</b>' : '<button class="dash-link warn" data-act="dashName">' + ic('edit', 'sm') + 'Entrez votre nom</button>';
    var head = '<div class="dash-l1">' + who + '<span class="muted mono">' + APP_VERSION + '</span>';
    var resume = last ? '<button class="btn dash-resume" data-act="openCarte" data-id="' + esc(last.id) + '" aria-label="Reprendre la carte ' + esc(last.name) + '">' + ic('map', 'sm') + '<span>Reprendre <b>' + esc(last.name) + '</b></span></button>' : '';
    if (!nU && !todo.length && !backupLate) // tout va bien : une seule ligne
      return '<div class="dash calm">' + head + '<span class="ok">Tout est envoyé ✓</span></div>' + meteoHtml() + resume + '</div>';
    var h = '<div class="dash">' + head + '</div>';
    h += nU ? '<div class="dash-r"><span>' + pl(nU, 'relevé à envoyer', 'relevés à envoyer') + ' au bureau</span><button class="btn primary" data-act="sendOffice">' + ic('share', 'sm') + 'Envoyer</button></div>'
      : '<div class="dash-r"><span class="ok">Tout est envoyé ✓</span></div>';
    if (backupLate) h += '<button class="dash-link warn" data-act="dashBackup">' + ic('download', 'sm') + (lb ? 'Sauvegarde complète : il y a ' + pl(Math.floor(days), 'jour') : 'Aucune sauvegarde complète encore') + '</button>';
    if (todo.length) {
      if (S.pos) {
        var nw = todo.slice().sort(function (a, b) { return hav(S.pos, a) - hav(S.pos, b); })[0];
        h += '<button class="dash-near" data-act="nearNav" data-id="' + nw.id + '">' + wpIcon(nw, 28) + '<span class="main"><span class="s">Le plus proche · ' + todo.length + ' à faire</span><span class="t">' + esc(nw.name) + '</span></span><span class="n mono">' + fmtDist(hav(S.pos, nw)) + ' ' + card(bearing(S.pos, nw)) + '</span>' + ic('nav', 'sm') + '</button>';
      } else h += '<button class="dash-link" data-act="dashTodo">' + ic('pin', 'sm') + pl(todo.length, 'site à faire', 'sites à faire') + ' · voir la liste</button>';
    }
    return h + meteoHtml() + resume + '</div>';
  }
  function renderLib() {
    var body = $('#lib-body'), q = S.libQuery.trim().toLowerCase(), html = '';
    var inFolder = !!S.libFolder;
    $('#lib-back').classList.toggle('hidden', !inFolder); $('#view-cartes').classList.toggle('infolder', inFolder);
    $('#lib-folder-more').style.display = inFolder && S.libFolder !== 'none' ? '' : 'none';
    $('#lib-title').textContent = !inFolder ? 'Bibliothèque' : (S.libFolder === 'none' ? 'Sans dossier' : ((folderById(S.libFolder) || {}).name || 'Dossier'));
    if (!S.cartes.length && !S.folders.length) {
      body.innerHTML = dashHtml() + '<div class="empty">Aucune carte pour l\'instant.<br>Touchez <b>Importer</b> pour ajouter un GeoPDF (exporté de QGIS) ou un GeoTIFF.</div>';
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
    html += dashHtml();
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
    var lay = [], cartes = [];
    Array.prototype.forEach.call(files, function (f) { (/\.(geojson|json|kml|kmz|gpx)$/i.test(f.name) ? lay : cartes).push(f); });
    if (lay.length) {
      if (cartes.length) await importCartes(cartes);
      if (lay.length > 1) toast('Calques : un à la fois, par l\'onglet Points. Import de « ' + lay[0].name + ' »', 5000);
      else toast('« ' + lay[0].name + ' » est un calque : il passe par l\'onglet Points', 4000);
      return importLayerFile(lay[0]);
    }
    return importCartes(cartes);
  }
  async function importCartes(files) {
    var folderId = S.tab === 'cartes' && S.libFolder && S.libFolder !== 'none' ? S.libFolder : null, done = [];
    var lourdes = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      toast('Import ' + (i + 1) + '/' + files.length + ' : ' + f.name, 20000);
      try {
        var head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
        if (window.NVPmtiles.isPmtiles(head)) { done.push(await importTuiles(f, folderId)); continue; }
        var ab = await f.arrayBuffer(), kind = window.carteKind(ab);
        if (!kind) throw new Error('format non reconnu (GeoPDF, GeoTIFF ou mosaïque .pmtiles attendu)');
        var blob = new Blob([ab], { type: kind === 'pdf' ? 'application/pdf' : 'image/tiff' });
        var fp = await window.carteFootprint(blob);
        var name = f.name.replace(/\.(pdf|tiff?)$/i, '').replace(/_/g, ' ').trim();
        if (kind === 'pdf') { try { var sc = window.pdfImageScan(ab); if (sc.lourdes || sc.total > 2 * window.NV_PDF_MAX_IMG) lourdes.push({ name: name, sc: sc }); } catch (e) { console.warn('pdfImageScan', e); } }
        var c = await NavDB.addCarte({ name: name, kind: kind, fileName: f.name, folderId: folderId, footprint: fp.footprint, bbox: fp.bbox }, blob);
        S.cartes.push(c); done.push(c);
      } catch (err) {
        var msg = err && err.name === 'QuotaExceededError' ? 'espace de stockage insuffisant sur l\'appareil' : (err && err.message || String(err));
        await confirmSheet('Import impossible', f.name + ' : ' + msg, 'OK');
      }
    }
    toast(done.length ? done.length + ' carte' + (done.length > 1 ? 's importées' : ' importée') : 'Aucune carte importée');
    renderLib();
    if (lourdes.length) { // 5.7.5 : PDF avec des images trop lourdes pour un téléphone
      var mpx = function (v) { return Math.round(v / 1e6) + ' millions de pixels'; };
      var txt = lourdes.map(function (x) {
        return '« ' + x.name + ' » : ' + (x.sc.lourdes ? x.sc.lourdes + ' image' + (x.sc.lourdes > 1 ? 's' : '') + ' trop lourde' + (x.sc.lourdes > 1 ? 's' : '') + ' (la plus grande : ' + mpx(x.sc.plusGrande) + '), qui ne ser' + (x.sc.lourdes > 1 ? 'ont' : 'a') + ' pas affichée' + (x.sc.lourdes > 1 ? 's' : '') + '.' : 'images totalisant ' + mpx(x.sc.total) + ' : la carte pourrait être lente ou faire fermer l\'application.');
      }).join(' ');
      await new Promise(function (ok) { sheetOptions('Carte lourde pour un téléphone', txt + ' Si ces images portent de l\'information, réexportez la carte depuis QGIS avec « Toujours exporter en vecteurs » et sans raster dans la mise en page.', [{ label: 'Compris', cls: 'primary', fn: ok }], true); });
    }
    if (done.length === 1 && isFond(done[0])) sheetOptions('Mosaïque importée', '« ' + done[0].name + ' » est affichée en fond, sous vos cartes PDF et GeoTIFF. Réglez la transparence avec le bouton Calques sur la carte.', [{ label: 'Ouvrir maintenant', icon: 'map', cls: 'primary', fn: function () { openMap(done[0].id); } }, { label: 'Rester dans la bibliothèque', fn: function () {} }], true);
    else if (done.length === 1) sheetOptions('Carte importée', done[0].name, [{ label: 'Ouvrir maintenant', icon: 'map', cls: 'primary', fn: function () { openMap(done[0].id); } }, { label: 'Rester dans la bibliothèque', fn: function () {} }], true);
  }
  async function importTuiles(f, folderId) {
    var info = await window.NVPmtiles.info(f), h = info.header;
    if (h.tileType === 1 || h.tileType > 5) throw new Error('mosaïque vectorielle non prise en charge (images attendues)');
    var fp = await window.carteFootprint(f);
    var name = (h.metadata && h.metadata.name) || f.name.replace(/\.pmtiles$/i, '').replace(/_/g, ' ').trim();
    var c = await NavDB.addCarte({ name: name, kind: 'tuiles', fileName: f.name, folderId: folderId, footprint: fp.footprint, bbox: fp.bbox, minZoom: h.minZoom, maxZoom: h.maxZoom }, f);
    S.cartes.push(c);
    S.fonds[c.id] = { on: true, op: 1, blend: /relief|ombr/i.test(name + ' ' + f.name) };
    await saveFonds();
    return c;
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
    S.map.createPane('cartePane').style.zIndex = 250;
    S.trGroup = L.layerGroup().addTo(S.map);
    S.wpGroup = L.layerGroup().addTo(S.map);
    S.map.on('zoomend', function () { $('#map').classList.toggle('labels', S.map.getZoom() >= 15.5); });
    S.map.on('dragstart', function () { if (S.follow) setFollow(false); });
    S.map.on('move', onMapMove);
  }
  // ── Garde-fou : une carte qui fait planter l'application (mémoire) n'est pas rouverte au démarrage ──
  // Le drapeau reste posé tant qu'une carte PDF/GeoTIFF est affichée ; il est retiré à toute sortie normale
  // (autre onglet, autre carte, application mise en arrière-plan). S'il est encore là au démarrage, c'est un plantage.
  var GARDE_CLE = 'nv_carte_ouverte';
  function gardePose(c) { try { localStorage.setItem(GARDE_CLE, JSON.stringify({ id: c.id, name: c.name, t: Date.now() })); } catch (e) {} }
  function gardeRetire() { try { localStorage.removeItem(GARDE_CLE); } catch (e) {} }
  function gardeLue() { try { var v = JSON.parse(localStorage.getItem(GARDE_CLE) || 'null'); return v && v.id ? v : null; } catch (e) { return null; } }
  function gardeActive() { return $('#view-map').classList.contains('active') && S.carte && !isFond(S.carte) && document.visibilityState === 'visible'; }

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
      if (isFond(c)) {
        var info = await window.NVPmtiles.info(blob);
        if (S.carte !== c) return;
        gardeRetire();
        S.carteLayer = new window.NVPmtiles.Layer(info.pm, info.header, { zIndex: 0 }); // reste sous les ombrages
        S.carteLayer.addTo(S.map);
        c.lastOpened = new Date().toISOString(); NavDB.saveCarte(c); NavDB.setMeta('lastCarteId', id); S.lastCarteId = id;
      } else {
      toast('Ouverture de « ' + c.name + ' »…', 8000);
      gardePose(c);
      var ab = await blob.arrayBuffer();
      if (S.carte !== c) return; // une autre carte a été demandée entre-temps
      S.carteLayer = window.createTiffLayer(ab, { keepView: keep,
        onReady: function () { toast('« ' + c.name + ' » prête'); },
        onError: function (m) { gardeRetire(); toast('Erreur de carte : ' + m, 6000); } });
      S.carteLayer.addTo(S.map);
      c.lastOpened = new Date().toISOString(); NavDB.saveCarte(c);
      NavDB.setMeta('lastCarteId', id); S.lastCarteId = id;
      }
      applyFonds(); applyCarteStyle();
    } else if (opts.center) S.map.setView(opts.center, opts.zoom || Math.max(S.map.getZoom(), 15));
    NavDB.setMeta('lastView', 'map');
    renderOverlays(); updateMapHeader(); updatePosMarker(); updateCoordsBar(); updateNav(); updateRec();
  }
  // ══════════════ Fonds (mosaïques en tuiles) et transparences ══════════════
  function saveFonds() { return NavDB.setMeta('fonds', S.fonds); }
  // Ordre des couches (bas -> haut) : mosaïques et carte ouverte. Ordre par défaut : mosaïques normales par étendue,
  // carte ouverte juste au-dessus, ombrages tout en haut. Un ordre choisi par l'utilisateur (S.ordre) le remplace.
  function ordreEffectif() {
    var ouvert = S.carte && isFond(S.carte) ? S.carte.id : null;
    var fonds = S.cartes.filter(isFond), isBlend = function (c) { return !!(S.fonds[c.id] && S.fonds[c.id].blend); };
    var def = fonds.filter(function (c) { return c.id !== ouvert; }).sort(function (a, b) { return ((isBlend(a) ? 1 : 0) - (isBlend(b) ? 1 : 0)) || (bboxArea(b) - bboxArea(a)); });
    if (ouvert) {
      var k = 0; def.forEach(function (c, i) { if (!isBlend(c)) k = i + 1; });
      def.splice(k, 0, fonds.filter(function (c) { return c.id === ouvert; })[0]);
    }
    var ids = def.map(function (c) { return c.id; });
    var sauv = (S.ordre || []).filter(function (id) { return ids.indexOf(id) >= 0; });
    return sauv.concat(ids.filter(function (id) { return sauv.indexOf(id) < 0; }));
  }
  function fondMove(el) {
    var id = el.dataset.id, d = +el.dataset.dir, o = ordreEffectif(), i = o.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, id); S.ordre = o;
    NavDB.setMeta('ordreCouches', o); applyFonds(); displaySheet();
  }
  function saveCarteStyle() { return NavDB.setMeta('carteStyle', { op: S.carteOpacity, blend: S.carteBlend }); }
  function applyCarteStyle() {
    if (!S.map) return;
    var p = S.map.getPane('cartePane'), fondOuvert = isFond(S.carte);
    p.style.opacity = fondOuvert ? 1 : S.carteOpacity;
    p.classList.toggle('blend-multiply', !fondOuvert && S.carteBlend);
  }
  var _fondsQ = Promise.resolve();
  function applyFonds() { _fondsQ = _fondsQ.then(doApplyFonds).catch(function (e) { console.warn('[fonds]', e); toast('Fond illisible : ' + (e && e.message || e), 5000); }); return _fondsQ; }
  async function doApplyFonds() {
    if (!S.map) return;
    var ordre = ordreEffectif(), zOf = {};
    ordre.forEach(function (id, i) { zOf[id] = i + 1; });
    var wanted = ordre.map(function (id) { return S.cartes.filter(function (c) { return c.id === id; })[0]; })
      .filter(function (c) { return c && S.fonds[c.id] && S.fonds[c.id].on && !(S.carte && S.carte.id === c.id); });
    Object.keys(S.fondLayers).forEach(function (id) {
      if (!wanted.some(function (c) { return c.id === id; })) { S.map.removeLayer(S.fondLayers[id]); delete S.fondLayers[id]; }
    });
    if (isFond(S.carte) && S.carteLayer && S.carteLayer.setZIndex && zOf[S.carte.id]) S.carteLayer.setZIndex(zOf[S.carte.id]);
    for (var i = 0; i < wanted.length; i++) {
      var c = wanted[i], st = S.fonds[c.id], lyr = S.fondLayers[c.id], zi = zOf[c.id];
      if (!lyr) {
        var blob = await NavDB.getCarteBlob(c.id); if (!blob) continue;
        var info = await window.NVPmtiles.info(blob);
        lyr = S.fondLayers[c.id] = new window.NVPmtiles.Layer(info.pm, info.header, { zIndex: zi });
        lyr.addTo(S.map);
      }
      lyr.setZIndex(zi); lyr.setOpacity(st.op);
      var el = lyr.getContainer(); if (el) el.classList.toggle('blend-multiply', !!st.blend);
    }
  }
  function pct(v) { return Math.round(v * 100) + ' %'; }
  function stepper(k, id, v, off) {
    var a = ' data-act="dispStep" data-k="' + k + '"' + (id ? ' data-id="' + esc(id) + '"' : ''), dis = off ? ' disabled' : '';
    return '<span class="stepper"><button class="btn"' + a + ' data-d="-10" aria-label="Moins opaque"' + dis + '>−</button><b class="mono" id="disp-' + k + (id ? '-' + esc(id) : '') + '">' + pct(v) + '</b><button class="btn"' + a + ' data-d="10" aria-label="Plus opaque"' + dis + '>+</button></span>';
  }
  function displaySheet() {
    var ordre = ordreEffectif(), fonds = ordre.slice().reverse().map(function (id) { return S.cartes.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
    var nOrd = ordre.length, sc = $('#sheet').scrollTop;
    var html = '<div class="disp-top"><h3>Affichage</h3><button class="btn" data-act="pointLayersSheet">' + ic('layers') + '<span>Calques</span></button><button class="btn primary" data-act="closeSheet">Fermer</button></div>';
    var nDone = S.wps.filter(function (w) { return w.statut === 'fait'; }).length;
    if (nDone) html += '<div class="disp"><div class="disp-r"><button class="chip tog' + (S.hideDone ? ' on' : '') + '" data-act="hideDone" aria-pressed="' + !!S.hideDone + '">Masquer les sites faits</button><span class="muted s">' + pl(nDone, 'site fait', 'sites faits') + ' · sur la carte seulement</span></div></div>';
    if (S.carte && !isFond(S.carte)) {
      html += '<div class="disp"><div class="disp-r"><b class="nm">' + esc(S.carte.name) + '</b>' + stepper('carteOp', null, S.carteOpacity) + '</div>' +
        '<div class="disp-r"><button class="chip tog' + (S.carteBlend ? ' on' : '') + '" data-act="dispTog" data-k="carteBlend" aria-pressed="' + !!S.carteBlend + '">Blanc transparent</button><span class="muted s">Carte ouverte, toujours au-dessus des fonds</span></div></div>';
    }
    if (!fonds.length) html += '<p class="muted" style="margin:4px 2px 10px">Aucune mosaïque. Importez un fichier .pmtiles (orthophoto, relief) dans la bibliothèque.</p>';
    else html += '<p class="muted" style="margin:6px 2px 6px;font-size:13px">Fonds, du dessus vers le dessous. ▲ ▼ change l\'ordre.</p>';
    fonds.forEach(function (c) {
      var st = S.fonds[c.id] || { on: false, op: 1, blend: false }, ouvert = S.carte && S.carte.id === c.id, on = st.on || ouvert, pos = ordre.indexOf(c.id);
      html += '<div class="disp' + (on ? '' : ' off') + '"><div class="disp-r"><label class="chk nm"><input type="checkbox" data-disp="fondOn" data-id="' + esc(c.id) + '"' + (on ? ' checked' : '') + (ouvert ? ' disabled' : '') + '><span><b>' + esc(c.name) + '</b>' + (ouvert ? '<span class="s">Carte ouverte</span>' : '') + '</span></label>' +
        '<span class="ord"><button class="btn" data-act="fondMove" data-id="' + esc(c.id) + '" data-dir="1" aria-label="Monter"' + (pos >= nOrd - 1 ? ' disabled' : '') + '>▲</button><button class="btn" data-act="fondMove" data-id="' + esc(c.id) + '" data-dir="-1" aria-label="Descendre"' + (pos <= 0 ? ' disabled' : '') + '>▼</button></span></div>' +
        (ouvert ? '' : '<div class="disp-r">' + stepper('fondOp', c.id, st.op, !st.on) + '<button class="chip tog' + (st.blend ? ' on' : '') + '" data-act="dispTog" data-k="fondBlend" data-id="' + esc(c.id) + '" aria-pressed="' + !!st.blend + '"' + (st.on ? '' : ' disabled') + '>Ombrage</button></div>') + '</div>';
    });
    openSheet(html);
    $('#sheet').classList.add('compact'); $('#sheet-bg').classList.add('clear'); $('#sheet').scrollTop = sc;
  }
  async function dispStep(el) {
    var k = el.dataset.k, c = el.dataset.id, d = +el.dataset.d, step = function (v) { return Math.max(0, Math.min(1, Math.round(v * 10 + d / 10) / 10)); };
    if (k === 'carteOp') { S.carteOpacity = step(S.carteOpacity); $('#disp-carteOp').textContent = pct(S.carteOpacity); applyCarteStyle(); saveCarteStyle(); return; }
    var st = S.fonds[c]; if (!st) return;
    st.op = step(st.op); var t = document.getElementById('disp-fondOp-' + c); if (t) t.textContent = pct(st.op);
    if (S.fondLayers[c]) S.fondLayers[c].setOpacity(st.op); saveFonds();
  }
  async function dispTog(el) {
    var k = el.dataset.k, c = el.dataset.id, v;
    if (k === 'carteBlend') { v = S.carteBlend = !S.carteBlend; applyCarteStyle(); saveCarteStyle(); }
    else { var st = S.fonds[c]; if (!st) return; v = st.blend = !st.blend; await saveFonds(); applyFonds(); }
    el.classList.toggle('on', v); el.setAttribute('aria-pressed', String(v));
  }
  async function onDisp(el, final) {
    var k = el.dataset.disp, c = el.dataset.id, st = c ? (S.fonds[c] = S.fonds[c] || { on: false, op: 1, blend: false }) : null;
    if (k === 'carteOp') { S.carteOpacity = el.value / 100; $('#disp-carteOp').textContent = pct(S.carteOpacity); applyCarteStyle(); if (final) saveCarteStyle(); return; }
    if (k === 'carteBlend') { S.carteBlend = el.checked; applyCarteStyle(); saveCarteStyle(); return; }
    if (k === 'fondOp') { st.op = el.value / 100; var t = document.getElementById('disp-op-' + c); if (t) t.textContent = pct(st.op); if (S.fondLayers[c]) S.fondLayers[c].setOpacity(st.op); if (final) saveFonds(); return; }
    if (k === 'fondBlend') { st.blend = el.checked; await saveFonds(); applyFonds(); return; }
    if (k === 'fondOn') { st.on = el.checked; await saveFonds(); applyFonds(); displaySheet(); renderLib(); }
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
    if (S.mire) updateMire(); else if (S.viseur) updateCoordsBar();
    if (S.serie && S.serieCfg.src === 'mire') updateSerieBar();
    clearTimeout(_hdrT); _hdrT = setTimeout(updateMapHeader, 300);
  }
  function renderOverlays() {
    if (!S.map) return;
    S.wpGroup.clearLayers(); S.trGroup.clearLayers();
    S.traces.forEach(function (t) {
      if (!layerVisible(t.layerId) || !t.points || t.points.length < 2) return;
      var lls = t.points.map(function (p) { return [p.lat, p.lon]; }), suivi = S.follow && S.follow.id === t.id;
      if (suivi) L.polyline(isPoly(t) ? lls.concat([lls[0]]) : lls, { color: '#fff', weight: 11, opacity: .85, interactive: false }).addTo(S.trGroup);
      (isPoly(t) && lls.length > 2 ? L.polygon(lls, { color: t.color || '#ff3d00', weight: t.weight || 3, opacity: .95, fillOpacity: .12 }) : L.polyline(lls, { color: t.color || '#ff3d00', weight: suivi ? 6 : (t.weight || 4), opacity: .9 }))
        .on('click', function () { if (S.mire) return; traceMenu(t); }).addTo(S.trGroup);
    });
    S.wps.forEach(function (w) {
      if (!layerVisible(w.layerId)) return;
      if (S.hideDone && w.statut === 'fait' && S.navTarget !== w.id) return;
      var icon = L.divIcon({ className: '', html: '<div class="wp-icon' + (S.navTarget === w.id ? ' target' : '') + (w.statut === 'fait' ? ' done' : '') + '">' + wpIcon(w, 28) + statutBadge(w) + '<div class="wp-label">' + esc(w.name) + '</div></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
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
    if (S.viseur && S.map && !S.mire) { var vi = viseurInfo(); $('#m-coords').textContent = vi.t; $('#m-acc').textContent = ''; $('#m-speed').textContent = vi.sub; $('#m-head').textContent = ''; return; }
    if (!S.pos) { $('#m-coords').textContent = 'Position GPS en attente…'; $('#m-acc').textContent = ''; $('#m-speed').textContent = ''; $('#m-head').textContent = ''; return; }
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
    S.alt = (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null; S.altAcc = (c.altitudeAccuracy != null && isFinite(c.altitudeAccuracy)) ? c.altitudeAccuracy : null;
    if (S.avg) avgSample(S.avg, lat, lon, c.accuracy, S.alt, S.altAcc, now);
    $('#gps-status').innerHTML = '<span class="ok">GPS ±' + Math.round(c.accuracy) + ' m</span>';
    if (S.tracing) {
      var last = S.tracePts[S.tracePts.length - 1];
      if (!last || hav(last, S.pos) > 1 || c.accuracy < 15) { S.tracePts.push({ lat: lat, lon: lon, t: new Date(now).toISOString() }); if (S.traceLine) S.traceLine.addLatLng([lat, lon]); }
      if (S.tracePts.length - S.traceSaved >= 10) persistTrace();
    }
    updatePosMarker(); updateCoordsBar(); updateNav(); if (S.serie) updateSerieBar();
    if (S.follow && S.map) S.map.panTo([lat, lon], { animate: true });
    if (moved) {
      S.lastHereRender = S.pos;
      if ($('#view-cartes').classList.contains('active') && !S.libQuery) renderLib();
      if ($('#view-apercu').classList.contains('active')) renderOvSheet();
      if ($('#view-points').classList.contains('active') && S.ptsMode === 'points' && !document.activeElement.matches('input')) renderPoints();
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
    S.follow = null; S.navTarget = id; renderOverlays(); updateNav(); keepAwake();
    var w = wpById(id); if (w) toast('Navigation vers « ' + w.name + ' »');
  }
  function stopNav() { S.navTarget = null; S.follow = null; $('#nav-banner').classList.add('hidden'); renderOverlays(); keepAwake(); }
  function updateNav() {
    var b = $('#nav-banner');
    if (S.follow) { updateFollow(); return; }
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

  // ── Suivre un tracé : écart latéral ──
  var FOL_OFF = 20, FOL_BACK = 12, FOL_AHEAD = 25;
  function followPts(t, rev) { var p = (t.points || []).map(function (q) { return { lat: q.lat, lon: q.lon }; }); if (isPoly(t) && p.length > 2) p.push(p[0]); return rev ? p.reverse() : p; }
  function startFollow(id, rev) {
    var t = trById(id); if (!t || (t.points || []).length < 2) return;
    S.navTarget = null; var pts = followPts(t, rev), cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
    S.follow = { id: id, rev: !!rev, pts: pts, cum: cum, off: false, arrived: false };
    if (!S.map || !$('#view-map').classList.contains('active')) showOnMap(pts[0].lat, pts[0].lon);
    renderOverlays(); updateNav(); keepAwake(); toast('Suivi de « ' + (t.name || 'Tracé') + ' »' + (rev ? ' (sens inverse)' : ''));
  }
  // Position projetée sur le tracé le plus proche ; écart signé (+ = le tracé est à droite)
  function followState(f, P) {
    var pts = f.pts, kx = 111320 * Math.cos(rad(P.lat)), ky = 110574, best = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = (pts[i].lon - P.lon) * kx, ay = (pts[i].lat - P.lat) * ky, dx = (pts[i + 1].lon - pts[i].lon) * kx, dy = (pts[i + 1].lat - pts[i].lat) * ky, l2 = dx * dx + dy * dy;
      var u = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, px = ax + u * dx, py = ay + u * dy, d = Math.sqrt(px * px + py * py);
      if (!best || d < best.d) best = { i: i, u: u, d: d, side: dx * (-ay) - dy * (-ax) };
    }
    var segLen = f.cum[best.i + 1] - f.cum[best.i], along = f.cum[best.i] + best.u * segLen, total = f.cum[f.cum.length - 1];
    var tgt = pointAlong(f, Math.min(total, along + FOL_AHEAD));
    return { d: best.d, right: best.side > 0, along: along, rem: Math.max(0, total - along), segBr: bearing(pts[best.i], pts[best.i + 1]), tgt: tgt };
  }
  function pointAlong(f, s) {
    var c = f.cum, p = f.pts, i = 0; while (i < c.length - 2 && c[i + 1] < s) i++;
    var L2 = c[i + 1] - c[i], u = L2 > 0 ? (s - c[i]) / L2 : 0;
    return { lat: p[i].lat + u * (p[i + 1].lat - p[i].lat), lon: p[i].lon + u * (p[i + 1].lon - p[i].lon) };
  }
  function updateFollow() {
    var f = S.follow, t = trById(f.id); if (!t) { stopNav(); return; }
    $('#nav-banner').classList.remove('hidden');
    $('#nav-name').textContent = 'Suivre · ' + (t.name || 'Tracé') + (f.rev ? ' (inverse)' : '');
    if (!S.pos) { $('#nav-dist').textContent = '—'; $('#nav-sub').textContent = 'en attente du GPS'; return; }
    var st = followState(f, S.pos);
    $('#nav-dist').textContent = st.d < 3 ? fmtDist(st.d) : (st.right ? fmtDist(st.d) + ' ▶' : '◀ ' + fmtDist(st.d));
    $('#nav-sub').textContent = (st.d < 3 ? 'Sur le tracé' : 'Tracé à ' + (st.right ? 'droite' : 'gauche')) + ' · reste ' + fmtDist(st.rem) + ' · cap ' + deg(st.segBr);
    var br = bearing(S.pos, st.tgt), ref = S.compassOn && S.heading != null ? S.heading : (S.speed > 1 && S.course != null ? S.course : 0);
    $('#nav-arrow').style.transform = 'rotate(' + ((br - ref + 360) % 360) + 'deg)';
    if (st.d > FOL_OFF && !f.off) { f.off = true; toast('Hors du tracé : ' + fmtDist(st.d) + ' à ' + (st.right ? 'droite' : 'gauche'), 4000); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
    if (st.d < FOL_BACK && f.off) { f.off = false; toast('De retour sur le tracé'); }
    if (st.rem < 10 && st.d < FOL_OFF && !f.arrived) { f.arrived = true; toast('Fin du tracé', 4000); if (navigator.vibrate) navigator.vibrate(300); }
    if (st.rem > 25) f.arrived = false;
  }

  // ── Écran allumé pendant un tracé ou une navigation ──
  async function keepAwake() {
    var want = S.tracing || !!S.navTarget || !!S.follow || !!S.avg;
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
    var t = stamp({ id: Date.now(), layerId: lid, name: name || ('Tracé ' + n), points: pts, timestamp: new Date(start || Date.now()).toISOString(), color: (layerById(lid) || {}).color || '#ff3d00', weight: 4 }, true);
    await NavDB.saveTrace(t); S.traces.push(t); renderOverlays();
    toast('« ' + t.name + ' » enregistré — ' + fmtDist(traceDist(pts)));
  }

  // ── Mire : placer, déplacer, mesurer ──
  function enterMire(mode) {
    exitMire(); S.mire = mode;
    syncMire(); $('#mire-bar').classList.remove('hidden'); $('#map-bottom').classList.add('hidden');
    var b = $('#mire-btns');
    if (mode === 'wp') b.innerHTML = '<button class="btn" data-act="exitMire">Annuler</button><button class="btn primary" data-act="mireWp">' + ic('pin') + 'Placer ici</button>';
    if (mode === 'move') b.innerHTML = '<button class="btn" data-act="exitMire">Annuler</button><button class="btn primary" data-act="mireMove">' + ic('move') + 'Déplacer ici</button>';
    if (mode === 'measure') { S.measurePts = []; b.innerHTML = '<button class="btn" data-act="measureUndo" aria-label="Retirer le dernier point">' + ic('undo') + '</button><button class="btn primary" data-act="measureAdd">' + ic('plus') + 'Point</button><button class="btn" data-act="measureEnd">Terminer</button>'; $('#m-measure').classList.add('on'); }
    updateMire();
  }
  function exitMire() {
    if (!S.mire) return;
    S.measureLayers.forEach(function (l) { S.map.removeLayer(l); }); S.measureLayers = []; S.measurePts = [];
    if (S.elastic) { S.map.removeLayer(S.elastic); S.elastic = null; }
    S.mire = null; S.movingWp = null;
    syncMire(); $('#mire-bar').classList.add('hidden'); $('#map-bottom').classList.remove('hidden'); $('#m-measure').classList.remove('on');
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

  function measureEnd() {
    var pts = S.measurePts.slice();
    if (pts.length < 2) { exitMire(); return; }
    var len = traceDist(pts), per = traceDist(pts.concat([pts[0]])), ha = areaHa(pts);
    sheetOptions('Enregistrer la mesure ?', pl(pts.length, 'point') + ' · ' + fmtDist(len) + (pts.length > 2 ? ' · ' + num(ha, 2) + ' ha' : ''), [
      { label: 'Enregistrer comme ligne', sub: 'Longueur ' + fmtDist(len), icon: 'route', cls: 'primary', fn: function () { saveMeasure(pts, 'ligne'); } },
      { label: 'Enregistrer comme polygone', sub: pts.length > 2 ? num(ha, 2) + ' ha · périmètre ' + fmtDist(per) : 'Il faut au moins 3 points', icon: 'ruler', disabled: pts.length < 3, fn: function () { saveMeasure(pts, 'polygone'); } },
      { label: 'Quitter sans enregistrer', icon: 'trash', fn: exitMire },
      { label: 'Continuer la mesure', icon: 'plus', fn: function () {} }
    ], true);
  }
  async function saveMeasure(pts, geom) {
    var lid = await ensureActiveLayer(), n = S.traces.filter(function (t) { return t.geom === geom; }).length + 1;
    var name = await askText(geom === 'polygone' ? 'Nom du polygone' : 'Nom de la ligne', (geom === 'polygone' ? 'Polygone ' : 'Ligne ') + n);
    if (name === null) return; // annulé : la mesure reste à l'écran
    var t = stamp({ id: Date.now(), layerId: lid, name: name || ((geom === 'polygone' ? 'Polygone ' : 'Ligne ') + n), geom: geom, origine: 'mesure',
      points: pts.map(function (p) { return { lat: p.lat, lon: p.lon }; }), timestamp: new Date().toISOString(), color: (layerById(lid) || {}).color || '#ff3d00', weight: 3 }, true);
    await NavDB.saveTrace(t); S.traces.push(t); exitMire(); renderOverlays();
    toast('« ' + t.name + ' » enregistré — ' + (geom === 'polygone' ? num(areaHa(t.points), 2) + ' ha' : fmtDist(traceDist(t.points))));
  }

  // ══════════════ Fiche d'un point ══════════════
  function cartesFor(w) { return S.cartes.filter(function (c) { return covers(c, w.lat, w.lon); }); }
  async function openWp(id, from) {
    var w = wpById(id); if (!w) return;
    S.wpOpen = id; S.wpReturn = from || S.wpReturn || 'points';
    $('#view-wp').classList.add('active');
    var l = layerById(w.layerId), cs = cartesFor(w), props = w.props || {}, fk = ((l && l.fields) || []).map(function (f) { return f.key; }), pk = Object.keys(props).filter(function (k) { return fk.indexOf(k) < 0; });
    $('#wp-body').innerHTML =
      '<div class="photos" id="wp-photos" style="margin-top:8px">' + (w.photoIds || []).map(function () { return '<div class="photo"></div>'; }).join('') + '</div>' +
      '<h2 style="margin:14px 0 8px;font-size:26px;line-height:1.15;-webkit-user-select:text;user-select:text">' + esc(w.name) + '</h2>' +
      '<div class="wrap" style="margin-bottom:14px"><span class="chip">' + wpIcon(w, 22) + esc(NVSym.labelOf(w)) + '</span>' +
      (l ? '<span class="chip"><span class="dot" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + '</span>' : '<span class="chip">Sans calque</span>') +
      (w.imported ? '<span class="chip">' + (w.modified ? 'Importé · modifié' : 'Importé') + '</span>' : '') + '</div>' +
      '<div class="seg statut" style="margin-bottom:14px">' + STATUTS.map(function (x) { return '<button class="' + (w.statut === x[0] ? 'on st-' + x[0] : '') + '" data-act="setStatut" data-id="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      fieldsBlock(w, l) +
      '<div class="tiles" style="margin-bottom:14px"><div class="tile"><span>Distance</span><b id="wp-dist">—</b></div><div class="tile"><span>Cap</span><b id="wp-cap">—</b></div></div>' +
      '<dl class="kv"><dt>Position</dt><dd class="mono">' + esc(fmtLL(w.lat, w.lon)) + '</dd>' +
      (S.coordFmt !== 'dd' ? '<dt>Décimal</dt><dd class="mono">' + esc(fmtLL(w.lat, w.lon, 'dd')) + '</dd>' : '') +
      '<dt>Copier</dt><dd class="mono" style="-webkit-user-select:text;user-select:text">' + NVCoords.plain(w.lat, w.lon) + '</dd>' +
      gpsLines(w.gps).map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') +
      '<dt>Créé</dt><dd>' + esc(fmtDate(w.timestamp)) + '</dd><dt>Cartes</dt><dd>' + (cs.length ? 'Visible sur ' + pl(cs.length, 'carte') + ' : ' + esc(cs.map(function (c) { return c.name; }).join(', ')) : 'Hors de vos cartes') + '</dd>' +
      '<dt>Auteur</dt><dd>' + esc(w.author || (w.imported ? 'Bureau' : '—')) + (w.updatedBy && w.updatedBy !== w.author ? ' · modifié par ' + esc(w.updatedBy) : '') + '</dd>' +
      '<dt>Envoi</dt><dd>' + (w.sentAt ? 'Envoyé au bureau le ' + esc(fmtDate(w.sentAt)) : (w.imported && !w.modified ? 'Reçu du bureau' : 'Pas encore envoyé')) + '</dd></dl>' +
      (w.comment ? '<div class="note" style="margin-top:14px">' + esc(w.comment) + '</div>' : '') +
      (pk.length ? '<div class="section-h"><h2>Attributs du calque</h2></div><dl class="kv">' + pk.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(props[k]) + '</dd>'; }).join('') + '</dl>' : '');
    updateWpLive();
    var photos = await NavDB.getPhotos(w);
    if (S.wpOpen !== id) return;
    $('#wp-photos').innerHTML = photos.map(function (p) { return '<button class="photo" data-act="viewPhoto" data-src="' + esc(p.id) + '"><img src="' + p.data + '" alt="Photo du point"></button>'; }).join('');
  }
  function fieldsBlock(w, l) {
    var fs = (l && l.fields) || []; if (!fs.length) return '';
    var p = w.props || {}, filled = fs.filter(function (f) { return p[f.key] != null && String(p[f.key]) !== ''; }).length;
    return '<div class="note" style="margin-bottom:14px;white-space:normal"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Champs à remplir</b><span class="muted">' + filled + '/' + fs.length + '</span></div><dl class="kv">' +
      fs.map(function (f) { var v = p[f.key]; return '<dt>' + esc(f.label) + '</dt><dd>' + (v != null && String(v) !== '' ? esc(v) : '<span class="muted">—</span>') + '</dd>'; }).join('') +
      '</dl><button class="btn block" style="margin-top:10px" data-act="wpEdit">' + ic('edit', 'sm') + 'Remplir</button></div>';
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
      files = photos.map(function (p, i) { var b = atob(NVExif.inject(p.data, NVExport.photoMeta(w, p, layersById())).split(',')[1]), u = new Uint8Array(b.length); for (var k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return new File([u], 'photo_' + (i + 1) + '.jpg', { type: 'image/jpeg' }); });
    } catch (e) { files = []; }
    var data = { title: w.name, text: text };
    if (files.length && navigator.canShare && navigator.canShare({ files: files })) data.files = files;
    if (navigator.share) { try { await navigator.share(data); } catch (e) { if (e.name !== 'AbortError') toast('Partage impossible : ' + e.message); } }
    else { try { await navigator.clipboard.writeText(text); toast('Coordonnées copiées'); } catch (e) { toast(text, 6000); } }
  }

  // ══════════════ Moyenne de position GPS ══════════════
  var AVG_MAX_ACC = 30, AVG_DURS = [30, 60, 120];
  function avgSample(run, lat, lon, acc, alt, altAcc, t) {
    if (run.done || t === run.lastT) return;
    run.lastT = t;
    if (!(acc > 0) || acc > AVG_MAX_ACC) { run.rejected++; return; }
    run.samples.push({ lat: lat, lon: lon, acc: acc, alt: alt, altAcc: altAcc, t: t });
  }
  // Moyenne pondérée par 1/précision² ; dispersion = écart quadratique moyen autour de la moyenne (m)
  function avgResult(run) {
    var s = run.samples; if (!s.length) return null;
    var sw = 0, la = 0, lo = 0, sa = 0;
    s.forEach(function (p) { var w = 1 / (p.acc * p.acc); sw += w; la += p.lat * w; lo += p.lon * w; sa += p.acc; });
    la /= sw; lo /= sw;
    var kx = 111320 * Math.cos(rad(la)), ky = 110574, ss = 0;
    s.forEach(function (p) { var w = 1 / (p.acc * p.acc), dx = (p.lon - lo) * kx, dy = (p.lat - la) * ky; ss += w * (dx * dx + dy * dy); });
    var al = s.filter(function (p) { return p.alt != null; }), alt = null, altAcc = null;
    if (al.length) { var aw = 0, as = 0, aa = 0; al.forEach(function (p) { var w = p.altAcc > 0 ? 1 / (p.altAcc * p.altAcc) : 1; aw += w; as += p.alt * w; aa += (p.altAcc || 0); }); alt = as / aw; altAcc = aa > 0 ? aa / al.length : null; }
    return { lat: la, lon: lo, n: s.length, spread: Math.sqrt(ss / sw), acc: sa / s.length, alt: alt, altAcc: altAcc,
      dur: Math.round(((run.doneAt || Date.now()) - run.t0) / 1000), rejected: run.rejected };
  }
  function startAvg() {
    if (!S.pos) { toast('Pas encore de position GPS'); return; }
    var run = { t0: Date.now(), dur: S.avgDur || 60, samples: [], rejected: 0, lastT: null, done: false };
    // la dernière lecture connue compte comme première, si elle est récente
    if (S.prevGPS && Date.now() - S.prevGPS.t < 3000) avgSample(run, S.pos.lat, S.pos.lon, S.acc, S.alt, S.altAcc, S.prevGPS.t);
    var use = function () { var r = avgResult(run); if (!r) { toast('Aucune lecture assez précise'); return; } openWpForm(null, { lat: r.lat, lon: r.lon, gps: { src: 'moyenne', acc: r.acc, alt: r.alt, altAcc: r.altAcc, n: r.n, dur: r.dur, spread: r.spread } }); };
    openSheet('<h3>Position moyennée</h3><p>Restez immobile, téléphone à plat ou tenu stable. ' + (navigator.wakeLock ? 'L\'écran reste allumé pendant la mesure.' : 'Gardez l\'écran allumé pendant la mesure.') + '</p><div id="avg-box"></div><div class="chips" id="avg-durs" style="margin:10px 0 2px"><span class="muted" style="font-size:14px;align-self:center">Durée</span>' + AVG_DURS.map(function (d) { return '<button class="chip' + (run.dur === d ? ' on' : '') + '" data-act="avgDur" data-id="' + d + '">' + d + ' s</button>'; }).join('') + '</div>' +
      '<div class="opts"><button class="btn primary" data-act="sheetOpt" data-i="0" id="avg-use">' + ic('check') + '<span>Utiliser cette position</span></button><button class="btn" data-act="closeSheet">Annuler</button></div>', [use]);
    S.avg = run; keepAwake();
    S.avgTimer = setInterval(renderAvg, 500); renderAvg();
  }
  function stopAvg() { clearInterval(S.avgTimer); S.avgTimer = null; S.avg = null; keepAwake(); }
  function renderAvg() {
    var run = S.avg, box = $('#avg-box'); if (!run || !box) return;
    var el = (Date.now() - run.t0) / 1000;
    if (!run.done && el >= run.dur) { run.done = true; run.doneAt = run.t0 + run.dur * 1000; if (navigator.vibrate) navigator.vibrate(200); }
    var r = avgResult(run), pct = Math.min(100, el / run.dur * 100);
    box.innerHTML = '<div class="avgbar' + (run.done ? ' done' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<p class="avg-state">' + (run.done ? 'Mesure terminée — ' + run.dur + ' s' : 'Mesure en cours… ' + Math.floor(el) + ' / ' + run.dur + ' s') + '</p>' +
      '<div class="tiles" style="margin:10px 0"><div class="tile"><span>Lectures</span><b>' + (r ? r.n : 0) + '</b></div><div class="tile"><span>Dispersion</span><b>' + (r && r.n > 1 ? num(r.spread, r.spread < 10 ? 1 : 0) + ' m' : '—') + '</b></div>' +
      '<div class="tile"><span>Précision déclarée</span><b>' + (r ? '±' + Math.round(r.acc) + ' m' : '—') + '</b></div><div class="tile"><span>Altitude</span><b>' + (r && r.alt != null ? Math.round(r.alt) + ' m' : '—') + '</b></div></div>' +
      '<p class="mono" style="font-size:15px;margin:0 2px">' + (r ? esc(fmtLL(r.lat, r.lon)) : 'En attente d\'une lecture à ±' + AVG_MAX_ACC + ' m ou mieux…') + '</p>' +
      (run.rejected ? '<p class="muted" style="font-size:13px;margin:4px 2px">' + pl(run.rejected, 'lecture écartée', 'lectures écartées') + ' (précision au-delà de ' + AVG_MAX_ACC + ' m)</p>' : '');
    var b = $('#avg-use'); if (b) b.disabled = !r;
  }
  var SRC_LABEL = { gps: 'GPS', moyenne: 'Position moyennée', viseur: 'Viseur', mire: 'Mire', coordonnees: 'Coordonnées saisies', deplace: 'Déplacé à la mire', projection: 'Par cap et distance' };
  function gpsLines(g) {
    if (!g || !g.src) return [];
    var out = [];
    if (g.src === 'moyenne') out.push(['Précision', 'Moyenne de ' + pl(g.n, 'lecture') + ' sur ' + g.dur + ' s · dispersion ' + num(g.spread, g.spread < 10 ? 1 : 0) + ' m · ±' + Math.round(g.acc) + ' m déclarés']);
    else if (g.src === 'gps') out.push(['Précision', g.acc != null ? '±' + Math.round(g.acc) + ' m (GPS, lecture unique)' : 'GPS']);
    else if (g.src === 'projection') out.push(['Source', 'Projeté à ' + fmtDist(g.dist) + ', cap ' + num(g.cap, 1) + '° ' + (g.ref === 'magnetique' ? 'magnétique (déclinaison ' + num(g.decl, 1) + '°, cap vrai ' + num(g.capVrai, 1) + '°)' : 'vrai') + ' depuis ' + (g.fromSrc === 'gps' ? 'la position GPS' + (g.fromAcc != null ? ' (±' + Math.round(g.fromAcc) + ' m)' : '') : 'le centre de la carte')]);
    else out.push(['Source', SRC_LABEL[g.src] || g.src]);
    if (g.alt != null) out.push(['Altitude', Math.round(g.alt) + ' m' + (g.altAcc ? ' (±' + Math.round(g.altAcc) + ' m)' : '') + ' — GPS, indicative']);
    return out;
  }

  // ══════════════ Point par cap et distance ══════════════
  function destPoint(p, brg, dist) {
    var R = 6371008.8, d = dist / R, b = rad(brg), la1 = rad(p.lat), lo1 = rad(p.lon);
    var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
    var lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: la2 * 180 / Math.PI, lon: ((lo2 * 180 / Math.PI) + 540) % 360 - 180 };
  }
  function pnum(v) { if (v == null) return NaN; v = String(v).trim().replace(',', '.').replace('−', '-'); return v === '' ? NaN : +v; }
  async function projSheet() {
    var decl = await NavDB.getMeta('declinaison'), P = S.proj = { src: S.pos ? 'gps' : 'viseur', ref: decl != null ? 'magnetique' : 'vrai', decl: decl != null ? decl : '' };
    var chips = function (k, list) { return '<div class="chips">' + list.map(function (o) { return '<button class="chip' + (P[k] === o[0] ? ' on' : '') + '" data-act="projOpt" data-k="' + k + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; };
    openSheet('<h3>Point par cap et distance</h3><p>Pour un site vu de loin : nid de l\'autre côté du lac, barrage sur l\'autre rive.</p>' +
      '<div class="field"><span>Depuis</span>' + chips('src', [['gps', 'Ma position GPS'], ['viseur', 'Centre de la carte']]) + '</div>' +
      '<div class="proj-row"><label class="field"><span>Cap (°)</span><input class="input" id="proj-cap" inputmode="decimal" placeholder="ex. 245" autocomplete="off"></label>' +
      '<label class="field"><span>Distance (m)</span><input class="input" id="proj-dist" inputmode="decimal" placeholder="ex. 150" autocomplete="off"></label></div>' +
      '<div class="field"><span>Le cap est mesuré par rapport au nord</span>' + chips('ref', [['vrai', 'Vrai (carte)'], ['magnetique', 'Magnétique (boussole)']]) + '</div>' +
      '<label class="field" id="proj-decl-f"' + (P.ref === 'magnetique' ? '' : ' style="display:none"') + '><span>Déclinaison magnétique (°, ouest = négatif)</span><input class="input" id="proj-decl" inputmode="decimal" placeholder="ex. −16" value="' + esc(String(P.decl)) + '" autocomplete="off"></label>' +
      '<p class="mono" id="proj-out" style="font-size:15px;color:var(--text);margin:6px 2px 12px">—</p>' +
      '<div class="opts"><button class="btn primary" data-act="projOk" id="proj-ok" disabled>' + ic('check') + '<span>Continuer</span></button><button class="btn" data-act="closeSheet">Annuler</button></div>');
    ['proj-cap', 'proj-dist', 'proj-decl'].forEach(function (id) { $('#' + id).addEventListener('input', projUpdate); });
    setTimeout(function () { var c = $('#proj-cap'); if (c) c.focus(); }, 300);
    projUpdate();
  }
  function projCalc() {
    var P = S.proj; if (!P) return null;
    var o = P.src === 'gps' ? (S.pos ? { lat: S.pos.lat, lon: S.pos.lon } : null) : (S.map ? ll(S.map.getCenter()) : null);
    var cap = pnum($('#proj-cap').value), dist = pnum($('#proj-dist').value), decl = pnum($('#proj-decl').value);
    if (!o) return { err: P.src === 'gps' ? 'Position GPS en attente' : 'Carte non ouverte' };
    if (!(cap >= 0 && cap <= 360)) return { err: 'Cap : un nombre de 0 à 360' };
    if (!(dist > 0 && dist <= 20000)) return { err: 'Distance : un nombre de mètres, jusqu\'à 20 km' };
    if (P.ref === 'magnetique' && !(decl >= -40 && decl <= 40)) return { err: 'Déclinaison : un nombre, ex. −16 (ouest = négatif)' };
    var vrai = ((P.ref === 'magnetique' ? cap + decl : cap) % 360 + 360) % 360, d = destPoint(o, vrai, dist);
    return { o: o, cap: cap, vrai: vrai, dist: dist, decl: P.ref === 'magnetique' ? decl : null, lat: d.lat, lon: d.lon };
  }
  function projUpdate() {
    var r = projCalc(), out = $('#proj-out'), ok = $('#proj-ok'); if (!out) return;
    out.textContent = !r ? '—' : r.err ? r.err : '→ ' + fmtLL(r.lat, r.lon) + (r.decl != null ? ' (cap vrai ' + deg(r.vrai) + ')' : '');
    out.style.color = r && r.err ? 'var(--muted)' : 'var(--text)'; ok.disabled = !r || !!r.err;
  }
  async function projOk() {
    var r = projCalc(); if (!r || r.err) return;
    var P = S.proj; if (r.decl != null) await NavDB.setMeta('declinaison', r.decl);
    closeSheet(); S.proj = null;
    openWpForm(null, { lat: r.lat, lon: r.lon, gps: { src: 'projection', from: { lat: r.o.lat, lon: r.o.lon }, fromSrc: P.src, fromAcc: P.src === 'gps' ? S.acc : null, cap: r.cap, ref: P.ref, decl: r.decl, capVrai: r.vrai, dist: r.dist } });
  }

  // ══════════════ Formulaire d'un point ══════════════
  async function openWpForm(wp, latlng) {
    var lid = wp ? wp.layerId : await ensureActiveLayer();
    var base = wp ? Object.assign({}, wp) : { name: 'WP-' + (S.wps.length + 1), comment: '', sym: S.lastSym || 'point', color: null, layerId: lid, lat: latlng.lat, lon: latlng.lon, gps: latlng.gps || (latlng.manual ? { src: 'coordonnees' } : null) };
    var photos = wp ? (await NavDB.getPhotos(wp)).map(function (p) { return { id: p.id, data: p.data, taken: p.taken }; }) : [];
    base.props = Object.assign({}, base.props || {});
    S.form = { origStatut: base.statut || '', edit: !!wp, wp: base, photos: photos, removed: [], coordFmt: S.coordFmt, showCoords: !!(latlng && latlng.manual) };
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
    if (g('wpf-color') != null && f.colorTouched) f.wp.color = g('wpf-color');
    document.querySelectorAll('#wpf-body input[data-k]').forEach(function (inp) { f.wp.props = f.wp.props || {}; var v = inp.value.trim(); if (v === '') delete f.wp.props[inp.dataset.k]; else f.wp.props[inp.dataset.k] = inp.inputMode === 'decimal' && !isNaN(parseFloat(v.replace(',', '.'))) ? parseFloat(v.replace(',', '.')) : v; });
  }
  function coordInputs(fmt, lat, lon) {
    var inp = function (id, val, lbl, mode) { return '<input class="input mono" id="' + id + '" inputmode="' + (mode || 'decimal') + '" value="' + val + '" aria-label="' + lbl + '">'; };
    var hemi = function (id, v, pos, neg) { return '<select class="input" id="' + id + '" aria-label="hémisphère"><option' + (v >= 0 ? ' selected' : '') + '>' + pos + '</option><option' + (v < 0 ? ' selected' : '') + '>' + neg + '</option></select>'; };
    if (fmt === 'utm' || fmt === 'mtm') {
      var p = NVCoords.toTM(lat, lon, NVCoords.ZONES[fmt]);
      return '<div class="grid2">' + inp('wpf-e', Math.round(p.e), 'Est (m)', 'numeric') + inp('wpf-n', Math.round(p.n), 'Nord (m)', 'numeric') + '</div><span class="muted" style="font-size:13px">' + NVCoords.ZONES[fmt].label + ' — Est, Nord en mètres (NAD83)</span>';
    }
    if (fmt === 'dms' || fmt === 'ddm') {
      var row = function (pre, v, pos, neg) {
        var a = Math.abs(v), d = Math.floor(a), md = (a - d) * 60, m = Math.floor(md), sec = (md - m) * 60;
        return '<div style="display:grid;grid-template-columns:1fr ' + (fmt === 'dms' ? '1fr 1.3fr' : '1.6fr') + ' 1fr;gap:6px">' + inp(pre + '-d', d, 'degrés', 'numeric') +
          (fmt === 'dms' ? inp(pre + '-m', m, 'minutes', 'numeric') + inp(pre + '-s', sec.toFixed(2), 'secondes') : inp(pre + '-m', md.toFixed(4), 'minutes décimales')) + hemi(pre + '-h', v, pos, neg) + '</div>';
      };
      return '<span class="muted" style="font-size:13px">Latitude</span>' + row('wpf-la', lat, 'N', 'S') + '<span class="muted" style="font-size:13px">Longitude</span>' + row('wpf-lo', lon, 'E', 'O');
    }
    return '<div class="grid2">' + inp('wpf-lat', lat.toFixed(6), 'Latitude') + inp('wpf-lon', lon.toFixed(6), 'Longitude') + '</div>';
  }
  function renderWpForm() {
    var f = S.form, w = f.wp, html = '', col = w.color || (NVSym.BY[w.sym || 'point'] || NVSym.BY.point).color;
    html += '<label class="field"><span>Nom</span><input class="input" id="wpf-name" maxlength="60" value="' + esc(w.name) + '"></label>';
    html += '<label class="field"><span>Calque</span><select class="input" id="wpf-layer" data-act-change="layerSelect">' + S.layers.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === w.layerId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '<option value="__new">+ Nouveau calque…</option></select></label>';
    html += '<div class="field"><span>Symbole' + (w.sym ? ' : ' + esc(NVSym.BY[w.sym].label) : ' (ancien symbole — choisissez-en un)') + '</span><div class="symgrid">' + NVSym.LIST.map(function (s) {
      return '<button class="symbtn' + (w.sym === s.id ? ' on' : '') + '" data-act="fSym" data-id="' + s.id + '" aria-label="' + esc(s.label) + '">' + NVSym.svg(s.id, w.sym === s.id ? col : null, 34) + '<span>' + esc(s.short) + '</span></button>';
    }).join('') + '</div></div>';
    html += '<div class="field"><span>Couleur</span><div class="wrap" style="align-items:center"><label class="sym" style="position:relative;overflow:hidden;width:auto;padding:0 14px;gap:10px" aria-label="Couleur"><span style="width:28px;height:28px;border-radius:14px;background:' + esc(col) + ';border:2px solid #fff"></span>Changer<input type="color" id="wpf-color" value="' + esc(col) + '" data-act-change="fColor" style="position:absolute;inset:0;opacity:0"></label>' +
      (w.color ? '<button class="btn" style="min-height:52px" data-act="fColorReset">Couleur du symbole</button>' : '') + '</div></div>';
    html += '<div class="field"><span>Statut</span><div class="seg statut"><button class="' + (!w.statut ? 'on' : '') + '" data-act="fStatut" data-id="">Aucun</button>' + STATUTS.map(function (x) { return '<button class="' + (w.statut === x[0] ? 'on st-' + x[0] : '') + '" data-act="fStatut" data-id="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    var lay = layerById(w.layerId), fs = (lay && lay.fields) || [], pv = w.props || {};
    if (fs.length) {
      html += '<div class="field"><span>Champs du calque « ' + esc(lay.name) + ' »</span><div style="display:flex;flex-direction:column;gap:12px">' + fs.map(function (fd, i) {
        var v = pv[fd.key] == null ? '' : String(pv[fd.key]), lab = '<span style="font-size:15px;font-weight:700">' + esc(fd.label) + '</span>';
        if (fd.type === 'choix' || fd.type === 'ouinon') {
          var ch = fd.type === 'ouinon' ? ['Oui', 'Non'] : fd.choices;
          return '<div style="display:flex;flex-direction:column;gap:6px">' + lab + '<div class="wrap">' + ch.map(function (c) { return '<button class="chip' + (v === c ? ' on' : '') + '" data-act="fChoice" data-k="' + esc(fd.key) + '" data-v="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>';
        }
        return '<label style="display:flex;flex-direction:column;gap:6px">' + lab + '<input class="input" id="wpf-f-' + i + '" data-k="' + esc(fd.key) + '" value="' + esc(v) + '"' + (fd.type === 'nombre' ? ' inputmode="decimal"' : '') + '></label>';
      }).join('') + '</div></div>';
    }
    html += '<div class="field"><span>Photos</span><div class="photos">' + f.photos.map(function (p, i) { return '<div class="photo"><img src="' + p.data + '" alt=""><button class="del" data-act="fPhotoDel" data-i="' + i + '" aria-label="Retirer la photo">' + ic('x', 'sm') + '</button></div>'; }).join('') +
      '<button class="photo-add" data-act="fPhotoAdd">' + ic('camera') + 'Ajouter</button></div></div>';
    html += '<label class="field"><span>Commentaire</span><textarea class="input" id="wpf-comment" rows="3">' + esc(w.comment) + '</textarea></label>';
    html += '<div class="field"><span>Position</span><div class="mono" style="font-size:16px">' + esc(fmtLL(w.lat, w.lon)) + '</div>' + gpsLines(w.gps).map(function (x) { return '<div class="muted" style="font-size:14px;line-height:1.35">' + esc(x[0]) + ' : ' + esc(x[1]) + '</div>'; }).join('');
    if (!f.showCoords) html += '<button class="btn" style="margin-top:6px" data-act="fCoords">' + ic('edit', 'sm') + 'Entrer des coordonnées</button>';
    else {
      html += '<div class="chips" style="margin:8px 0">' + NVCoords.FORMATS.map(function (x) { return '<button class="chip' + (f.coordFmt === x[0] ? ' on' : '') + '" data-act="fFmt" data-id="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px">' + coordInputs(f.coordFmt, w.lat, w.lon) + '</div>';
      html += '<button class="btn" style="margin-top:8px" data-act="fCoordsApply">' + ic('check', 'sm') + 'Appliquer ces coordonnées</button>';
    }
    html += '</div>';
    $('#wpf-body').innerHTML = html;
  }
  function readCoords() {
    var f = S.form, lat, lon, v = function (id) { return parseFloat(String($('#' + id).value).replace(',', '.').replace(/\s/g, '')); };
    if (f.coordFmt === 'dd') { lat = v('wpf-lat'); lon = v('wpf-lon'); }
    else if (f.coordFmt === 'utm' || f.coordFmt === 'mtm') { var g = NVCoords.fromTM(v('wpf-e'), v('wpf-n'), NVCoords.ZONES[f.coordFmt]); lat = g.lat; lon = g.lon; }
    else {
      var part = function (pre) { var d = v(pre + '-d') || 0, m = v(pre + '-m') || 0, sec = f.coordFmt === 'dms' ? (v(pre + '-s') || 0) : 0; return d + m / 60 + sec / 3600; };
      lat = part('wpf-la') * ($('#wpf-la-h').value === 'S' ? -1 : 1);
      lon = part('wpf-lo') * ($('#wpf-lo-h').value === 'O' ? -1 : 1);
    }
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { toast('Coordonnées invalides'); return false; }
    if (Math.abs(lat - f.wp.lat) > 1e-7 || Math.abs(lon - f.wp.lon) > 1e-7) f.wp.gps = { src: 'coordonnees' };
    f.wp.lat = lat; f.wp.lon = lon; return true;
  }
  async function saveWpForm() {
    syncForm();
    var f = S.form, w = f.wp;
    if (f.showCoords && !readCoords()) return;
    w.name = (w.name || '').trim() || ('WP-' + (S.wps.length + 1)); w.comment = (w.comment || '').trim();
    if (!f.edit) { w.id = Date.now(); w.timestamp = new Date().toISOString(); w.photoIds = []; stamp(w, true); }
    else { w.sentAt = null; if (w.imported) w.modified = true; stamp(w); }
    if (w.statut !== f.origStatut) w.statutAt = new Date().toISOString();
    if (w.sym) S.lastSym = w.sym;
    for (var i = 0; i < f.removed.length; i++) await NavDB.deletePhoto(f.removed[i]);
    var ids = [];
    for (var j = 0; j < f.photos.length; j++) { var p = f.photos[j]; ids.push(p.id || await NavDB.addPhoto(w.id, p.data, p.taken)); }
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
  function resizePhoto(file) { // → { data, taken } : photo réduite + date de prise de vue (EXIF, sinon date du fichier)
    var taken = (file.arrayBuffer ? file.arrayBuffer() : Promise.reject()).then(function (b) { return NVExif.readDate(b); }).catch(function () { return null; });
    return Promise.all([taken, resizeOnly(file)]).then(function (r) {
      return r[1] ? { data: r[1], taken: r[0] || new Date(file.lastModified || Date.now()).toISOString() } : null;
    });
  }
  function resizeOnly(file) {
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

  // ══════════════ Relevé en série ══════════════
  function serieName(n) { var c = S.serieCfg; return (c.prefix || '') + String(n).padStart(3, '0'); }
  function serieMax(prefix) { // plus grand numéro déjà utilisé avec ce préfixe
    var m = 0, re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
    S.wps.forEach(function (w) { var r = re.exec(w.name || ''); if (r) m = Math.max(m, +r[1]); });
    return m;
  }
  function serieFields(lay) { return ((lay && lay.fields) || []).filter(function (f) { return f.type === 'nombre' || f.type === 'texte'; }); }
  function serieSync() {
    var c = S.serieCfg, g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g('se-layer') != null) c.layerId = g('se-layer');
    if (g('se-sym') != null) c.sym = g('se-sym');
    if (g('se-prefix') != null) c.prefix = g('se-prefix').trim();
    if (g('se-next') != null) c.next = Math.max(1, parseInt(g('se-next'), 10) || 1);
    if (g('se-field') != null) c.field = g('se-field');
    if (g('se-newfield') != null) c.newField = g('se-newfield').trim();
  }
  async function serieSheet() {
    var lid = await ensureActiveLayer(), saved = (await NavDB.getMeta('serie')) || {};
    var c = S.serieCfg = Object.assign({ prefix: 'P-', sym: 'point', field: '', src: 'gps' }, saved, { layerId: layerById(saved.layerId) ? saved.layerId : lid, newField: '' });
    c.next = Math.max(saved.prefix === c.prefix && saved.next ? saved.next : 1, serieMax(c.prefix) + 1);
    renderSerieSheet();
  }
  function renderSerieSheet() {
    var c = S.serieCfg, lay = layerById(c.layerId), fs = serieFields(lay);
    if (c.field && c.field !== '__new' && !fs.some(function (f) { return f.key === c.field; })) c.field = '';
    var html = '<h3>Relevé en série</h3><p class="muted" style="margin:0 2px 10px;font-size:14px;line-height:1.4">Des points rapides, l\'un après l\'autre : même calque et même pictogramme, nom numéroté tout seul, une seule valeur à taper.</p>' +
      '<label class="field"><span>Calque</span><select class="input" id="se-layer" data-act-change="serieRefresh">' + S.layers.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === c.layerId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Pictogramme</span><select class="input" id="se-sym">' + NVSym.LIST.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.sym ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Préfixe du nom</span><input class="input" id="se-prefix" maxlength="20" value="' + esc(c.prefix) + '" autocomplete="off"></label>' +
      '<label class="field"><span>Prochain numéro</span><input class="input" id="se-next" inputmode="numeric" value="' + c.next + '"></label></div>' +
      '<label class="field"><span>Valeur à taper pour chaque point</span><select class="input" id="se-field" data-act-change="serieRefresh"><option value="">Aucune</option>' + fs.map(function (f) { return '<option value="' + esc(f.key) + '"' + (f.key === c.field ? ' selected' : '') + '>' + esc(f.label) + (f.type === 'nombre' ? ' (nombre)' : '') + '</option>'; }).join('') + '<option value="__new"' + (c.field === '__new' ? ' selected' : '') + '>+ Nouveau champ numérique…</option></select></label>' +
      (c.field === '__new' ? '<label class="field"><span>Nom du nouveau champ</span><input class="input" id="se-newfield" maxlength="40" placeholder="ex. Profondeur (m)" value="' + esc(c.newField || '') + '"></label>' : '') +
      '<div class="field"><span>Position de chaque point</span><div class="seg"><button class="' + (c.src === 'gps' ? 'on' : '') + '" data-act="serieSrc" data-id="gps">Ma position GPS</button><button class="' + (c.src === 'mire' ? 'on' : '') + '" data-act="serieSrc" data-id="mire">Centre de la carte</button></div></div>' +
      '<div class="grid2" style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:6px"><button class="btn" data-act="closeSheet">Annuler</button><button class="btn primary" data-act="serieStart">' + ic('check', 'sm') + 'Commencer</button></div>';
    openSheet(html);
  }
  async function serieStart() {
    serieSync(); var c = S.serieCfg, lay = layerById(c.layerId);
    if (!lay) { toast('Choisissez un calque'); return; }
    if (c.field === '__new') {
      if (!c.newField) { toast('Donnez un nom au nouveau champ'); return; }
      var key = NVImport.slugKey(c.newField), k = 2; while ((lay.fields || []).some(function (f) { return f.key === key; })) key = NVImport.slugKey(c.newField) + '_' + (k++);
      lay.fields = (lay.fields || []).concat([{ key: key, label: c.newField, type: 'nombre', choices: [] }]); await NavDB.saveLayer(lay); c.field = key;
    }
    delete c.newField;
    await NavDB.setMeta('serie', c);
    closeSheet(); exitMire();
    S.serie = { n: 0, ids: [] };
    var fd = serieField();
    $('#serie-val').innerHTML = fd ? '<label class="serie-in"><span>' + esc(fd.label) + '</span><input class="input" id="serie-input" autocomplete="off" enterkeyhint="done"' + (fd.type === 'nombre' ? ' inputmode="decimal"' : '') + '></label>' : '';
    $('#serie-bar').classList.remove('hidden'); $('#map-bottom').classList.add('hidden'); syncMire();
    updateSerieBar();
    toast('Série « ' + (c.prefix || 'sans préfixe') + ' » : ' + (c.src === 'gps' ? 'chaque point prend votre position GPS' : 'chaque point se place au centre de la carte'), 3500);
  }
  function serieField() { var c = S.serieCfg, lay = c && layerById(c.layerId); return c && c.field ? (lay && lay.fields || []).find(function (f) { return f.key === c.field; }) : null; }
  function updateSerieBar() {
    if (!S.serie) return;
    var c = S.serieCfg, info;
    if (c.src === 'mire') { var m = ll(S.map.getCenter()); info = fmtLL(m.lat, m.lon); }
    else info = S.pos ? 'GPS ±' + Math.round(S.acc) + ' m' : 'Position GPS en attente…';
    $('#serie-info').textContent = info + ' · ' + (S.serie.n ? pl(S.serie.n, 'point enregistré', 'points enregistrés') : 'aucun point encore');
    var b = $('#serie-save'); b.innerHTML = ic('check', 'sm') + esc(serieName(c.next)); b.disabled = c.src === 'gps' && !S.pos;
    $('#serie-undo').disabled = !S.serie.ids.length;
  }
  async function serieSave() {
    if (!S.serie) return;
    var c = S.serieCfg, lay = layerById(c.layerId), fd = serieField(), inp = $('#serie-input'), props = {}, raw = '';
    if (!lay) { toast('Calque introuvable'); return; }
    var pos;
    if (c.src === 'mire') { var m = ll(S.map.getCenter()); pos = { lat: m.lat, lon: m.lon, gps: { src: 'mire' } }; }
    else { if (!S.pos) { toast('Position GPS en attente'); return; } pos = { lat: S.pos.lat, lon: S.pos.lon, gps: { src: 'gps', acc: S.acc, alt: S.alt, altAcc: S.altAcc } }; }
    if (fd) {
      raw = (inp && inp.value || '').trim();
      if (!raw) { toast('Entrez « ' + fd.label + ' »'); if (inp) inp.focus(); return; }
      if (fd.type === 'nombre') { var v = pnum(raw); if (isNaN(v)) { toast('« ' + fd.label + ' » : un nombre est attendu'); if (inp) inp.focus(); return; } props[fd.key] = v; }
      else props[fd.key] = raw;
    }
    var now = new Date().toISOString();
    var w = stamp({ id: Date.now(), timestamp: now, name: serieName(c.next), comment: '', sym: c.sym, color: null, layerId: lay.id, lat: pos.lat, lon: pos.lon, gps: pos.gps, props: props, photoIds: [] }, true);
    await NavDB.saveWaypoint(w); S.wps.push(w); S.serie.ids.push(w.id); S.serie.n++; c.next++;
    NavDB.setMeta('serie', c);
    renderOverlays();
    try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {}
    toast('« ' + w.name + ' » enregistré' + (fd ? ' — ' + raw : '') + (pos.gps.acc != null ? ' (±' + Math.round(pos.gps.acc) + ' m)' : ''), 2200);
    if (inp) { inp.value = ''; inp.focus(); }
    updateSerieBar();
  }
  async function serieUndo() {
    if (!S.serie || !S.serie.ids.length) return;
    var id = S.serie.ids.pop(), w = wpById(id); if (!w) return;
    await NavDB.deleteWaypoint(w); S.wps = S.wps.filter(function (x) { return x.id !== id; });
    S.serie.n--; S.serieCfg.next--; NavDB.setMeta('serie', S.serieCfg);
    renderOverlays(); toast('« ' + w.name + ' » retiré'); updateSerieBar();
  }
  function serieEnd(silent) {
    if (!S.serie) return;
    var n = S.serie.n; S.serie = null;
    $('#serie-bar').classList.add('hidden'); $('#map-bottom').classList.remove('hidden'); syncMire(); updateCoordsBar();
    if (!silent) toast(n ? 'Série terminée : ' + pl(n, 'point') + ' — à envoyer au bureau' : 'Série terminée');
  }

  // ══════════════ Points et tracés ══════════════
  function unsent() {
    return { wps: S.wps.filter(function (w) { return !w.sentAt && (!w.imported || w.modified); }),
      trs: S.traces.filter(function (t) { return !t.sentAt && !t.imported; }) };
  }
  function renderPoints() {
    var u = unsent(), html = '';
    html += '<button class="btn primary big" style="margin-top:6px" data-act="sendOffice">' + ic('share') + '<span>Envoyer au bureau' + (u.wps.length + u.trs.length ? '<span style="display:block;font-size:14px;font-weight:400">' + pl(u.wps.length, 'nouveau point', 'nouveaux points') + ' · ' + pl(u.trs.length, 'tracé') + '</span>' : '<span style="display:block;font-size:14px;font-weight:400">Tout a été envoyé</span>') + '</span></button>';
    var todo = S.wps.filter(function (w) { return w.statut === 'a_faire' && layerVisible(w.layerId); });
    if (todo.length) {
      if (S.pos) {
        var nw = todo.slice().sort(function (a, b) { return hav(S.pos, a) - hav(S.pos, b); })[0];
        html += '<div class="section-h"><h2>À faire près de vous</h2><button class="btn" style="min-height:44px" data-act="ptsStat" data-id="a_faire">Les ' + todo.length + ' sites</button></div>' +
          '<div class="list"><button class="row" data-act="nearNav" data-id="' + nw.id + '">' + wpIcon(nw, 30) + '<span class="main"><span class="t">' + esc(nw.name) + '</span><span class="s">Le plus proche · ' + esc((layerById(nw.layerId) || {}).name || '') + '</span></span><span class="n">' + fmtDist(hav(S.pos, nw)) + ' ' + card(bearing(S.pos, nw)) + '</span>' + ic('nav', 'sm') + '</button></div>';
      } else html += '<p class="muted" style="margin:12px 2px 0;font-size:14px">' + pl(todo.length, 'site à faire', 'sites à faire') + ' · le plus proche s\'affichera dès que le GPS aura votre position.</p>';
    }
    html += '<div class="section-h"><h2>Calques</h2><span style="display:flex;gap:8px"><button class="btn" style="min-height:44px" data-act="importLayer">' + ic('download', 'sm') + 'Importer</button><button class="btn" style="min-height:44px" data-act="newLayer">' + ic('plus', 'sm') + 'Nouveau</button></span></div>';
    if (!S.layers.length) html += '<div class="empty" style="padding:14px">Aucun calque. Il sera créé avec votre premier point, ou importez celui que le bureau vous a envoyé (GeoJSON, KML, GPX).</div>';
    else {
      html += '<div class="list">' + S.layers.map(function (l) {
        var nw = S.wps.filter(function (w) { return w.layerId === l.id; }).length, nt = S.traces.filter(function (t) { return t.layerId === l.id; }).length, vis = l.visible !== false;
        var lw = S.wps.filter(function (w) { return w.layerId === l.id; }), st = lw.filter(function (w) { return w.statut; }), done = st.filter(function (w) { return w.statut === 'fait'; }).length, pb = st.filter(function (w) { return w.statut === 'probleme'; }).length;
        var prog = st.length ? ' · ' + done + '/' + st.length + ' faits' + (pb ? ' · ' + pl(pb, 'problème') : '') : '';
        return '<div class="row"><span class="dot" style="width:18px;height:18px;border-radius:9px;background:' + esc(l.color) + '"></span><span class="main"><span class="t">' + esc(l.name) + (S.activeLayerId === l.id ? ' <span class="badge">actif</span>' : '') + '</span><span class="s">' + pl(nw, 'point') + ' · ' + pl(nt, 'tracé') + prog + ((l.fields || []).length ? ' · ' + pl(l.fields.length, 'champ') : '') + '</span></span>' +
          '<button class="more" data-act="layerVis" data-id="' + esc(l.id) + '" aria-label="' + (vis ? 'Masquer' : 'Afficher') + ' le calque" style="color:' + (vis ? 'var(--text)' : 'var(--muted)') + '">' + ic(vis ? 'eye' : 'eyeoff') + '</button>' +
          '<button class="more" data-act="layerMenu" data-id="' + esc(l.id) + '" aria-label="Actions du calque">' + ic('more') + '</button></div>';
      }).join('') + '</div>';
    }
    html += '<div class="seg" style="margin:18px 0 10px"><button class="' + (S.ptsMode === 'points' ? 'on' : '') + '" data-act="ptsMode" data-id="points">Points (' + S.wps.length + ')</button><button class="' + (S.ptsMode === 'traces' ? 'on' : '') + '" data-act="ptsMode" data-id="traces">Tracés (' + S.traces.length + ')</button></div>';
    if (S.ptsMode === 'points') {
      var used = {}; S.wps.forEach(function (w) { used[NVSym.idOf(w)] = true; });
      html += '<label class="search" style="margin:0 0 8px">' + ic('search', 'sm muted') + '<span class="sr">Rechercher</span><input type="search" id="pts-search" placeholder="Rechercher un point" value="' + esc(S.ptsQuery) + '" autocomplete="off"></label>';
      html += '<div class="chips"><button class="chip' + (!S.ptsStat ? ' on' : '') + '" data-act="ptsStat" data-id="">Tous statuts</button>' + STATUTS.map(function (x) { var n = S.wps.filter(function (w) { return w.statut === x[0]; }).length; return '<button class="chip' + (S.ptsStat === x[0] ? ' on' : '') + '" data-act="ptsStat" data-id="' + x[0] + '"><span class="dot st-dot-' + x[0] + '"></span>' + x[1] + ' (' + n + ')</button>'; }).join('') + '</div>';
      html += '<div class="chips"><button class="chip' + (!S.ptsSym ? ' on' : '') + '" data-act="ptsSym" data-id="">Tous</button>' + NVSym.LIST.filter(function (x) { return used[x.id]; }).map(function (x) { return '<button class="chip' + (S.ptsSym === x.id ? ' on' : '') + '" data-act="ptsSym" data-id="' + x.id + '">' + NVSym.svg(x.id, null, 22) + esc(x.short) + '</button>'; }).join('') + '</div>';
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
        return '<div class="row"><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">' + (isPoly(t) ? '<path d="M5 7 18 4l4 13-12 5z" fill="' + esc(t.color || '#ff3d00') + '" fill-opacity=".25" stroke="' + esc(t.color || '#ff3d00') + '" stroke-width="3" stroke-linejoin="round"/>' : '<path d="M3 20c5-10 9 2 13-8s5-6 7-8" fill="none" stroke="' + esc(t.color || '#ff3d00') + '" stroke-width="4" stroke-linecap="round"' + '/>') + '</svg><span class="main"><span class="t">' + esc(t.name || 'Tracé') + '</span><span class="s">' + (isPoly(t) ? num(areaHa(t.points || []), 2) + ' ha' : (t.origine === 'mesure' ? 'ligne · ' : '') + fmtDist(trLen(t))) + ' · ' + esc(fmtDay(t.timestamp)) + (l ? ' · ' + esc(l.name) : '') + (t.imported ? ' · importé' : (t.sentAt ? ' · envoyé' : '')) + '</span></span>' +
          '<button class="more" data-act="traceMenu" data-id="' + t.id + '" aria-label="Actions du tracé">' + ic('more') + '</button></div>';
      }).join('') + '</div>' : '<div class="empty">Aucun tracé. Lancez-en un avec le bouton <b>Tracé</b> sur la carte, ou enregistrez une <b>Mesure</b>.</div>';
      return;
    }
    var q = S.ptsQuery.trim().toLowerCase();
    var ws = S.wps.filter(function (w) { return (!S.ptsStat || w.statut === S.ptsStat) && (!S.ptsSym || NVSym.idOf(w) === S.ptsSym) && (!q || (w.name || '').toLowerCase().indexOf(q) >= 0 || (w.comment || '').toLowerCase().indexOf(q) >= 0); });
    if (S.pos) ws.sort(function (a, b) { return hav(S.pos, a) - hav(S.pos, b); }); else ws.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
    var shown = ws.slice(0, 300);
    box.innerHTML = shown.length ? '<div class="list">' + shown.map(function (w) {
      var l = layerById(w.layerId), sym = NVSym.BY[NVSym.idOf(w)];
      return '<button class="row" data-act="openWp" data-id="' + w.id + '">' + wpIcon(w, 30) + '<span class="main"><span class="t">' + esc(w.name) + '</span><span class="s">' + (w.statut ? esc(STATUT_LBL[w.statut]) + ' · ' : '') + esc(sym.short) + (l ? ' · ' + esc(l.name) : '') + ((w.photoIds || []).length ? ' · ' + pl(w.photoIds.length, 'photo') : '') + (!w.sentAt && (!w.imported || w.modified) ? ' · à envoyer' : '') + '</span></span>' +
        (S.pos ? '<span class="n">' + fmtDist(hav(S.pos, w)) + ' ' + card(bearing(S.pos, w)) + '</span>' : '') + ic('chev', 'sm muted') + '</button>';
    }).join('') + '</div>' + (ws.length > 300 ? '<p class="muted">' + (ws.length - 300) + ' autres points : affinez la recherche.</p>' : '') :
      '<div class="empty">' + (S.wps.length ? 'Aucun point ne correspond.' : 'Aucun point. Ajoutez-en un avec le bouton <b>Point</b> sur la carte.') + '</div>';
  }
  function traceMenu(t) {
    var resume = isPoly(t) ? 'Polygone · ' + num(areaHa(t.points || []), 2) + ' ha · périmètre ' + fmtDist(trLen(t)) : (t.origine === 'mesure' ? 'Ligne mesurée · ' : '') + fmtDist(trLen(t));
    sheetOptions(t.name || 'Tracé', resume + ' · ' + (t.points || []).length + ' points · ' + fmtDate(t.timestamp), [
      { label: 'Suivre ' + (isPoly(t) ? 'ce contour' : 'ce tracé'), sub: 'Écart à gauche ou à droite, distance restante', icon: 'route', cls: 'primary', fn: function () { startFollow(t.id, false); } },
      { label: 'Suivre en sens inverse', sub: 'Du dernier point vers le premier', icon: 'route', fn: function () { startFollow(t.id, true); } },
      { label: 'Voir sur la carte', icon: 'map', fn: function () { var p = t.points[Math.floor(t.points.length / 2)]; showOnMap(p.lat, p.lon); } },
      { label: 'Renommer', icon: 'edit', fn: async function () { var n = await askText('Renommer le tracé', t.name); if (!n) return; t.name = n; await NavDB.saveTrace(t); refreshAfterData(); } },
      { label: 'Changer de calque', icon: 'layers', fn: function () { pickLayer(t.layerId, async function (lid) { t.layerId = lid; await NavDB.saveTrace(t); refreshAfterData(); }); } },
      { label: 'Supprimer', icon: 'trash', cls: 'danger', fn: async function () { if (!await confirmSheet('Supprimer ce tracé ?', '« ' + (t.name || 'Tracé') + ' » sera supprimé définitivement.', 'Supprimer', true)) return; await NavDB.deleteTrace(t.id); if (S.follow && S.follow.id === t.id) stopNav(); S.traces = S.traces.filter(function (x) { return x.id !== t.id; }); refreshAfterData(); toast('Tracé supprimé'); } }
    ]);
  }
  function pickLayer(current, cb) {
    var opts = S.layers.map(function (l) { return { label: l.name, cls: l.id === current ? 'primary' : '', fn: function () { cb(l.id); } }; });
    opts.push({ label: 'Nouveau calque…', icon: 'plus', fn: async function () { var n = await askText('Nouveau calque', '', 'ex. Frayères 2026'); if (!n) return; var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); cb(l.id); } });
    sheetOptions('Choisir le calque', null, opts);
  }
  function fieldEditor(l) {
    var fs = l.fields || [], TL = { texte: 'Texte', nombre: 'Nombre', choix: 'Choix', ouinon: 'Oui / Non' };
    var html = '<h3>Champs à remplir — ' + esc(l.name) + '</h3><p>Les employés les remplissent dans chaque point de ce calque. Ils voyagent avec « Partager comme calque de suivi ».</p><div class="opts">';
    var fns = [];
    fs.forEach(function (f, i) {
      fns.push(async function () { if (!await confirmSheet('Retirer « ' + f.label + ' » ?', 'Les valeurs déjà saisies restent dans les points.', 'Retirer', true)) { fieldEditor(l); return; } l.fields.splice(i, 1); await NavDB.saveLayer(l); refreshAfterData(); fieldEditor(l); });
      html += '<button class="btn" data-act="sheetOpt" data-i="' + (fns.length - 1) + '">' + ic('trash', 'sm') + '<span>' + esc(f.label) + '<span class="s">' + TL[f.type] + (f.type === 'choix' ? ' : ' + esc((f.choices || []).join(', ')) : '') + ' — toucher pour retirer</span></span></button>';
    });
    fns.push(async function () {
      var name = await askText('Nouveau champ', '', 'ex. Hauteur d\'eau (cm)'); if (!name) { fieldEditor(l); return; }
      sheetOptions('Type de « ' + name + ' »', null, ['texte', 'nombre', 'choix', 'ouinon'].map(function (t) { return { label: TL[t], fn: async function () {
        var choices = [];
        if (t === 'choix') { var c = await askText('Choix possibles', '', 'séparés par des virgules : actif, inactif, démantelé'); if (!c) { fieldEditor(l); return; } choices = c.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
        var key = NVImport.slugKey(name), k = 2; while ((l.fields || []).some(function (f) { return f.key === key; })) key = NVImport.slugKey(name) + '_' + (k++);
        l.fields = (l.fields || []).concat([{ key: key, label: name, type: t, choices: choices }]); await NavDB.saveLayer(l); refreshAfterData(); fieldEditor(l);
      } }; }));
    });
    html += '<button class="btn primary" data-act="sheetOpt" data-i="' + (fns.length - 1) + '">' + ic('plus') + '<span>Ajouter un champ</span></button><button class="btn" data-act="closeSheet">Terminé</button></div>';
    openSheet(html, fns);
  }
  function refreshAfterData() { renderOverlays(); if ($('#view-points').classList.contains('active')) renderPoints(); }
  function layerMenu(l) {
    var nw = S.wps.filter(function (w) { return w.layerId === l.id; }).length, nt = S.traces.filter(function (t) { return t.layerId === l.id; }).length;
    sheetOptions(l.name, nw + ' points · ' + nt + ' tracés', [
      { label: 'Calque actif pour les nouveaux points', icon: 'check', cls: S.activeLayerId === l.id ? 'primary' : '', fn: async function () { S.activeLayerId = l.id; await NavDB.setMeta('activeLayerId', l.id); renderPoints(); } },
      { label: 'Renommer', icon: 'edit', fn: async function () { var n = await askText('Renommer le calque', l.name); if (!n) return; l.name = n; await NavDB.saveLayer(l); renderPoints(); } },
      { label: 'Changer la couleur', icon: 'layers', fn: function () { sheetOptions('Couleur du calque', 'S\'applique aux nouveaux tracés de ce calque.', LCOLORS.map(function (c) { return { label: c, cls: c === l.color ? 'primary' : '', fn: async function () { l.color = c; await NavDB.saveLayer(l); renderPoints(); } }; })); } },
      { label: 'Champs à remplir…', sub: (l.fields || []).length ? (l.fields || []).map(function (f) { return f.label; }).join(', ') : 'Aucun champ défini', icon: 'edit', fn: function () { fieldEditor(l); } },
      { label: 'Partager comme calque de suivi', sub: 'GeoJSON avec ses champs, à importer sur un autre téléphone', icon: 'share', fn: function () {
        var w = S.wps.filter(function (x) { return x.layerId === l.id; }), t = S.traces.filter(function (x) { return x.layerId === l.id; });
        deliver(NVExport.geojson(w, t, layersById(), l.name, { version: 1, calque: l.name, champs: (l.fields || []).map(function (f) { return { cle: f.key, nom: f.label, type: f.type, choix: f.choices || [] }; }) }));
      } },
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

  // ══════════════ Viseur permanent ══════════════
  function toggleViseur(on) {
    S.viseur = on == null ? !S.viseur : on;
    $('#m-viseur').classList.toggle('on', S.viseur);
    syncMire(); updateCoordsBar();
  }
  function syncMire() { $('#mire').classList.toggle('hidden', !(S.viseur || S.mire || (S.serie && S.serieCfg.src === 'mire'))); }
  function viseurInfo() {
    var c = ll(S.map.getCenter()), t = 'Viseur · ' + fmtLL(c.lat, c.lon);
    var sub = S.pos ? 'à ' + fmtDist(hav(S.pos, c)) + ' · cap ' + deg(bearing(S.pos, c)) + ' de vous' : 'position GPS en attente';
    return { t: t, sub: sub, c: c };
  }

  // ══════════════ Coller des coordonnées ══════════════
  function pasteSheet() {
    openSheet('<h3>Coller des coordonnées</h3><p>Collez le texte reçu (texto, courriel). Formats reconnus : décimal, DMS, degrés-minutes, UTM 19, MTM 6.</p>' +
      '<div class="field"><textarea class="input" id="paste-txt" rows="3" placeholder="ex. 48.20714, -68.51233"></textarea></div><div class="field"><span id="paste-res" class="mono" style="font-size:15px;color:var(--muted)">—</span></div>' +
      '<div class="grid2"><button class="btn" data-act="closeSheet">Annuler</button><button class="btn primary" data-act="pasteOk" id="paste-ok" disabled>Créer le point</button></div>');
    var ta = $('#paste-txt'), upd = function () {
      var r = NVCoords.parse(ta.value), res = $('#paste-res'), ok = $('#paste-ok');
      if (!r) { res.textContent = ta.value.trim() ? 'Coordonnées non reconnues' : '—'; ok.disabled = true; S._paste = null; return; }
      S._paste = r; ok.disabled = false;
      var cs = cartesAt(r.lat, r.lon);
      res.innerHTML = esc(fmtLL(r.lat, r.lon)) + '<br>' + esc(cs.length ? 'Sur ' + pl(cs.length, 'carte') + ' : ' + cs.map(function (c) { return c.name; }).join(', ') : 'Hors de vos cartes') + (S.pos ? ' · à ' + fmtDist(hav(S.pos, r)) + ' de vous' : '');
    };
    ta.addEventListener('input', upd);
    setTimeout(function () { ta.focus(); }, 250);
    try { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (t && NVCoords.parse(t) && !ta.value) { ta.value = t; upd(); } }).catch(function () {}); } catch (e) {}
  }

  // ══════════════ Import d'un calque (GeoJSON, KML, KMZ, GPX) ══════════════
  async function importLayerFile(file) {
    var data;
    try { toast('Lecture de ' + file.name + '…', 8000); data = await NVImport.parseFile(file); }
    catch (e) { await confirmSheet('Import impossible', file.name + ' : ' + (e && e.message || e), 'OK'); return; }
    var same = S.layers.find(function (l) { return l.name.toLowerCase() === String(data.name).toLowerCase(); });
    var summary = pl(data.points.length, 'point') + ' et ' + pl(data.lines.length, 'ligne') + ' dans « ' + data.fileName + ' ».';
    var opts = [];
    if (same) opts.push({ label: 'Mettre à jour « ' + same.name + ' »', sub: 'Remplace les sites reçus ; garde ceux que vous avez modifiés et vos propres points', icon: 'layers', cls: 'primary', fn: function () { mergeLayer(same, data); } });
    else opts.push({ label: 'Nouveau calque « ' + data.name + ' »', icon: 'plus', cls: 'primary', fn: async function () { var l = await NavDB.saveLayer({ name: data.name }); S.layers.push(l); mergeLayer(l, data); } });
    opts.push({ label: 'Choisir un autre calque', icon: 'layers', fn: function () { pickLayer(same ? same.id : null, function (lid) { mergeLayer(layerById(lid), data); }); } });
    sheetOptions('Importer un calque', summary, opts);
  }
  // ── Fusion « Mettre à jour » champ par champ (5.7.3) ──
  // Chaque site reçu garde w.base (dernière version du bureau) et, après un envoi, w.sentSnap (valeurs envoyées).
  // Un champ changé ici depuis le dernier envoi est gardé ; sinon la valeur du bureau s'applique.
  // Changé ici ET au bureau : conflit, la version du terrain l'emporte (site nommé dans le message).
  var SITE_CHAMPS = ['name', 'comment', 'pos', 'sym', 'color', 'statut'];
  function siteVals(o) { return { name: o.name || '', comment: o.comment || '', pos: [o.lat, o.lon], sym: o.sym || 'point', color: o.color || null, statut: o.statut || '', props: Object.assign({}, o.props || {}) }; }
  function bureauVals(p, ex) { return { name: p.name || '', comment: p.comment || '', pos: [p.lat, p.lon], sym: p.sym || (ex && ex.base && ex.base.sym) || (ex && ex.sym) || 'point', color: p.color || null, statut: p.statut || 'a_faire', props: Object.assign({}, p.props || {}) }; }
  function valOf(v, f) { return f.indexOf('props.') === 0 ? v.props[f.slice(6)] : v[f]; }
  function sameVal(a, b, f) {
    if (f === 'pos') return !!(a && b) && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
    return String(a == null ? '' : a) === String(b == null ? '' : b);
  }
  function propKeys() { var s = {}; for (var i = 0; i < arguments.length; i++) if (arguments[i]) Object.keys(arguments[i].props || {}).forEach(function (x) { s['props.' + x] = 1; }); return Object.keys(s); }
  function applyVals(w, V, champs) {
    champs.forEach(function (f) {
      if (f === 'pos') { w.lat = V.pos[0]; w.lon = V.pos[1]; }
      else if (f.indexOf('props.') === 0) { var kk = f.slice(6); w.props = w.props || {}; if (V.props[kk] == null || V.props[kk] === '') delete w.props[kk]; else w.props[kk] = V.props[kk]; }
      else w[f] = V[f];
    });
  }
  function mergeSite(ex, B) {
    var L = siteVals(ex), res = { garde: [], conflit: [], change: false };
    if (!ex.base && ex.modified && !ex.sentAt) { // site d'avant la 5.7.3, modifié et pas encore envoyé : gardé en entier
      ex.base = B; res.garde = ['tout']; return res;
    }
    var base = ex.base || L, ref = ex.sentSnap || base, prendre = [];
    SITE_CHAMPS.concat(propKeys(L, B, base, ref)).forEach(function (f) {
      if (sameVal(valOf(L, f), valOf(ref, f), f)) { if (!sameVal(valOf(L, f), valOf(B, f), f)) prendre.push(f); }
      else if (sameVal(valOf(L, f), valOf(B, f), f)) { /* même valeur ici et au bureau : rien à garder */ }
      else if (sameVal(valOf(B, f), valOf(base, f), f)) res.garde.push(f);
      else res.conflit.push(f);
    });
    if (prendre.length) { res.change = true; applyVals(ex, B, prendre); if (prendre.indexOf('pos') >= 0) ex.gps = null; }
    ex.base = B; ex.sentSnap = null;
    var reste = res.garde.length + res.conflit.length > 0;
    ex.modified = (ex.modified && !ex.sentAt) || reste;
    if (!ex.modified) { ex.author = ''; ex.device = ''; }
    return res;
  }

  async function mergeLayer(l, data) {
    var oldW = S.wps.filter(function (w) { return w.layerId === l.id && w.imported; });
    var oldT = S.traces.filter(function (t) { return t.layerId === l.id && t.imported; });
    var byExt = {}; oldW.forEach(function (w) { byExt[w.extId] = w; });
    var seen = {}, added = 0, updated = 0, removed = 0, now = Date.now(), k = 0, gardes = [], conflits = [];
    for (var i = 0; i < data.points.length; i++) {
      var p = data.points[i], ex = byExt[p.extId]; seen[p.extId] = true;
      var B = bureauVals(p, ex);
      if (!ex) {
        var w = { id: now + (k++), photoIds: [], timestamp: new Date().toISOString(), imported: true, layerId: l.id, extId: p.extId, uid: 'site:' + p.extId, modified: false, author: '', device: '' };
        applyVals(w, B, SITE_CHAMPS.concat(propKeys(B, null)));
        w.base = B; await NavDB.saveWaypoint(w); S.wps.push(w); added++; continue;
      }
      var r = mergeSite(ex, B);
      ex.layerId = l.id; ex.imported = true;
      await NavDB.saveWaypoint(ex);
      if (r.conflit.length) conflits.push(ex.name); else if (r.garde.length) gardes.push(ex.name);
      if (r.change) updated++;
    }
    for (var j = 0; j < oldW.length; j++) {
      var o = oldW[j]; if (seen[o.extId]) continue;
      if (o.modified && !o.sentAt) { gardes.push(o.name + ' (retiré par le bureau)'); continue; } // changements pas encore envoyés : on garde
      await NavDB.deleteWaypoint(o); S.wps = S.wps.filter(function (x) { return x.id !== o.id; }); removed++;
    }
    var noms = function (a) { return a.length > 8 ? a.slice(0, 8).join(', ') + ' et ' + (a.length - 8) + ' autre(s)' : a.join(', '); };
    var kept = gardes.length + conflits.length;
    for (var a = 0; a < oldT.length; a++) { await NavDB.deleteTrace(oldT[a].id); }
    S.traces = S.traces.filter(function (t) { return !(t.layerId === l.id && t.imported); });
    for (var b = 0; b < data.lines.length; b++) {
      var ln = data.lines[b], t = { id: now + 100000 + b, uid: 'ligne:' + l.name + ':' + ln.extId, layerId: l.id, name: ln.name, points: ln.points.map(function (q) { return { lat: q.lat, lon: q.lon }; }), timestamp: new Date().toISOString(), color: l.color, weight: 3, imported: true, extId: ln.extId };
      await NavDB.saveTrace(t); S.traces.push(t);
    }
    if (data.fields && data.fields.length) {
      if (data.fieldsExplicit || !(l.fields || []).length) l.fields = data.fields;
      else data.fields.forEach(function (f) { if (!l.fields.some(function (x) { return x.key === f.key; })) l.fields.push(f); });
    }
    l.source = data.fileName; l.importedAt = new Date().toISOString(); await NavDB.saveLayer(l);
    renderOverlays(); if ($('#view-points').classList.contains('active')) renderPoints();
    var msg = [added ? pl(added, 'site ajouté', 'sites ajoutés') : '', updated ? pl(updated, 'mis à jour', 'mis à jour') : '', removed ? pl(removed, 'retiré', 'retirés') : '', data.lines.length ? pl(data.lines.length, 'ligne') : ''].filter(Boolean).join(', ');
    if (conflits.length) msg += (msg ? '. ' : '') + 'Changé ici ET au bureau, votre version est gardée : ' + noms(conflits);
    if (gardes.length) msg += (msg ? '. ' : '') + 'Vos changements pas encore envoyés sont gardés : ' + noms(gardes);
    sheetOptions('Calque « ' + l.name + ' » à jour', msg || 'Aucun changement.', [{ label: 'Voir sur la carte', icon: 'map', cls: 'primary', fn: function () { var p0 = data.points[0] || (data.lines[0] && data.lines[0].points[0]); if (p0) showOnMap(p0.lat, p0.lon); } }, { label: 'Fermer', fn: function () {} }], true);
  }

  // ══════════════ Envoyer au bureau ══════════════
  async function sendOffice() {
    var u = unsent();
    var opts = [];
    if (u.wps.length || u.trs.length) opts.push({ label: 'Envoyer les nouveautés', sub: pl(u.wps.length, 'point') + ' · ' + pl(u.trs.length, 'tracé') + ' depuis le dernier envoi', icon: 'share', cls: 'primary', fn: function () { prepareSend(u.wps, u.trs, 'nouveautés'); } });
    var mine = S.wps.filter(function (w) { return !w.imported || w.modified; }), myT = S.traces.filter(function (t) { return !t.imported; });
    opts.push({ label: 'Tout renvoyer', sub: pl(mine.length, 'point') + ' · ' + pl(myT.length, 'tracé') + ' (les sites reçus non modifiés sont exclus)', icon: 'share', fn: function () { prepareSend(mine, myT, 'tout'); } });
    if (!S.employee) opts.push({ label: 'Indiquer mon nom', sub: 'Il apparaîtra dans l\'objet du courriel', icon: 'edit', fn: async function () { var n = await askText('Votre nom', '', 'ex. Julia'); if (n) { S.employee = n; await NavDB.setMeta('employee', n); } sendOffice(); } });
    sheetOptions('Envoyer au bureau', 'Destinataire : ' + S.officeEmail + '. Les fichiers (KMZ avec photos + GeoJSON) partent dans l\'application de courriel choisie ; l\'adresse est copiée pour être collée dans « À ». Faites-le de préférence sur Wi-Fi.', opts);
  }
  async function prepareSend(wps, trs, what) {
    if (!wps.length && !trs.length) { toast('Rien à envoyer'); return; }
    toast('Préparation de l\'envoi…', 20000);
    var by = layersById(), day = new Date().toISOString().slice(0, 10), who = S.employee || 'terrain';
    var label = who;
    try {
      var files = (await NVExport.kmz(wps, trs, by, label, NavDB.getPhotos, 0.7, 'auto')).concat(NVExport.geojson(wps, trs, by, label));
      var subject = 'NAVenza — ' + who + ' — ' + day + ' — ' + pl(wps.length, 'point') + ', ' + pl(trs.length, 'tracé');
      var fl = files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }); });
      var size = files.reduce(function (s, f) { return s + f.blob.size; }, 0);
      var markSent = async function () {
        var now = new Date().toISOString();
        for (var i = 0; i < wps.length; i++) { wps[i].sentAt = now; if (wps[i].imported) wps[i].sentSnap = siteVals(wps[i]); await NavDB.saveWaypoint(wps[i]); }
        for (var j = 0; j < trs.length; j++) { trs[j].sentAt = now; await NavDB.saveTrace(trs[j]); }
        await NavDB.setMeta('lastSent', now); if ($('#view-points').classList.contains('active')) renderPoints();
      };
      var canShare = navigator.share && navigator.canShare && navigator.canShare({ files: fl });
      var opts = [];
      if (canShare) opts.push({ label: 'Partager vers Outlook ou Mail', sub: 'L\'adresse ' + S.officeEmail + ' sera copiée : collez-la dans « À » · ' + fmtSize(size), icon: 'share', cls: 'primary', fn: async function () {
        // iOS ne permet pas de remplir le destinataire d'un partage : on copie l'adresse (sans attendre, pour garder le geste de l'utilisateur)
        var copied = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(S.officeEmail).catch(function () {}); copied = true; } } catch (e) {}
        if (copied) toast('Adresse copiée : appui long dans « À », puis Coller', 6000);
        try { await navigator.share({ files: fl, title: subject, text: subject + '\n\nÀ envoyer à : ' + S.officeEmail }); await markSent(); toast('Marqué comme envoyé'); }
        catch (e) { if (e.name !== 'AbortError') toast('Partage impossible : ' + e.message); }
      } });
      opts.push({ label: 'Télécharger les fichiers', sub: 'puis les joindre à un courriel à ' + S.officeEmail, icon: 'download', cls: canShare ? '' : 'primary', fn: async function () {
        for (var i = 0; i < files.length; i++) { download(files[i]); await new Promise(function (r) { setTimeout(r, 400); }); }
        location.href = 'mailto:' + encodeURIComponent(S.officeEmail) + '?subject=' + encodeURIComponent(subject);
        if (await confirmSheet('Courriel envoyé ?', 'Marquer ces ' + pl(wps.length, 'point') + ' et ' + pl(trs.length, 'tracé') + ' comme envoyés ?', 'Oui, envoyés')) await markSent();
      } });
      sheetOptions('Envoi prêt', subject + (files.length > 2 ? ' — KMZ découpé en ' + (files.length - 1) + ' parties' : ''), opts);
    } catch (e) { toast('Envoi impossible : ' + e.message, 5000); }
  }

  // ══════════════ Sauvegarde complète et restauration ══════════════
  function dataUrlBytes(d) { var b = atob(d.split(',')[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function backupFull() {
    toast('Préparation de la sauvegarde…', 30000);
    try {
      var zip = new JSZip(), ph = zip.folder('photos'), nPh = 0;
      for (var i = 0; i < S.wps.length; i++) {
        var photos = await NavDB.getPhotos(S.wps[i]);
        var wq = S.wps[i]; photos.forEach(function (p) { ph.file(String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg', dataUrlBytes(NVExif.inject(p.data, NVExport.photoMeta(wq, p, layersById()))), { binary: true }); nPh++; });
      }
      var data = { format: 'navenza-sauvegarde', version: 1, app: APP_VERSION, date: new Date().toISOString(), employee: S.employee, device: S.deviceId,
        folders: S.folders, layers: S.layers, waypoints: S.wps, traces: S.traces,
        cartes: S.cartes.map(function (c) { return { id: c.id, name: c.name, fileName: c.fileName, folderId: c.folderId, kind: c.kind, bytes: c.bytes }; }),
        settings: { theme: S.theme, coordFmt: S.coordFmt, employee: S.employee, officeEmail: S.officeEmail, activeLayerId: S.activeLayerId } };
      zip.file('navenza.json', JSON.stringify(data));
      zip.file('LISEZMOI.txt', 'Sauvegarde NAVenza MAP ' + APP_VERSION + ' du ' + fmtDate(data.date) + '\n' + pl(S.wps.length, 'point') + ', ' + pl(nPh, 'photo') + ', ' + pl(S.traces.length, 'tracé') + ', ' + pl(S.layers.length, 'calque') + '.\nLes fichiers de cartes (PDF, GeoTIFF) ne sont pas inclus : réimportez-les au besoin.\nPour restaurer : Réglages > Restaurer une sauvegarde.\n');
      var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 }, mimeType: 'application/zip' });
      var name = 'navenza_sauvegarde_' + (S.employee ? NVImport.slugKey(S.employee) + '_' : '') + new Date().toISOString().slice(0, 10) + '.zip';
      await NavDB.setMeta('lastBackup', data.date); S.lastBackup = data.date;
      deliver([{ blob: blob, name: name }]);
    } catch (e) { toast('Sauvegarde impossible : ' + e.message, 6000); }
  }
  async function restoreFile(file) {
    var data, zip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
      var j = zip.file('navenza.json'); if (!j) throw new Error('ce fichier n\'est pas une sauvegarde NAVenza');
      data = JSON.parse(await j.async('string'));
      if (data.format !== 'navenza-sauvegarde') throw new Error('format de sauvegarde inconnu');
    } catch (e) { await confirmSheet('Restauration impossible', file.name + ' : ' + (e && e.message || e), 'OK'); return; }
    var nw = (data.waypoints || []).length, nt = (data.traces || []).length;
    if (!await confirmSheet('Restaurer cette sauvegarde ?', 'Du ' + fmtDate(data.date) + (data.employee ? ' (' + data.employee + ')' : '') + ' : ' + pl(nw, 'point') + ', ' + pl(nt, 'tracé') + ', ' + pl((data.layers || []).length, 'calque') + '. Rien n\'est effacé : seuls les éléments absents de cet appareil sont ajoutés.', 'Restaurer')) return;
    toast('Restauration…', 30000);
    var add = { f: 0, l: 0, w: 0, t: 0, p: 0, skip: 0 };
    try {
      for (var a = 0; a < (data.folders || []).length; a++) { var f = data.folders[a]; if (!folderById(f.id)) { await NavDB.saveFolder(f); add.f++; } }
      for (var b = 0; b < (data.layers || []).length; b++) { var l = data.layers[b]; if (!layerById(l.id)) { await NavDB.saveLayer(l); add.l++; } }
      var uids = {}, ids = {}; S.wps.forEach(function (w) { if (w.uid) uids[w.uid] = true; ids[w.id] = true; });
      for (var c = 0; c < (data.waypoints || []).length; c++) {
        var w = Object.assign({}, data.waypoints[c]);
        if ((w.uid && uids[w.uid]) || (!w.uid && ids[w.id])) { add.skip++; continue; }
        var oldPh = w.photoIds || [];
        if (ids[w.id]) w.id = Date.now() + c;
        w.photoIds = [];
        for (var k = 0; k < oldPh.length; k++) {
          var pf = zip.file('photos/' + String(oldPh[k]).replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg');
          if (pf) { var pab = await pf.async('arraybuffer'); w.photoIds.push(await NavDB.addPhoto(w.id, 'data:image/jpeg;base64,' + await pf.async('base64'), NVExif.readDate(pab))); add.p++; }
        }
        await NavDB.saveWaypoint(w); add.w++;
      }
      var tu = {}; S.traces.forEach(function (t) { tu[t.uid || ('#' + t.id)] = true; });
      for (var d = 0; d < (data.traces || []).length; d++) { var t = data.traces[d]; if (tu[t.uid || ('#' + t.id)]) { add.skip++; continue; } await NavDB.saveTrace(t); add.t++; }
      await loadAll(); renderOverlays();
      if ($('#view-reglages').classList.contains('active')) renderSettings();
      sheetOptions('Restauration terminée', 'Ajoutés : ' + pl(add.w, 'point') + ' (' + pl(add.p, 'photo') + '), ' + pl(add.t, 'tracé') + ', ' + pl(add.l, 'calque') + ', ' + pl(add.f, 'dossier') + '. Déjà présents (ignorés) : ' + add.skip + '. Les cartes elles-mêmes ne sont pas dans la sauvegarde.', [{ label: 'OK', cls: 'primary', fn: function () {} }], true);
    } catch (e) { toast('Restauration interrompue : ' + e.message, 6000); await loadAll(); }
  }

  // ══════════════ Réglages ══════════════
  var OFFLINE_FILES = ['carte_terrain.html', 'css/styles.css', 'js/app.js', 'js/db.js', 'js/layers.js', 'js/pmtiles.js', 'js/export.js', 'js/index-geojson.js', 'js/coords.js', 'js/symbols.js', 'js/importer.js', 'js/exif.js',
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
    var html = '<div class="logo-card sm"><img src="icons/logo-nom.png" alt="NAVenza MAP"></div><div class="verline"><b>NAVenza MAP ' + APP_VERSION + '</b><span>' + esc(offlineState.msg) + '</span></div>' + '<div class="section-h"><h2>Affichage</h2></div><div class="seg">' + [['soleil', 'Clair'], ['sombre', 'Sombre'], ['nuit', 'Nuit (rouge)']].map(function (t) { return '<button class="' + (S.theme === t[0] ? 'on' : '') + '" data-act="setTheme" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    html += '<div class="section-h"><h2>Format des coordonnées</h2></div><div class="chips" style="flex-wrap:wrap">' + NVCoords.FORMATS.map(function (x) { return '<button class="chip' + (S.coordFmt === x[0] ? ' on' : '') + '" data-act="setFmt" data-id="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted" style="font-size:14px;line-height:1.4;margin:4px 2px">Exemple : ' + esc(fmtLL(48.20714, -68.51233)) + '. Sur la carte, touchez la ligne des coordonnées pour changer de format.</p>';
    html += '<div class="section-h"><h2>Envoi au bureau</h2></div><div class="list">' +
      '<button class="row" data-act="setEmployee"><span class="main"><span class="t">' + esc(S.employee || 'Votre nom (non indiqué)') + '</span><span class="s">Apparaît dans l\'objet des envois</span></span>' + ic('edit', 'sm muted') + '</button>' +
      '<button class="row" data-act="setOffice"><span class="main"><span class="t">' + esc(S.officeEmail) + '</span><span class="s">Destinataire des envois</span></span>' + ic('edit', 'sm muted') + '</button>' +
      '<button class="row" data-act="meteoToggle" aria-pressed="' + !!S.meteoOn + '"><span class="main"><span class="t">Météo dans le bandeau : ' + (S.meteoOn ? 'oui' : 'non') + '</span><span class="s">Prévision pour le centre de la réserve · Open-Meteo, modèle GEM (CC BY 4.0)</span></span>' + ic(S.meteoOn ? 'eye' : 'eyeoff', 'sm muted') + '</button></div>';
    html += '<div class="section-h"><h2>Hors ligne et stockage</h2></div><div class="list">' +
      '<div class="row"><span class="main"><span class="t" style="color:' + (offlineState.ok ? 'var(--ok)' : 'var(--accent-text)') + '">' + esc(offlineState.msg) + '</span><span class="s">Application et bibliothèques en cache sur l\'appareil</span></span></div>' +
      '<div class="row"><span class="main"><span class="t">' + (est && est.usage != null ? fmtSize(est.usage) + ' utilisés' : 'Espace utilisé inconnu') + '</span><span class="s wrap-ok">' + (est && est.quota ? 'Espace disponible pour l\'app : environ ' + fmtSize(est.quota) : 'Quota non communiqué par le système') + (persisted === true ? ' · stockage protégé' : (persisted === false ? ' · stockage non garanti par le système' : '')) + '</span></span></div>' +
      '<div class="row"><span class="main"><span class="t">' + pl(S.cartes.length, 'carte') + ' · ' + pl(S.folders.length, 'dossier') + '</span><span class="s">' + pl(S.wps.length, 'point') + ' · ' + pl(S.traces.length, 'tracé') + ' · ' + pl(S.layers.length, 'calque') + '</span></span></div></div>';
    var lb = await NavDB.getMeta('lastBackup'), nb = notBackedUp(lb);
    html += '<div class="section-h"><h2>Sauvegarde</h2></div><div style="display:flex;flex-direction:column;gap:10px">' +
      '<button class="btn block primary" data-act="backupFull">' + ic('download') + 'Sauvegarde complète (.zip, avec photos)</button>' +
      '<button class="btn block" data-act="restore">' + ic('undo') + 'Restaurer une sauvegarde</button>' +
      '<button class="btn block" data-act="backup">' + ic('download') + 'Copie GeoJSON (sans photos)</button></div>' +
      '<p class="muted" style="font-size:14px;line-height:1.4">' + (lb ? 'Dernière sauvegarde : ' + esc(fmtDate(lb)) + '. ' : 'Aucune sauvegarde complète encore. ') + (nb ? '<b style="color:var(--accent-text)">' + pl(nb, 'point ou tracé', 'points ou tracés') + ' depuis.</b> ' : '') + 'La sauvegarde contient points, photos, tracés, calques, dossiers et réglages, mais pas les fichiers de cartes. La restauration n\'efface rien : elle ajoute seulement ce qui manque. Elle sert aussi à transférer les données vers un nouveau téléphone.</p>';
    if (mig) html += '<div class="section-h"><h2>Mise à jour v3</h2></div><p class="muted" style="font-size:14px;line-height:1.4">Données converties le ' + esc(fmtDate(mig.date)) + ' : ' + pl(mig.dossiers, 'dossier') + ', ' + pl(mig.cartes, 'carte') + ', ' + pl(mig.calques, 'calque') + ', ' + pl(mig.points, 'point') + ', ' + pl(mig.photos, 'photo') + ', ' + pl(mig.traces, 'tracé') + '.</p>';
    html += '<div class="section-h"><h2>À propos</h2></div><p class="muted" style="font-size:14px;line-height:1.5">NAVenza MAP ' + APP_VERSION + ' — navigation terrain hors réseau, Réserve faunique Duchénier.<br>Polices Atkinson Hyperlegible et IBM Plex Mono (licence SIL OFL 1.1). Leaflet, pdf.js, UTIF.js, JSZip.</p>';
    $('#set-body').innerHTML = html;
  }
  function applyTheme(t) {
    S.theme = t; document.body.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t === 'soleil' ? '#F5F3EE' : (t === 'nuit' ? '#0E0605' : '#161D1A'));
    $('#m-theme').innerHTML = ic(t === 'soleil' ? 'sun' : 'moon');
  }

  // ══════════════ Actions (délégation d'événements) ══════════════
  var ACT = {
    fondMove: function (el) { fondMove(el); },
    dispStep: dispStep, dispTog: dispTog,
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
      sheetOptions(c.name, kindLabel(c) + ' · ' + fmtSize(c.bytes || 0) + (c.fileName ? ' · ' + c.fileName : ''), [
        { label: 'Ouvrir', icon: 'map', cls: 'primary', fn: function () { openMap(c.id); } },
        { label: 'Renommer', icon: 'edit', fn: async function () { var v = await askText('Renommer la carte', c.name); if (!v) return; c.name = v; await NavDB.saveCarte(c); renderLib(); if (S.carte && S.carte.id === c.id) updateMapHeader(); } },
        { label: 'Déplacer vers un dossier', icon: 'folder', fn: function () { moveCarteSheet(c); } },
        { label: 'Supprimer', icon: 'trash', cls: 'danger', fn: async function () {
          if (!await confirmSheet('Supprimer cette carte ?', '« ' + c.name + ' » sera effacée de l\'appareil. Vos points et tracés sont conservés.', 'Supprimer', true)) return;
          await NavDB.deleteCarte(c.id); S.cartes = S.cartes.filter(function (x) { return x.id !== c.id; });
          if (S.carte && S.carte.id === c.id) { if (S.carteLayer) S.map.removeLayer(S.carteLayer); S.carteLayer = null; S.carte = null; }
          if (S.fonds[c.id]) { delete S.fonds[c.id]; saveFonds(); applyFonds(); }
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
    cycleTheme: function () { var n = { soleil: 'sombre', sombre: 'nuit', nuit: 'soleil' }[S.theme] || 'soleil'; applyTheme(n); NavDB.setMeta('theme', n); toast({ sombre: 'Thème sombre', nuit: 'Mode nuit', soleil: 'Thème clair' }[n]); },
    zoomIn: function () { S.map.zoomIn(1); }, zoomOut: function () { S.map.zoomOut(1); },
    follow: function () { setFollow(!S.follow); },
    compass: toggleCompass,
    stopNav: stopNav,
    edgeOpen: function () { if (S.edgeTarget) openMap(S.edgeTarget, { center: S.pos ? [S.pos.lat, S.pos.lon] : null }); },
    edgeClose: function () { if (S.edgeTarget) S.edgeDismissed[S.edgeTarget] = true; $('#edge-banner').classList.add('hidden'); },
    layersSheet: function () { displaySheet(); },
    pointLayersSheet: function () {
      var opts = S.layers.map(function (l) { var vis = l.visible !== false; return { label: (vis ? 'Visible : ' : 'Masqué : ') + l.name, icon: vis ? 'eye' : 'eyeoff', cls: vis ? '' : '', fn: async function () { l.visible = !vis; await NavDB.saveLayer(l); renderOverlays(); ACT.pointLayersSheet(); } }; });
      if (!opts.length) { toast('Aucun calque pour l\'instant'); return; }
      sheetOptions('Calques affichés', 'Touchez un calque pour l\'afficher ou le masquer sur toutes les cartes.', opts);
    },
    addPoint: function () {
      var opts = [];
      if (S.viseur) { var vc = ll(S.map.getCenter()); opts.push({ label: 'Au viseur', sub: fmtLL(vc.lat, vc.lon), icon: 'move', cls: 'primary', fn: function () { openWpForm(null, { lat: vc.lat, lon: vc.lon, gps: { src: 'viseur' } }); } }); }
      opts.push({ label: 'À ma position GPS', sub: S.pos ? fmtLL(S.pos.lat, S.pos.lon) + ' · ±' + Math.round(S.acc) + ' m' : 'Position GPS en attente', icon: 'locate', cls: S.viseur ? '' : 'primary', disabled: !S.pos, fn: function () { openWpForm(null, { lat: S.pos.lat, lon: S.pos.lon, gps: { src: 'gps', acc: S.acc, alt: S.alt, altAcc: S.altAcc } }); } });
      opts.push({ label: 'Position moyennée', sub: 'Rester immobile 30 à 120 s pour une position plus sûre', icon: 'locate', disabled: !S.pos, fn: startAvg });
      opts.push({ label: 'Par cap et distance', sub: 'Un site vu de loin, depuis votre position ou le centre de la carte', icon: 'nav', fn: projSheet });
      if (!S.viseur) opts.push({ label: 'Avec la mire', sub: 'Viser un endroit au centre de l\'écran', icon: 'move', fn: function () { enterMire('wp'); } });
      opts.push({ label: 'Relevé en série', sub: 'Points rapides numérotés, une valeur par point (bathymétrie, stations)', icon: 'route', fn: serieSheet });
      opts.push({ label: 'Coller des coordonnées', sub: 'Reçues par texto ou courriel', icon: 'edit', fn: pasteSheet });
      opts.push({ label: 'Entrer des coordonnées', icon: 'edit', fn: function () { var c = ll(S.map.getCenter()); openWpForm(null, { lat: c.lat, lon: c.lon, manual: true }); } });
      sheetOptions('Nouveau point', null, opts);
    },
    viseur: function () { toggleViseur(); },
    serieStart: serieStart, serieSave: serieSave, serieUndo: serieUndo, serieEnd: function () { serieEnd(); },
    serieSrc: function (el) { serieSync(); S.serieCfg.src = el.dataset.id; renderSerieSheet(); },
    hideDone: function () { S.hideDone = !S.hideDone; NavDB.setMeta('hideDone', S.hideDone); renderOverlays(); displaySheet(); },
    dashName: async function () { await ACT.setEmployee(); renderLib(); },
    dashBackup: function () { showTab('reglages'); },
    dashTodo: function () { S.ptsMode = 'points'; S.ptsStat = 'a_faire'; showTab('points'); },
    meteoSheet: meteoSheet, meteoRefresh: async function () { await refreshMeteo(true); meteoSheet(); toast(meteoDay(0) ? 'Météo actualisée' : 'Météo indisponible pour l\'instant'); },
    meteoToggle: async function () { S.meteoOn = !S.meteoOn; await NavDB.setMeta('meteoOn', S.meteoOn); if (S.meteoOn) refreshMeteo(true); renderSettings(); },
    nearNav: function (el) { S.wpOpen = +el.dataset.id; ACT.wpNav(); },
    accueilOk: accueilOk, accueilPlusTard: function () { NavDB.setMeta('accueilVu', true); $('#accueil').classList.add('hidden'); },
    cycleFmt: function () { var i = NVCoords.FORMATS.findIndex(function (x) { return x[0] === S.coordFmt; }), n = NVCoords.FORMATS[(i + 1) % NVCoords.FORMATS.length]; S.coordFmt = n[0]; NavDB.setMeta('coordFmt', n[0]); updateCoordsBar(); if (S.mire) updateMire(); toast('Coordonnées : ' + n[1]); },
    pasteOk: function () { var r = S._paste; closeSheet(); if (!r) return; if (S.map && $('#view-map').classList.contains('active')) S.map.setView([r.lat, r.lon], Math.max(S.map.getZoom(), 15)); openWpForm(null, { lat: r.lat, lon: r.lon, gps: { src: 'coordonnees' } }); },
    importLayer: function () { $('#file-layer').click(); },
    sendOffice: sendOffice,
    setFmt: function (el) { S.coordFmt = el.dataset.id; NavDB.setMeta('coordFmt', S.coordFmt); renderSettings(); },
    setEmployee: async function () { var n = await askText('Votre nom', S.employee, 'ex. Julia'); if (n == null) return; S.employee = n; await NavDB.setMeta('employee', n); renderSettings(); },
    setOffice: async function () { var n = await askText('Courriel du bureau', S.officeEmail, 'faune@terfa.ca'); if (!n) return; S.officeEmail = n; await NavDB.setMeta('officeEmail', n); renderSettings(); },
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
    mireWp: function () { var c = ll(S.map.getCenter()); exitMire(); openWpForm(null, { lat: c.lat, lon: c.lon, gps: { src: 'mire' } }); },
    projOpt: function (el) { var P = S.proj; if (!P) return; P[el.dataset.k] = el.dataset.v; document.querySelectorAll('[data-act=projOpt][data-k=' + el.dataset.k + ']').forEach(function (b) { b.classList.toggle('on', b.dataset.v === el.dataset.v); }); var f = $('#proj-decl-f'); if (f) f.style.display = P.ref === 'magnetique' ? '' : 'none'; projUpdate(); },
    projOk: projOk, measureEnd: measureEnd,
    avgDur: function (el) { if (!S.avg) return; S.avgDur = +el.dataset.id; S.avg.dur = S.avgDur; if (S.avg.done && (Date.now() - S.avg.t0) / 1000 < S.avg.dur) { S.avg.done = false; S.avg.doneAt = null; } document.querySelectorAll('#avg-durs .chip').forEach(function (b) { b.classList.toggle('on', +b.dataset.id === S.avgDur); }); renderAvg(); },
    mireMove: async function () { var w = wpById(S.movingWp), c = ll(S.map.getCenter()); exitMire(); if (!w) return; w.lat = c.lat; w.lon = c.lon; w.gps = { src: 'deplace' }; w.sentAt = null; if (w.imported) w.modified = true; stamp(w); await NavDB.saveWaypoint(w); renderOverlays(); toast('« ' + w.name + ' » déplacé'); },
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
    fSym: function (el) { syncForm(); S.form.wp.sym = el.dataset.id; S.form.wp.color = null; S.form.colorTouched = false; renderWpForm(); },
    fColorReset: function () { syncForm(); S.form.wp.color = null; S.form.colorTouched = false; renderWpForm(); },
    fPhotoAdd: function () { syncForm(); $('#file-photo').click(); },
    fPhotoDel: function (el) { syncForm(); var p = S.form.photos.splice(+el.dataset.i, 1)[0]; if (p && p.id) S.form.removed.push(p.id); renderWpForm(); },
    fCoords: function () { syncForm(); S.form.showCoords = true; renderWpForm(); },
    fFmt: function (el) { syncForm(); if (S.form.showCoords && !readCoords()) return; S.form.coordFmt = el.dataset.id; renderWpForm(); },
    fCoordsApply: function () { syncForm(); if (readCoords()) { S.form.showCoords = false; renderWpForm(); toast('Position mise à jour'); } },
    newLayer: async function () { var n = await askText('Nouveau calque', '', 'ex. Frayères 2026'); if (!n) return; var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); renderPoints(); },
    layerVis: async function (el) { var l = layerById(el.dataset.id); l.visible = l.visible === false; await NavDB.saveLayer(l); renderPoints(); renderOverlays(); },
    layerMenu: function (el) { layerMenu(layerById(el.dataset.id)); },
    ptsMode: function (el) { S.ptsMode = el.dataset.id; renderPoints(); },
    ptsSym: function (el) { S.ptsSym = el.dataset.id; renderPoints(); },
    ptsStat: function (el) { S.ptsStat = el.dataset.id; renderPoints(); },
    setStatut: async function (el) {
      var w = wpById(S.wpOpen); if (!w) return; var v = el.dataset.id;
      w.statut = w.statut === v ? '' : v; w.statutAt = new Date().toISOString(); w.sentAt = null; if (w.imported) w.modified = true; stamp(w);
      await NavDB.saveWaypoint(w); renderOverlays(); openWp(w.id); toast(w.statut ? 'Statut : ' + STATUT_LBL[w.statut] : 'Statut retiré');
    },
    fStatut: function (el) { syncForm(); S.form.wp.statut = el.dataset.id; renderWpForm(); },
    fChoice: function (el) { syncForm(); var p = S.form.wp.props = S.form.wp.props || {}; if (p[el.dataset.k] === el.dataset.v) delete p[el.dataset.k]; else p[el.dataset.k] = el.dataset.v; renderWpForm(); },
    traceMenu: function (el) { var t = S.traces.find(function (x) { return x.id === +el.dataset.id; }); if (t) traceMenu(t); },
    exportMenu: exportMenu,
    backupFull: backupFull,
    restore: function () { $('#file-restore').click(); },
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
    if (e.target.dataset && e.target.dataset.disp) { onDisp(e.target, true); return; }
    var a = e.target.dataset.actChange;
    if (a === 'layerSelect' && e.target.value !== '__new') { syncForm(); renderWpForm(); return; }
    if (a === 'layerSelect' && e.target.value === '__new') {
      syncForm(); var n = await askText('Nouveau calque', '', 'ex. Frayères 2026');
      if (n) { var l = await NavDB.saveLayer({ name: n }); S.layers.push(l); S.form.wp.layerId = l.id; }
      renderWpForm();
    }
    if (a === 'fColor') { S.form.colorTouched = true; syncForm(); renderWpForm(); }
    if (a === 'serieRefresh') { serieSync(); renderSerieSheet(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'serie-input') { e.preventDefault(); serieSave(); } });
  document.addEventListener('input', function (e) {
    if (e.target.dataset && e.target.dataset.disp && e.target.type === 'range') onDisp(e.target, false);
    if (e.target.id === 'lib-search') { S.libQuery = e.target.value; renderLib(); }
    if (e.target.id === 'pts-search') { S.ptsQuery = e.target.value; renderPtsList(); }
  });
  $('#file-import').addEventListener('change', function (e) { var files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) importFiles(files); });
  $('#file-restore').addEventListener('change', function (e) { var f = (e.target.files || [])[0]; e.target.value = ''; if (f) restoreFile(f); });
  $('#file-layer').addEventListener('change', function (e) { var f = (e.target.files || [])[0]; e.target.value = ''; if (f) importLayerFile(f); });
  $('#file-photo').addEventListener('change', async function (e) {
    var files = Array.from(e.target.files || []); e.target.value = '';
    for (var i = 0; i < files.length; i++) { var d = await resizePhoto(files[i]); if (d && S.form) S.form.photos.push({ data: d.data, taken: d.taken }); }
    if (S.form) renderWpForm();
  });

  // ── Rappel de sauvegarde ──
  function notBackedUp(lb) {
    var after = function (iso) { return !lb || (iso || '') > lb; };
    return S.wps.filter(function (w) { return (!w.imported || w.modified) && after(w.updatedAt || w.timestamp); }).length +
      S.traces.filter(function (t) { return !t.imported && after(t.updatedAt || t.timestamp); }).length;
  }
  async function backupReminder() {
    var lb = await NavDB.getMeta('lastBackup'), nag = await NavDB.getMeta('backupNagAt'), n = notBackedUp(lb), day = 864e5;
    var days = lb ? (Date.now() - Date.parse(lb)) / day : Infinity;
    if (!n || days < 7 || (nag && Date.now() - Date.parse(nag) < 3 * day)) return;
    await NavDB.setMeta('backupNagAt', new Date().toISOString());
    sheetOptions('Sauvegarde recommandée', (lb ? 'Dernière sauvegarde complète il y a ' + pl(Math.floor(days), 'jour') + '. ' : 'Aucune sauvegarde complète encore. ') + pl(n, 'point ou tracé', 'points ou tracés') + ' ne sont dans aucune sauvegarde : si l\'app est supprimée du téléphone, ils sont perdus.',
      [{ label: 'Faire la sauvegarde maintenant', cls: 'primary', icon: 'download', fn: backupFull }, { label: 'Plus tard', fn: function () {} }], true);
  }

  // ── Écran d'accueil (première ouverture, tant que le nom n'est pas entré) ──
  function standalone() { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function showAccueil() {
    $('#acc-nom').value = S.employee || ''; $('#acc-mail').value = S.officeEmail;
    var ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('#acc-install').innerHTML = standalone() ? '' : '<div class="note">' + ic('download', 'sm') + '<span><b>Installez l\'app pour le terrain.</b> ' + (ios ? 'Dans Safari : bouton Partager, puis « Sur l\'écran d\'accueil ».' : 'Dans Chrome : menu ⋮, puis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».') + ' Ouvrez-la ensuite par sa nouvelle icône.</span></div>';
    $('#accueil').classList.remove('hidden');
  }
  async function accueilOk() {
    var n = $('#acc-nom').value.trim(), m = $('#acc-mail').value.trim();
    if (!n) { toast('Entrez votre nom, ou touchez « Plus tard »'); $('#acc-nom').focus(); return; }
    S.employee = n; await NavDB.setMeta('employee', n);
    if (/.+@.+\..+/.test(m)) { S.officeEmail = m; await NavDB.setMeta('officeEmail', m); }
    await NavDB.setMeta('accueilVu', true);
    $('#accueil').classList.add('hidden'); toast('Bienvenue, ' + n);
    if ($('#view-reglages').classList.contains('active')) renderSettings();
  }

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
    applyTheme((await NavDB.getMeta('theme')) || 'soleil');
    if (NavDB.IS_TEST) { document.body.classList.add('env-test'); document.title = 'TEST — NAVenza MAP'; }
    await loadAll();
    S.deviceId = await NavDB.getMeta('deviceId'); if (!S.deviceId) { S.deviceId = newUid(); await NavDB.setMeta('deviceId', S.deviceId); }
    S.activeLayerId = (await NavDB.getMeta('activeLayerId')) || null;
    S.fonds = (await NavDB.getMeta('fonds')) || {}; S.ordre = (await NavDB.getMeta('ordreCouches')) || []; var cs = (await NavDB.getMeta('carteStyle')) || {}; S.carteOpacity = cs.op == null ? 1 : cs.op; S.carteBlend = !!cs.blend;
    S.coordFmt = (await NavDB.getMeta('coordFmt')) || 'dd'; S.employee = (await NavDB.getMeta('employee')) || ''; S.officeEmail = (await NavDB.getMeta('officeEmail')) || 'faune@terfa.ca';
    try { await ensureUids(); } catch (e) { console.warn('[app] uid :', e); }
    startGPS();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (r) { try { r.update(); } catch (e) {} }).catch(function (e) { console.warn('SW :', e); });
      navigator.serviceWorker.addEventListener('controllerchange', checkOffline);
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    window.addEventListener('online', checkOffline); window.addEventListener('offline', checkOffline);
    window.addEventListener('online', function () { refreshMeteo(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { refreshMeteo(); if (S.tab === 'cartes') renderLib(); if (gardeActive()) gardePose(S.carte); } else gardeRetire(); });
    window.addEventListener('pagehide', gardeRetire);
    setTimeout(function () { refreshMeteo(); }, 1500);
    setTimeout(checkOffline, 800);
    S.hideDone = !!(await NavDB.getMeta('hideDone'));
    S.lastCarteId = await NavDB.getMeta('lastCarteId'); S.lastBackup = await NavDB.getMeta('lastBackup');
    var sheetShownGarde = false;
    S.meteo = await NavDB.getMeta('meteo'); S.meteoOn = (await NavDB.getMeta('meteoOn')) !== false;
    $('#boot').classList.add('hidden');
    if (!S.employee && !(await NavDB.getMeta('accueilVu'))) showAccueil();
    var lastView = await NavDB.getMeta('lastView'), lastCarte = await NavDB.getMeta('lastCarteId');
    var plante = gardeLue(); gardeRetire();
    if (plante) {
      showTab('cartes');
      var pc = carteById(plante.id);
      sheetOptions('La carte « ' + (pc ? pc.name : plante.name) + ' » a fait fermer l\'application',
        'Au dernier essai, l\'application s\'est fermée pendant que cette carte était affichée : elle est probablement trop lourde pour la mémoire du téléphone. Elle n\'a pas été rouverte. Vos autres cartes, l\'orthophoto, le relief et vos relevés sont intacts.',
        (pc ? [{ label: 'Supprimer cette carte', icon: 'trash', cls: 'danger', fn: async function () { await NavDB.deleteCarte(pc.id); S.cartes = S.cartes.filter(function (x) { return x.id !== pc.id; }); if (S.lastCarteId === pc.id) { S.lastCarteId = null; NavDB.setMeta('lastCarteId', null); } renderLib(); toast('Carte supprimée'); } },
          { label: 'Réessayer de l\'ouvrir', icon: 'map', fn: function () { openMap(pc.id); } }] : []).concat([{ label: 'Fermer', fn: function () {} }]));
      sheetShownGarde = true;
    } else if (lastView === 'map' && lastCarte && carteById(lastCarte)) openMap(lastCarte); else showTab(lastView === 'points' || lastView === 'apercu' ? lastView : 'cartes');
    if (summary) sheetOptions('Vos données sont à jour', pl(summary.dossiers, 'dossier') + ', ' + pl(summary.cartes, 'carte') + ', ' + pl(summary.calques, 'calque') + ', ' + pl(summary.points, 'point') + ' (' + pl(summary.photos, 'photo') + ') et ' + pl(summary.traces, 'tracé') + ' ont été convertis. Chaque ancien projet est devenu un dossier et un calque du même nom.', [{ label: 'Compris', cls: 'primary', icon: 'check', fn: function () {} }], true);
    var pend = await NavDB.getMeta('traceEnCours'), sheetShown = !!summary || sheetShownGarde;
    if (pend && pend.pts && pend.pts.length > 1 && !summary) {
      sheetShown = true;
      sheetOptions('Tracé non terminé', 'Un tracé de ' + pend.pts.length + ' points (' + fmtDist(traceDist(pend.pts)) + ') n\'a pas été enregistré.', [
        { label: 'L\'enregistrer', icon: 'check', cls: 'primary', fn: async function () { await NavDB.setMeta('traceEnCours', null); await saveTracePts(pend.pts, pend.start); } },
        { label: 'Le supprimer', icon: 'trash', cls: 'danger', fn: function () { NavDB.setMeta('traceEnCours', null); } }]);
    }
    // Avis de nouvelle version (une fois), sinon rappel de sauvegarde
    var lastVer = await NavDB.getMeta('appVersion'); await NavDB.setMeta('appVersion', APP_VERSION);
    var upgraded = lastVer ? lastVer !== APP_VERSION : (S.cartes.length + S.wps.length > 0);
    if (upgraded) {
      if (!sheetShown) { sheetShown = true; sheetOptions('Nouvelle version installée', 'NAVenza MAP ' + APP_VERSION + (lastVer ? ' (avant : ' + lastVer + ')' : '') + '. Nouveautés : ' + NOUVEAUTES.join(' ; ') + '.', [{ label: 'Compris', cls: 'primary', icon: 'check', fn: function () {} }], true); }
      else toast('NAVenza MAP ' + APP_VERSION + ' installée', 4000);
    }
    if (!sheetShown) await backupReminder();
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
