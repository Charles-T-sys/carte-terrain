// export.js — exports GeoJSON, GPX, KMZ et Shapefile (repris de la v2, adaptés aux calques)
// Chaque fonction reçoit les données à exporter et retourne une liste de fichiers {blob, name}.
(function () {
  'use strict';
  function escapeXml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  function hexToKml(hex) { var h = (hex || '#ff6d00').replace('#', ''); return 'ff' + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function layerName(byId, id) { return (byId[id] && byId[id].name) || ''; }
  function slug(s) { return String(s || 'export').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'export'; }
  function km(a, b) { var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180, s = Math.sin(dLat / 2), c = Math.sin(dLon / 2); var h = s * s + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * c * c; return R * 2 * Math.asin(Math.sqrt(h)); }
  function traceKm(t) { var d = 0; for (var i = 1; i < t.points.length; i++) d += km(t.points[i - 1], t.points[i]); return d; }
  function validTraces(trs) { return trs.filter(function (t) { return t.points && t.points.length > 1; }); }

  // ── GeoJSON (points + tracés) ──
  function geojson(wps, trs, byId, label) {
    var f = wps.map(function (w) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: { id: w.id, name: w.name, layer: layerName(byId, w.layerId), category: w.cat || 'observation', comment: w.comment || '',
          photo_count: (w.photoIds || []).length, timestamp: w.timestamp, shape: w.shape || 'circle', color: w.color || '#ff6d00' } };
    }).concat(validTraces(trs).map(function (t) {
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: t.points.map(function (p) { return [p.lon, p.lat]; }) },
        properties: { id: t.id, name: t.name || 'Tracé', layer: layerName(byId, t.layerId), timestamp: t.timestamp, points: t.points.length,
          dist_km: +traceKm(t).toFixed(3), color: t.color || '#ff3d00', times: t.points.map(function (p) { return p.t || null; }) } };
    }));
    var gj = { type: 'FeatureCollection', name: label || 'navenza', features: f };
    return [{ blob: new Blob([JSON.stringify(gj, null, 2)], { type: 'application/geo+json' }), name: 'navenza_' + slug(label) + '_' + today() + '.geojson' }];
  }

  // ── GPX (points + tracés) ──
  function gpx(wps, trs, byId, label) {
    var w = wps.map(function (p) {
      return '  <wpt lat="' + p.lat.toFixed(7) + '" lon="' + p.lon.toFixed(7) + '">' + (p.timestamp ? '<time>' + p.timestamp + '</time>' : '') +
        '<name>' + escapeXml(p.name) + '</name>' + (p.comment ? '<desc>' + escapeXml(p.comment) + '</desc>' : '') +
        '<type>' + escapeXml(p.cat || 'observation') + '</type></wpt>';
    }).join('\n');
    var t = validTraces(trs).map(function (tr) {
      var pts = tr.points.map(function (p) { return '    <trkpt lat="' + p.lat.toFixed(7) + '" lon="' + p.lon.toFixed(7) + '">' + (p.t ? '<time>' + p.t + '</time>' : '') + '</trkpt>'; }).join('\n');
      return '  <trk><name>' + escapeXml(tr.name || 'Tracé') + '</name><type>' + escapeXml(layerName(byId, tr.layerId)) + '</type><trkseg>\n' + pts + '\n  </trkseg></trk>';
    }).join('\n');
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="NAVenza MAP" xmlns="http://www.topografix.com/GPX/1/1">\n' + w + (w && t ? '\n' : '') + t + '\n</gpx>';
    return [{ blob: new Blob([s], { type: 'application/gpx+xml' }), name: 'navenza_' + slug(label) + '_' + today() + '.gpx' }];
  }

  // ── KMZ (photos intégrées, découpage au-delà de 15 Mo) ──
  function compressDataUrl(dataUrl, quality) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/jpeg', quality)); };
      img.onerror = function () { res(dataUrl); };
      img.src = dataUrl;
    });
  }
  async function kmz(wps, trs, byId, label, getPhotos, quality, partsMode) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip non chargé');
    var now = today(), allPhotos = [], folders = {};
    var styles = wps.map(function (w) { return '<Style id="wp_' + w.id + '"><IconStyle><color>' + hexToKml(w.color) + '</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style>'; }).join('') +
      validTraces(trs).map(function (t) { return '<Style id="tr_' + t.id + '"><LineStyle><color>' + hexToKml(t.color) + '</color><width>' + ((t.weight || 4) * 0.5).toFixed(1) + '</width></LineStyle></Style>'; }).join('');
    function push(layerId, xml) { var k = layerName(byId, layerId) || 'Sans calque'; (folders[k] = folders[k] || []).push(xml); }
    for (var i = 0; i < wps.length; i++) {
      var w = wps[i], photos = await getPhotos(w), prs = [];
      for (var j = 0; j < photos.length; j++) {
        var c = await compressDataUrl(photos[j].data, quality);
        allPhotos.push({ name: 'wp_' + w.id + '_' + j + '.jpg', dataUrl: c }); prs.push('photos/wp_' + w.id + '_' + j + '.jpg');
      }
      var desc = []; if (w.comment) desc.push(escapeXml(w.comment));
      prs.forEach(function (p) { desc.push('<img src="' + p + '" style="max-width:300px">'); });
      push(w.layerId, '  <Placemark><name>' + escapeXml(w.name) + '</name>' + (desc.length ? '<description><![CDATA[' + desc.join('<br>') + ']]></description>' : '') +
        '<TimeStamp><when>' + (w.timestamp || now) + '</when></TimeStamp><styleUrl>#wp_' + w.id + '</styleUrl><Point><coordinates>' + w.lon + ',' + w.lat + ',0</coordinates></Point></Placemark>');
    }
    validTraces(trs).forEach(function (t) {
      push(t.layerId, '  <Placemark><name>' + escapeXml(t.name || 'Tracé') + '</name><TimeStamp><when>' + (t.timestamp || now) + '</when></TimeStamp><styleUrl>#tr_' + t.id +
        '</styleUrl><LineString><tessellate>1</tessellate><coordinates>' + t.points.map(function (p) { return p.lon + ',' + p.lat + ',0'; }).join(' ') + '</coordinates></LineString></Placemark>');
    });
    var body = Object.keys(folders).map(function (k) { return ' <Folder><name>' + escapeXml(k) + '</name>\n' + folders[k].join('\n') + '\n </Folder>'; }).join('\n');
    var kml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + escapeXml('NAVenza MAP — ' + (label || '') + ' — ' + now) + '</name>\n' + styles + '\n' + body + '\n</Document></kml>';
    var total = new TextEncoder().encode(kml).length + allPhotos.reduce(function (s, p) { return s + Math.round(p.dataUrl.length * 0.75); }, 0);
    var MB15 = 15 * 1024 * 1024, n = 1;
    if (partsMode === '2') n = 2; else if (partsMode === '3') n = 3; else if (total > MB15) n = total > MB15 * 2 ? 3 : 2;
    async function build(subset) {
      var zip = new JSZip(), pf = zip.folder('photos'); zip.file('doc.kml', kml);
      subset.forEach(function (ph) { try { var b = atob(ph.dataUrl.split(',')[1]), by = new Uint8Array(b.length); for (var k = 0; k < b.length; k++) by[k] = b.charCodeAt(k); pf.file(ph.name, by, { binary: true }); } catch (e) {} });
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.google-earth.kmz' });
    }
    var base = 'navenza_' + slug(label) + '_' + now, out = [];
    if (n === 1) out.push({ blob: await build(allPhotos), name: base + '.kmz' });
    else { var ch = Math.ceil(allPhotos.length / n); for (var p = 0; p < n; p++) out.push({ blob: await build(allPhotos.slice(p * ch, (p + 1) * ch)), name: base + '_partie' + (p + 1) + '.kmz' }); }
    out.totalBytes = total;
    return out;
  }

  // ── Shapefile (points + tracés, WGS84) ──
  function shpPoints(wps) {
    var rs = 28, fb = 100 + wps.length * (8 + rs), shp = new DataView(new ArrayBuffer(fb)), xb = 100 + wps.length * 8, shx = new DataView(new ArrayBuffer(xb));
    var lats = wps.map(function (w) { return w.lat; }), lons = wps.map(function (w) { return w.lon; });
    var bb = [Math.min.apply(null, lons), Math.min.apply(null, lats), Math.max.apply(null, lons), Math.max.apply(null, lats)];
    [[shp, fb], [shx, xb]].forEach(function (a) { var v = a[0]; v.setInt32(0, 9994, false); v.setInt32(24, a[1] / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, 1, true); bb.forEach(function (x, k) { v.setFloat64(36 + k * 8, x, true); }); });
    var o = 100, xo = 100;
    wps.forEach(function (w, i) {
      shp.setInt32(o, i + 1, false); shp.setInt32(o + 4, rs / 2, false); shp.setInt32(o + 8, 1, true); shp.setFloat64(o + 12, w.lon, true); shp.setFloat64(o + 20, w.lat, true);
      shx.setInt32(xo, o / 2, false); shx.setInt32(xo + 4, rs / 2, false); o += 8 + rs; xo += 8;
    });
    return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer) };
  }
  function shpLines(trs) {
    var rb = 0; trs.forEach(function (t) { rb += 8 + 44 + 4 + 16 * t.points.length; });
    var fb = 100 + rb, shp = new DataView(new ArrayBuffer(fb)), xb = 100 + trs.length * 8, shx = new DataView(new ArrayBuffer(xb));
    var bb = [Infinity, Infinity, -Infinity, -Infinity];
    trs.forEach(function (t) { t.points.forEach(function (p) { bb[0] = Math.min(bb[0], p.lon); bb[1] = Math.min(bb[1], p.lat); bb[2] = Math.max(bb[2], p.lon); bb[3] = Math.max(bb[3], p.lat); }); });
    [[shp, fb], [shx, xb]].forEach(function (a) { var v = a[0]; v.setInt32(0, 9994, false); v.setInt32(24, a[1] / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, 3, true); bb.forEach(function (x, k) { v.setFloat64(36 + k * 8, x, true); }); });
    var o = 100, xo = 100;
    trs.forEach(function (t, i) {
      var n = t.points.length, cb = 44 + 4 + 16 * n, tb = [Infinity, Infinity, -Infinity, -Infinity];
      t.points.forEach(function (p) { tb[0] = Math.min(tb[0], p.lon); tb[1] = Math.min(tb[1], p.lat); tb[2] = Math.max(tb[2], p.lon); tb[3] = Math.max(tb[3], p.lat); });
      shx.setInt32(xo, o / 2, false); shx.setInt32(xo + 4, cb / 2, false);
      shp.setInt32(o, i + 1, false); shp.setInt32(o + 4, cb / 2, false); shp.setInt32(o + 8, 3, true);
      tb.forEach(function (x, k) { shp.setFloat64(o + 12 + k * 8, x, true); });
      shp.setInt32(o + 44, 1, true); shp.setInt32(o + 48, n, true); shp.setInt32(o + 52, 0, true);
      var po = o + 56; t.points.forEach(function (p) { shp.setFloat64(po, p.lon, true); shp.setFloat64(po + 8, p.lat, true); po += 16; });
      o += 8 + cb; xo += 8;
    });
    return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer) };
  }
  // DBF en UTF-8 (fichier .cpg fourni) ; les textes sont coupés sans briser un caractère accentué
  function dbf(records, fields) {
    var enc = new TextEncoder(), hs = 32 + fields.length * 32 + 1, rsz = 1 + fields.reduce(function (s, f) { return s + f.len; }, 0);
    var buf = new Uint8Array(hs + records.length * rsz + 1), d = new Date();
    buf[0] = 3; buf[1] = d.getFullYear() - 1900; buf[2] = d.getMonth() + 1; buf[3] = d.getDate();
    var dv = new DataView(buf.buffer); dv.setInt32(4, records.length, true); dv.setInt16(8, hs, true); dv.setInt16(10, rsz, true);
    var fo = 32;
    fields.forEach(function (f) { buf.set(enc.encode(f.name.substring(0, 10)), fo); buf[fo + 11] = f.type.charCodeAt(0); buf[fo + 16] = f.len; buf[fo + 17] = f.dec || 0; fo += 32; });
    buf[fo] = 0x0D;
    function fit(val, len) { var b = enc.encode(val); if (b.length <= len) return b; var cut = len; while (cut > 0 && (b[cut] & 0xC0) === 0x80) cut--; return b.slice(0, cut); }
    var ro = hs;
    records.forEach(function (r) {
      buf[ro] = 0x20; var vo = ro + 1;
      fields.forEach(function (f) {
        var val = String(r[f.name] == null ? '' : r[f.name]), b = fit(val, f.len), pad = new Uint8Array(f.len).fill(0x20);
        if (f.type === 'N') pad.set(b, f.len - b.length); else pad.set(b, 0);
        buf.set(pad, vo); vo += f.len;
      });
      ro += rsz;
    });
    buf[ro] = 0x1A;
    return buf;
  }
  var PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  async function shapefile(wps, trs, byId, label) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip non chargé');
    var zip = new JSZip(), prj = new TextEncoder().encode(PRJ), vt = validTraces(trs);
    if (wps.length) {
      var p = shpPoints(wps), f = zip.folder('points');
      var fields = [{ name: 'NAME', type: 'C', len: 60 }, { name: 'LAYER', type: 'C', len: 60 }, { name: 'CATEGORY', type: 'C', len: 20 }, { name: 'COMMENT', type: 'C', len: 254 },
        { name: 'TIMESTAMP', type: 'C', len: 24 }, { name: 'SHAPE', type: 'C', len: 12 }, { name: 'COLOR', type: 'C', len: 10 }, { name: 'PHOTOS', type: 'N', len: 3 },
        { name: 'LAT', type: 'N', len: 12, dec: 7 }, { name: 'LON', type: 'N', len: 13, dec: 7 }];
      f.file('points.shp', p.shp); f.file('points.shx', p.shx); f.file('points.prj', prj); f.file('points.cpg', 'UTF-8');
      f.file('points.dbf', dbf(wps.map(function (w) { return { NAME: w.name || '', LAYER: layerName(byId, w.layerId), CATEGORY: w.cat || 'observation', COMMENT: w.comment || '', TIMESTAMP: (w.timestamp || '').slice(0, 24),
        SHAPE: w.shape || 'circle', COLOR: w.color || '#ff6d00', PHOTOS: (w.photoIds || []).length, LAT: w.lat.toFixed(7), LON: w.lon.toFixed(7) }; }), fields));
    }
    if (vt.length) {
      var l = shpLines(vt), g = zip.folder('traces');
      var tf = [{ name: 'NAME', type: 'C', len: 60 }, { name: 'LAYER', type: 'C', len: 60 }, { name: 'TIMESTAMP', type: 'C', len: 24 }, { name: 'PTS', type: 'N', len: 6 },
        { name: 'DIST_KM', type: 'N', len: 10, dec: 3 }, { name: 'COLOR', type: 'C', len: 10 }];
      g.file('traces.shp', l.shp); g.file('traces.shx', l.shx); g.file('traces.prj', prj); g.file('traces.cpg', 'UTF-8');
      g.file('traces.dbf', dbf(vt.map(function (t) { return { NAME: t.name || 'Tracé', LAYER: layerName(byId, t.layerId), TIMESTAMP: (t.timestamp || '').slice(0, 24), PTS: t.points.length, DIST_KM: traceKm(t).toFixed(3), COLOR: t.color || '#ff3d00' }; }), tf));
    }
    return [{ blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }), name: 'navenza_shp_' + slug(label) + '_' + today() + '.zip' }];
  }

  window.NVExport = { geojson: geojson, gpx: gpx, kmz: kmz, shapefile: shapefile, traceKm: traceKm, escapeXml: escapeXml };
})();
