// pmtiles.js — lecture hors ligne d'un fichier PMTiles v3 (mosaïque en tuiles) — NAVenza 5.4
// Le fichier reste dans IndexedDB : seules les tuiles affichées sont lues (Blob.slice), jamais le fichier entier.
// Format : https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
(function () {
  'use strict';

  var TYPES = { 1: 'application/x-protobuf', 2: 'image/png', 3: 'image/jpeg', 4: 'image/webp', 5: 'image/avif' };

  // Type d'image d'après les premiers octets (en-tête « inconnu », ex. MBTiles « jpg » de GDAL)
  function sniff(b) {
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return 'application/octet-stream';
  }

  function isPmtiles(u8) {
    // « PMTiles » + version 3
    return u8 && u8.length >= 8 && String.fromCharCode.apply(null, Array.prototype.slice.call(u8, 0, 7)) === 'PMTiles' && u8[7] === 3;
  }

  function u64(dv, o) { return dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; }

  function parseHeader(buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (!isPmtiles(buf)) throw new Error('Fichier PMTiles v3 attendu');
    return {
      rootOffset: u64(dv, 8), rootLength: u64(dv, 16),
      metaOffset: u64(dv, 24), metaLength: u64(dv, 32),
      leafOffset: u64(dv, 40), leafLength: u64(dv, 48),
      dataOffset: u64(dv, 56), dataLength: u64(dv, 64),
      internalCompression: buf[97], tileCompression: buf[98], tileType: buf[99],
      minZoom: buf[100], maxZoom: buf[101],
      minLon: dv.getInt32(102, true) / 1e7, minLat: dv.getInt32(106, true) / 1e7,
      maxLon: dv.getInt32(110, true) / 1e7, maxLat: dv.getInt32(114, true) / 1e7,
      centerZoom: buf[118], centerLon: dv.getInt32(119, true) / 1e7, centerLat: dv.getInt32(123, true) / 1e7
    };
  }

  async function decompress(u8, comp) {
    if (comp === 0 || comp === 1) return u8; // inconnu / aucune
    if (comp === 2) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Décompression gzip non prise en charge par ce navigateur');
      var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('Compression PMTiles non prise en charge (' + comp + ')');
  }

  function readVarint(b, p) {
    var v = 0, mul = 1, byte;
    do { byte = b[p.i++]; v += (byte & 0x7f) * mul; mul *= 128; } while (byte & 0x80);
    return v;
  }

  function parseDirectory(b) {
    var p = { i: 0 }, n = readVarint(b, p), e = new Array(n), last = 0, i;
    for (i = 0; i < n; i++) { last += readVarint(b, p); e[i] = { tileId: last, offset: 0, length: 0, runLength: 1 }; }
    for (i = 0; i < n; i++) e[i].runLength = readVarint(b, p);
    for (i = 0; i < n; i++) e[i].length = readVarint(b, p);
    for (i = 0; i < n; i++) {
      var v = readVarint(b, p);
      e[i].offset = (v === 0 && i > 0) ? e[i - 1].offset + e[i - 1].length : v - 1;
    }
    return e;
  }

  // Identifiant de tuile (courbe de Hilbert), comme la spécification
  function rotate(n, xy, rx, ry) {
    if (ry === 0) {
      if (rx === 1) { xy[0] = n - 1 - xy[0]; xy[1] = n - 1 - xy[1]; }
      var t = xy[0]; xy[0] = xy[1]; xy[1] = t;
    }
  }
  function zxyToTileId(z, x, y) {
    var acc = (Math.pow(4, z) - 1) / 3, n = Math.pow(2, z), xy = [x, y], d = 0;
    for (var s = n / 2; s >= 1; s /= 2) {
      var rx = (xy[0] & s) > 0 ? 1 : 0, ry = (xy[1] & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      rotate(s, xy, rx, ry);
    }
    return acc + d;
  }

  function findEntry(entries, id) {
    var lo = 0, hi = entries.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, c = id - entries[mid].tileId;
      if (c > 0) lo = mid + 1; else if (c < 0) hi = mid - 1; else return entries[mid];
    }
    if (hi >= 0) {
      var e = entries[hi];
      if (e.runLength === 0) return e;                 // pointe vers un répertoire « feuille »
      if (id - e.tileId < e.runLength) return e;       // tuile répétée (ex. eau, forêt uniforme)
    }
    return null;
  }

  function PMTilesBlob(blob) {
    this.blob = blob;
    this._dirs = new Map();
    this._head = null;
  }
  PMTilesBlob.prototype._read = async function (off, len) {
    return new Uint8Array(await this.blob.slice(off, off + len).arrayBuffer());
  };
  PMTilesBlob.prototype.header = function () {
    var self = this;
    if (!this._head) this._head = (async function () {
      var first = await self._read(0, 16384);
      var h = parseHeader(first);
      var rootRaw = h.rootOffset + h.rootLength <= first.length ? first.subarray(h.rootOffset, h.rootOffset + h.rootLength) : await self._read(h.rootOffset, h.rootLength);
      self._root = (parseDirectory(await decompress(rootRaw, h.internalCompression)));
      h.metadata = {};
      if (h.metaLength) {
        try { h.metadata = JSON.parse(new TextDecoder().decode(await decompress(await self._read(h.metaOffset, h.metaLength), h.internalCompression))); } catch (e) { h.metadata = {}; }
      }
      h.mime = TYPES[h.tileType] || 'application/octet-stream';
      return h;
    })();
    return this._head;
  };
  PMTilesBlob.prototype._dir = async function (h, off, len) {
    var key = off + ':' + len, d = this._dirs.get(key);
    if (!d) {
      d = parseDirectory(await decompress(await this._read(h.leafOffset + off, len), h.internalCompression));
      if (this._dirs.size >= 64) this._dirs.delete(this._dirs.keys().next().value);
      this._dirs.set(key, d);
    }
    return d;
  };
  // Retourne les octets de la tuile, ou null si elle n'existe pas (hors emprise)
  PMTilesBlob.prototype.getTile = async function (z, x, y) {
    var h = await this.header();
    if (z < h.minZoom || z > h.maxZoom) return null;
    var id = zxyToTileId(z, x, y), dir = this._root;
    for (var depth = 0; depth < 4; depth++) {
      var e = findEntry(dir, id);
      if (!e) return null;
      if (e.runLength > 0) return decompress(await this._read(h.dataOffset + e.offset, e.length), h.tileCompression);
      dir = await this._dir(h, e.offset, e.length);
    }
    return null;
  };

  // Calque Leaflet : une image par tuile, lue à la demande dans le Blob
  var PmtilesLayer = L.GridLayer.extend({
    initialize: function (blob, header, options) {
      this._pm = blob instanceof PMTilesBlob ? blob : new PMTilesBlob(blob);
      this._h = header;
      options = L.extend({
        tileSize: 256, minNativeZoom: header.minZoom, maxNativeZoom: header.maxZoom,
        bounds: L.latLngBounds([header.minLat, header.minLon], [header.maxLat, header.maxLon]),
        keepBuffer: 2, updateWhenZooming: false
      }, options || {});
      L.GridLayer.prototype.initialize.call(this, options);
    },
    createTile: function (coords, done) {
      var img = document.createElement('img'), mime = this._h.mime;
      img.alt = ''; img.setAttribute('role', 'presentation');
      this._pm.getTile(coords.z, coords.x, coords.y).then(function (bytes) {
        if (!bytes || !bytes.length) { done(null, img); return; }
        var url = URL.createObjectURL(new Blob([bytes], { type: mime === 'application/octet-stream' ? sniff(bytes) : mime }));
        img.onload = function () { URL.revokeObjectURL(url); done(null, img); };
        img.onerror = function () { URL.revokeObjectURL(url); done(new Error('tuile illisible'), img); };
        img.src = url;
      }).catch(function (e) { done(e, img); });
      return img;
    }
  });

  // Lecture rapide de l'en-tête depuis un fichier (import) ou un Blob (IndexedDB)
  async function pmtilesInfo(blob) {
    var pm = new PMTilesBlob(blob), h = await pm.header();
    return { pm: pm, header: h };
  }

  window.NVPmtiles = {
    isPmtiles: isPmtiles, parseHeader: parseHeader, parseDirectory: parseDirectory,
    zxyToTileId: zxyToTileId, PMTilesBlob: PMTilesBlob, Layer: PmtilesLayer, info: pmtilesInfo
  };
})();
