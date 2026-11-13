// coords.js — formats de coordonnées (DD, DMS, DDM, UTM 19N, MTM 6) et lecture de texte collé
// Projections : Mercator transverse (formules de Snyder, ellipsoïde GRS80/NAD83).
// Note : WGS84 (GPS) et NAD83 diffèrent d'environ 1 à 2 m au Québec ; écart ignoré ici.
(function () {
  'use strict';
  var A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
  var ZONES = {
    utm: { label: 'UTM 19', lon0: -69, k0: 0.9996, fe: 500000, fn: 0 },
    mtm: { label: 'MTM 6', lon0: -67.5, k0: 0.9999, fe: 304800, fn: 0 }
  };
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function mArc(p) {
    var e4 = E2 * E2, e6 = e4 * E2;
    return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p) +
      (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
  }
  function toTM(lat, lon, z) {
    var p = rad(lat), N = A / Math.sqrt(1 - E2 * Math.sin(p) * Math.sin(p)), T = Math.tan(p) * Math.tan(p), C = EP2 * Math.cos(p) * Math.cos(p);
    var a = (rad(lon) - rad(z.lon0)) * Math.cos(p), M = mArc(p);
    var x = z.k0 * N * (a + (1 - T + C) * a * a * a / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(a, 5) / 120);
    var y = z.k0 * (M + N * Math.tan(p) * (a * a / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(a, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(a, 6) / 720));
    return { e: x + z.fe, n: y + z.fn };
  }
  function fromTM(e, n, z) {
    var x = e - z.fe, M = (n - z.fn) / z.k0, e4 = E2 * E2, e6 = e4 * E2;
    var mu = M / (A * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)), e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s = Math.sin(p1), c = Math.cos(p1), C1 = EP2 * c * c, T1 = Math.tan(p1) * Math.tan(p1), N1 = A / Math.sqrt(1 - E2 * s * s);
    var R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5), D = x / (N1 * z.k0);
    var lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = rad(z.lon0) + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c;
    return { lat: deg(lat), lon: deg(lon) };
  }

  var FORMATS = [['dd', 'Degrés décimaux'], ['dms', 'DMS'], ['ddm', 'Deg. min. déc.'], ['utm', 'UTM 19'], ['mtm', 'MTM 6']];
  function n(v, d) { return v.toFixed(d).replace('.', ','); }
  function hemi(v, pos, neg) { return v >= 0 ? pos : neg; }
  function dmsParts(v) { var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; if (s >= 59.95) { s = 0; m++; } if (m >= 60) { m = 0; d++; } return [d, m, s]; }
  function group(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function format(lat, lon, fmt) {
    if (fmt === 'dms') { var a = dmsParts(lat), b = dmsParts(lon); return a[0] + '°' + String(a[1]).padStart(2, '0') + '′' + n(a[2], 1).padStart(4, '0') + '″ ' + hemi(lat, 'N', 'S') + '  ' + b[0] + '°' + String(b[1]).padStart(2, '0') + '′' + n(b[2], 1).padStart(4, '0') + '″ ' + hemi(lon, 'E', 'O'); }
    if (fmt === 'ddm') { var la = Math.abs(lat), lo = Math.abs(lon); return Math.floor(la) + '°' + n((la - Math.floor(la)) * 60, 3).padStart(6, '0') + '′ ' + hemi(lat, 'N', 'S') + '  ' + Math.floor(lo) + '°' + n((lo - Math.floor(lo)) * 60, 3).padStart(6, '0') + '′ ' + hemi(lon, 'E', 'O'); }
    if (fmt === 'utm' || fmt === 'mtm') { var p = toTM(lat, lon, ZONES[fmt]); return ZONES[fmt].label + '  ' + group(p.e) + ' E  ' + group(p.n) + ' N'; }
    return n(Math.abs(lat), 5) + ' ' + hemi(lat, 'N', 'S') + '  ' + n(Math.abs(lon), 5) + ' ' + hemi(lon, 'E', 'O');
  }
  // Texte simple à copier (décimal avec point)
  function plain(lat, lon) { return lat.toFixed(6) + ', ' + lon.toFixed(6); }

  // ── Lecture d'un texte collé (texto, courriel, fichier) ──
  // Retourne {lat, lon, fmt} ou null. Hypothèse : on est au Québec (longitude ouest).
  function parse(text) {
    if (!text) return null;
    var t = String(text).replace(/[−–—]/g, '-').replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/\s+/g, ' ').trim();
    var up = t.toUpperCase();
    // 1) Projetées : deux grands nombres (E, N). On retire d'abord « UTM 19 », « MTM 6 », « zone 19T ».
    var tp = t.replace(/\b(UTM|MTM)\s*(zone\s*)?\d{1,2}\s*[A-Z]?\b/ig, ' ').replace(/\bzone\s*\d{1,2}\s*[A-Z]?\b/ig, ' ');
    var big = (tp.replace(/\b\d{1,3}(?: \d{3})+\b/g, function (m) { return m.replace(/ /g, ''); }).match(/\d{6,7}(?:[.,]\d+)?/g) || []).map(function (s) { return parseFloat(s.replace(',', '.')); });
    if (big.length >= 2) {
      var e = big.filter(function (v) { return v < 1000000; })[0], nn = big.filter(function (v) { return v >= 4000000; })[0];
      if (e != null && nn != null) {
        var fmt = /MTM/.test(up) ? 'mtm' : (/UTM/.test(up) ? 'utm' : (e >= 400000 ? 'utm' : 'mtm'));
        var g = fromTM(e, nn, ZONES[fmt]);
        return ok(g.lat, g.lon, fmt);
      }
    }
    // 2) Décimal : deux nombres à décimales (point ou virgule)
    var dd = t.match(/(-?\d{1,2}[.,]\d{3,})\s*°?\s*([NS])?\s*[,;/ ]\s*(-?\d{1,3}[.,]\d{3,})\s*°?\s*([EOW])?/i);
    if (dd && !/['"]/.test(t)) {
      var lat = parseFloat(dd[1].replace(',', '.')), lon = parseFloat(dd[3].replace(',', '.'));
      if (dd[2] && /S/i.test(dd[2])) lat = -Math.abs(lat);
      if (dd[4] && /[OW]/i.test(dd[4])) lon = -Math.abs(lon);
      return ok(lat, lon, 'dd');
    }
    // 3) DMS / DDM : 4 ou 6 nombres, lettres N S E O W possibles
    var nums = (t.match(/-?\d+(?:[.,]\d+)?/g) || []).map(function (s) { return parseFloat(s.replace(',', '.')); });
    var letters = up.match(/[NSEOW](?![A-Z])/g) || [];
    if (nums.length === 6 || nums.length === 4) {
      var k = nums.length / 2, v = function (arr) { var s = Math.abs(arr[0]) + arr[1] / 60 + (k === 3 ? arr[2] / 3600 : 0); return arr[0] < 0 ? -s : s; };
      var la2 = v(nums.slice(0, k)), lo2 = v(nums.slice(k));
      if (letters.indexOf('S') >= 0) la2 = -Math.abs(la2);
      if (letters.indexOf('O') >= 0 || letters.indexOf('W') >= 0) lo2 = -Math.abs(lo2);
      return ok(la2, lo2, k === 3 ? 'dms' : 'ddm');
    }
    return null;
    function ok(a, b, f) {
      if (b > 0 && b > 40 && b < 90) b = -b; // Québec : longitude ouest
      if (!(a >= -90 && a <= 90 && b >= -180 && b <= 180) || isNaN(a) || isNaN(b)) return null;
      return { lat: a, lon: b, fmt: f };
    }
  }

  window.NVCoords = { FORMATS: FORMATS, ZONES: ZONES, format: format, plain: plain, parse: parse, toTM: toTM, fromTM: fromTM, dmsParts: dmsParts };
})();
