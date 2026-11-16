// exif.js — NAVenza MAP : lire la date d'une photo et réécrire date + position GPS dans un JPEG.
// La réduction des photos (canvas) efface les métadonnées d'origine ; on les remet à l'export.
(function (root) {
  'use strict';

  // ── Lecture : DateTimeOriginal (ou DateTime) d'un JPEG → ISO, sinon null ──
  function readDate(buf) {
    try {
      var v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      var o = 2;
      while (o + 4 < v.byteLength) {
        var m = v.getUint16(o), len = v.getUint16(o + 2);
        if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiffDate(v, o + 10);
        if ((m & 0xFF00) !== 0xFF00 || m === 0xFFDA) break;
        o += 2 + len;
      }
    } catch (e) {}
    return null;
  }
  function tiffDate(v, t) {
    var le = v.getUint16(t) === 0x4949;
    var u16 = function (p) { return v.getUint16(t + p, le); }, u32 = function (p) { return v.getUint32(t + p, le); };
    function tags(ifd) {
      var out = {}, n = u16(ifd);
      for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), off: e + 8 }; }
      return out;
    }
    function str(tg) {
      if (!tg || tg.type !== 2) return null;
      var p = tg.count > 4 ? u32(tg.off) : tg.off, s = '';
      for (var i = 0; i < tg.count - 1; i++) s += String.fromCharCode(v.getUint8(t + p + i));
      return s;
    }
    var ifd0 = tags(u32(4)), dt = null;
    if (ifd0[0x8769]) dt = str(tags(u32(ifd0[0x8769].off))[0x9003]);
    dt = dt || str(ifd0[0x0132]);
    var m = dt && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(dt);
    if (!m || m[1] === '0000') return null;
    // Heure locale de l'appareil photo, sans fuseau : on la garde telle quelle (ISO sans « Z »)
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6];
  }

  // ── Écriture : bloc EXIF (APP1) inséré juste après le début du JPEG ──
  function ascii(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?'); }
  function exifDate(iso) { // ISO (avec ou sans Z) → « AAAA:MM:JJ HH:MM:SS » en heure locale
    var s = String(iso || '');
    if (!/Z$|[+-]\d\d:?\d\d$/.test(s) && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)) return s.slice(0, 19).replace(/-/g, ':').replace('T', ' ');
    var d = new Date(s); if (isNaN(d)) d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + ':' + p(d.getMonth() + 1) + ':' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function dms(x) { x = Math.abs(x); var d = Math.floor(x), mf = (x - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60 * 10000); return [[d, 1], [m, 1], [s, 10000]]; }

  function build(meta) {
    // Entrées : [tag, type, count, valeur] ; type 1 BYTE, 2 ASCII, 4 LONG, 5 RATIONAL
    var desc = ascii(meta.desc).slice(0, 200), date = exifDate(meta.date), hasGps = isFinite(meta.lat) && isFinite(meta.lon);
    var ifd0 = [[0x010E, 2, 0, desc + '\0'], [0x0131, 2, 0, ascii(meta.software || 'NAVenza MAP') + '\0'], [0x0132, 2, 0, date + '\0'], [0x8769, 4, 1, 0]];
    if (hasGps) ifd0.push([0x8825, 4, 1, 0]);
    var exif = [[0x9003, 2, 0, date + '\0'], [0x9004, 2, 0, date + '\0']];
    var gps = hasGps ? [[0x0000, 1, 4, [2, 3, 0, 0]], [0x0001, 2, 0, (meta.lat >= 0 ? 'N' : 'S') + '\0'], [0x0002, 5, 3, dms(meta.lat)],
      [0x0003, 2, 0, (meta.lon >= 0 ? 'E' : 'W') + '\0'], [0x0004, 5, 3, dms(meta.lon)]] : [];
    if (hasGps && isFinite(meta.alt) && meta.alt !== null) gps.push([0x0005, 1, 1, [meta.alt < 0 ? 1 : 0]], [0x0006, 5, 1, [[Math.round(Math.abs(meta.alt) * 10), 10]]]);
    [ifd0, exif, gps].forEach(function (l) { l.forEach(function (e) { if (e[1] === 2) e[2] = e[3].length; }); l.sort(function (a, b) { return a[0] - b[0]; }); });
    var size = function (e) { return e[1] === 5 ? 8 * e[2] : e[1] === 4 ? 4 * e[2] : e[2]; };
    var ifdLen = function (l) { return l.length ? 2 + l.length * 12 + 4 : 0; };
    var extra = function (l) { return l.reduce(function (s, e) { var z = size(e); return s + (z > 4 ? z + (z & 1) : 0); }, 0); };
    var o0 = 8, oE = o0 + ifdLen(ifd0) + extra(ifd0), oG = oE + ifdLen(exif) + extra(exif), total = oG + ifdLen(gps) + extra(gps);
    ifd0.forEach(function (e) { if (e[0] === 0x8769) e[3] = oE; if (e[0] === 0x8825) e[3] = oG; });
    var b = new Uint8Array(total), v = new DataView(b.buffer);
    b[0] = 0x4D; b[1] = 0x4D; v.setUint16(2, 42); v.setUint32(4, o0); // gros-boutiste (« MM »)
    function writeIfd(l, at) {
      if (!l.length) return;
      v.setUint16(at, l.length); var data = at + 2 + l.length * 12 + 4;
      l.forEach(function (e, i) {
        var p = at + 2 + i * 12, z = size(e), dst;
        v.setUint16(p, e[0]); v.setUint16(p + 2, e[1]); v.setUint32(p + 4, e[2]);
        if (z > 4) { v.setUint32(p + 8, data); dst = data; data += z + (z & 1); } else dst = p + 8;
        if (e[1] === 2) for (var k = 0; k < e[3].length; k++) b[dst + k] = e[3].charCodeAt(k);
        else if (e[1] === 1) e[3].forEach(function (x, k) { b[dst + k] = x; });
        else if (e[1] === 4) v.setUint32(dst, e[3]);
        else if (e[1] === 5) e[3].forEach(function (r, k) { v.setUint32(dst + k * 8, r[0]); v.setUint32(dst + k * 8 + 4, r[1]); });
      });
      v.setUint32(at + 2 + l.length * 12, 0);
    }
    writeIfd(ifd0, o0); writeIfd(exif, oE); writeIfd(gps, oG);
    return b;
  }

  // Ajoute les métadonnées à un JPEG (data URL) ; retourne une nouvelle data URL. Remplace un EXIF existant.
  function inject(dataUrl, meta) {
    try {
      var bin = atob(String(dataUrl).split(',')[1]), src = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
      if (src[0] !== 0xFF || src[1] !== 0xD8) return dataUrl;
      // Garder SOI + APP0 (JFIF) ; retirer un ancien APP1 Exif
      var o = 2, keep = [];
      while (o + 4 < src.length && src[o] === 0xFF && (src[o + 1] === 0xE0 || src[o + 1] === 0xE1)) {
        var len = (src[o + 2] << 8) | src[o + 3], isExif = src[o + 1] === 0xE1 && src[o + 4] === 0x45 && src[o + 5] === 0x78;
        if (!isExif) keep.push(src.subarray(o, o + 2 + len));
        o += 2 + len;
      }
      var tiff = build(meta), app1Len = 2 + 6 + tiff.length;
      if (app1Len > 65535) return dataUrl;
      var head = new Uint8Array(4 + 6); head[0] = 0xFF; head[1] = 0xE1; head[2] = app1Len >> 8; head[3] = app1Len & 255;
      [0x45, 0x78, 0x69, 0x66, 0, 0].forEach(function (x, k) { head[4 + k] = x; });
      var parts = [src.subarray(0, 2)].concat(keep, [head, tiff, src.subarray(o)]);
      var n = parts.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(n), at = 0;
      parts.forEach(function (p) { out.set(p, at); at += p.length; });
      var s = ''; for (var j = 0; j < out.length; j += 0x8000) s += String.fromCharCode.apply(null, out.subarray(j, j + 0x8000));
      return 'data:image/jpeg;base64,' + btoa(s);
    } catch (e) { console.warn('[exif]', e); return dataUrl; }
  }

  root.NVExif = { readDate: readDate, inject: inject, exifDate: exifDate };
})(typeof window !== 'undefined' ? window : globalThis);
