// importer.js — lecture de calques GeoJSON, KML, KMZ et GPX (coordonnées en degrés WGS84)
// Retourne { name, points:[{extId,name,comment,lat,lon,sym,color,props}], lines:[{extId,name,points:[{lat,lon}]}] }
(function () {
  'use strict';
  var NAME_KEYS = ['name', 'nom', 'Name', 'NOM', 'NAME', 'titre', 'label', 'id_site', 'site'];
  var COMMENT_KEYS = ['comment', 'commentaire', 'commentaires', 'description', 'desc', 'remarque', 'remarques', 'note', 'notes', 'COMMENT', 'DESCRIPTION'];
  var SYM_KEYS = ['symbole', 'symbol', 'sym', 'type', 'categorie', 'catégorie', 'category', 'SYMBOLE', 'TYPE'];
  var COLOR_KEYS = ['couleur', 'color', 'colour', 'COULEUR', 'COLOR'];
  var ID_KEYS = ['id', 'fid', 'ID', 'FID', 'id_site', 'identifiant', 'code'];
  var STATUT_KEYS = ['statut', 'STATUT', 'status', 'etat_visite'];
  function normStatut(v) {
    if (v == null) return null;
    var t = String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!t) return null;
    if (/^(fait|faite|done|complete|termine|visite)/.test(t)) return 'fait';
    if (/^(probleme|pb|issue|anomalie)/.test(t)) return 'probleme';
    if (/^(a[ _-]?faire|todo|a visiter|nouveau)/.test(t)) return 'a_faire';
    return null;
  }
  function slugKey(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'champ'; }
  // Définitions de champs : membre « navenza.champs » du GeoJSON
  function readFields(nv) {
    if (!nv || !Array.isArray(nv.champs)) return null;
    return nv.champs.map(function (c) {
      var type = { texte: 'texte', text: 'texte', nombre: 'nombre', number: 'nombre', choix: 'choix', choice: 'choix', ouinon: 'ouinon', 'oui/non': 'ouinon', bool: 'ouinon' }[String(c.type || 'texte').toLowerCase()] || 'texte';
      return { key: c.cle || c.key || slugKey(c.nom || c.label), label: c.nom || c.label || c.cle || c.key, type: type, choices: Array.isArray(c.choix || c.choices) ? (c.choix || c.choices).map(String) : [] };
    }).filter(function (c) { return c.key; });
  }
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null && String(o[keys[i]]).trim() !== '') return String(o[keys[i]]).trim(); return null; }
  function stripHtml(s) { return s ? String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : ''; }
  function checkLL(lat, lon) {
    if (!(isFinite(lat) && isFinite(lon)) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      throw new Error('les coordonnées ne sont pas en degrés (WGS84). Dans QGIS, exportez la couche en EPSG:4326.');
  }
  function pointFrom(lat, lon, props, idx) {
    checkLL(lat, lon);
    props = props || {};
    var name = pick(props, NAME_KEYS) || ('Site ' + (idx + 1));
    var symTxt = pick(props, SYM_KEYS), col = pick(props, COLOR_KEYS);
    var extra = {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === '' || typeof v === 'object') return;
      if (NAME_KEYS.concat(COMMENT_KEYS, COLOR_KEYS, STATUT_KEYS).indexOf(k) >= 0) return;
      extra[k] = v;
    });
    return { extId: pick(props, ID_KEYS) || (name + '@' + lat.toFixed(5) + ',' + lon.toFixed(5)), name: name,
      comment: stripHtml(pick(props, COMMENT_KEYS)), lat: lat, lon: lon,
      sym: (window.NVSym && NVSym.match(symTxt)) || null, color: col && /^#[0-9a-f]{6}$/i.test(col) ? col : null, props: extra, statut: normStatut(pick(props, STATUT_KEYS)) };
  }
  function lineFrom(coords, props, idx) {
    var pts = coords.map(function (c) { checkLL(c[1], c[0]); return { lat: c[1], lon: c[0] }; });
    var name = pick(props || {}, NAME_KEYS) || ('Ligne ' + (idx + 1));
    return { extId: pick(props || {}, ID_KEYS) || name, name: name, points: pts };
  }

  function fromGeoJSON(gj) {
    var out = { name: gj.name || null, points: [], lines: [], fields: readFields(gj.navenza) };
    out.fieldsExplicit = !!out.fields;
    if (gj.crs && gj.crs.properties && gj.crs.properties.name && !/4326|CRS84/i.test(gj.crs.properties.name))
      throw new Error('le fichier est en ' + gj.crs.properties.name + '. Dans QGIS, exportez la couche en EPSG:4326 (WGS84).');
    var feats = gj.type === 'FeatureCollection' ? gj.features : (gj.type === 'Feature' ? [gj] : []);
    feats.forEach(function (f, i) {
      var g = f.geometry; if (!g) return; var p = f.properties || {};
      if (f.id != null && p.id == null) p = Object.assign({ id: f.id }, p);
      if (g.type === 'Point') out.points.push(pointFrom(g.coordinates[1], g.coordinates[0], p, out.points.length));
      else if (g.type === 'MultiPoint') g.coordinates.forEach(function (c, k) { var q = Object.assign({}, p); if (q.id != null) q.id = q.id + '_' + k; out.points.push(pointFrom(c[1], c[0], q, out.points.length)); });
      else if (g.type === 'LineString') out.lines.push(lineFrom(g.coordinates, p, out.lines.length));
      else if (g.type === 'MultiLineString') g.coordinates.forEach(function (c) { out.lines.push(lineFrom(c, p, out.lines.length)); });
      else if (g.type === 'Polygon') out.lines.push(lineFrom(g.coordinates[0], p, out.lines.length));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (pg) { out.lines.push(lineFrom(pg[0], p, out.lines.length)); });
    });
    if (!out.fields) {
      var pts = feats.filter(function (f) { return f.geometry && /Point/.test(f.geometry.type); }), keys = {};
      pts.forEach(function (f) { Object.keys(f.properties || {}).forEach(function (k) { if (keys[k] !== false) keys[k] = (f.properties[k] == null || String(f.properties[k]).trim() === ''); }); });
      var empty = Object.keys(keys).filter(function (k) { return keys[k] && STATUT_KEYS.concat(NAME_KEYS, COMMENT_KEYS, SYM_KEYS, COLOR_KEYS, ID_KEYS).indexOf(k) < 0; });
      if (pts.length && empty.length) out.fields = empty.map(function (k) { return { key: k, label: k.replace(/_/g, ' '), type: 'texte', choices: [] }; });
    }
    return out;
  }
  function txt(el, tag) { var e = el.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : null; }
  function kmlCoords(s) { return s.trim().split(/\s+/).map(function (c) { var a = c.split(',').map(Number); return [a[0], a[1]]; }).filter(function (c) { return isFinite(c[0]) && isFinite(c[1]); }); }
  function fromKML(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('fichier KML illisible');
    var out = { name: txt(doc, 'name'), points: [], lines: [] };
    var pms = doc.getElementsByTagName('Placemark');
    for (var i = 0; i < pms.length; i++) {
      var pm = pms[i], props = { name: txt(pm, 'name'), description: txt(pm, 'description') };
      var data = pm.getElementsByTagName('Data');
      for (var d = 0; d < data.length; d++) props[data[d].getAttribute('name')] = txt(data[d], 'value');
      var sd = pm.getElementsByTagName('SimpleData');
      for (var k = 0; k < sd.length; k++) props[sd[k].getAttribute('name')] = sd[k].textContent.trim();
      var pts = pm.getElementsByTagName('Point'), lns = pm.getElementsByTagName('LineString'), pgs = pm.getElementsByTagName('Polygon');
      for (var a = 0; a < pts.length; a++) { var c = kmlCoords(txt(pts[a], 'coordinates') || '')[0]; if (c) out.points.push(pointFrom(c[1], c[0], props, out.points.length)); }
      for (var b = 0; b < lns.length; b++) out.lines.push(lineFrom(kmlCoords(txt(lns[b], 'coordinates') || ''), props, out.lines.length));
      for (var e = 0; e < pgs.length; e++) { var ob = pgs[e].getElementsByTagName('outerBoundaryIs')[0] || pgs[e]; out.lines.push(lineFrom(kmlCoords(txt(ob, 'coordinates') || ''), props, out.lines.length)); }
    }
    return out;
  }
  function fromGPX(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('fichier GPX illisible');
    var meta = doc.getElementsByTagName('metadata')[0];
    var out = { name: meta ? txt(meta, 'name') : null, points: [], lines: [] };
    var w = doc.getElementsByTagName('wpt');
    for (var i = 0; i < w.length; i++) out.points.push(pointFrom(+w[i].getAttribute('lat'), +w[i].getAttribute('lon'), { name: txt(w[i], 'name'), description: txt(w[i], 'desc') || txt(w[i], 'cmt'), type: txt(w[i], 'type') || txt(w[i], 'sym') }, out.points.length));
    ['trk', 'rte'].forEach(function (tag) {
      var ts = doc.getElementsByTagName(tag);
      for (var j = 0; j < ts.length; j++) {
        var pts = ts[j].getElementsByTagName(tag === 'trk' ? 'trkpt' : 'rtept'), cs = [];
        for (var k = 0; k < pts.length; k++) cs.push([+pts[k].getAttribute('lon'), +pts[k].getAttribute('lat')]);
        if (cs.length > 1) out.lines.push(lineFrom(cs, { name: txt(ts[j], 'name') }, out.lines.length));
      }
    });
    return out;
  }

  async function parseFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase(), r;
    if (ext === 'kmz') {
      var zip = await JSZip.loadAsync(await file.arrayBuffer());
      var k = Object.keys(zip.files).find(function (n) { return /\.kml$/i.test(n); });
      if (!k) throw new Error('aucun fichier KML dans ce KMZ');
      r = fromKML(await zip.files[k].async('string'));
    } else {
      var text = await file.text();
      if (ext === 'kml') r = fromKML(text);
      else if (ext === 'gpx') r = fromGPX(text);
      else if (ext === 'geojson' || ext === 'json') { var gj; try { gj = JSON.parse(text); } catch (e) { throw new Error('fichier GeoJSON illisible'); } r = fromGeoJSON(gj); }
      else throw new Error('format non pris en charge (GeoJSON, KML, KMZ ou GPX attendu)');
    }
    if (!r.points.length && !r.lines.length) throw new Error('aucun point ni ligne trouvé dans ce fichier');
    r.fileName = file.name;
    r.name = r.name || file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    return r;
  }
  window.NVImport = { normStatut: normStatut, slugKey: slugKey, parseFile: parseFile, fromGeoJSON: fromGeoJSON, fromKML: fromKML, fromGPX: fromGPX };
})();
