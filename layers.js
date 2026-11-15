// layers.js — TiffLayer et PdfLayer (extraits tels quels de carte_terrain.html v2), + calcul d'emprise
// TiffLayer — couche Leaflet basée sur UTIF.js
(function() {

  function getTag(ifd, num) {
    return ifd['t' + num] || ifd[num] || null;
  }

  function getBoundsFromTags(ifd) {
    var tiepoint   = getTag(ifd, 33922);
    var pixelScale = getTag(ifd, 33550);
    if (!tiepoint || !pixelScale) {
      console.warn('Tags GeoTIFF manquants. Dispo:', Object.keys(ifd).filter(function(k){return k.startsWith('t');}).join(', '));
      return null;
    }
    var px=tiepoint[0], py=tiepoint[1], lon=tiepoint[3], lat=tiepoint[4];
    var sx=pixelScale[0], sy=pixelScale[1];
    var w=getTag(ifd,256)[0], h=getTag(ifd,257)[0];
    var west=lon-px*sx, north=lat+py*sy, east=west+w*sx, south=north-h*sy;
    console.log('Bounds:', south.toFixed(6), west.toFixed(6), north.toFixed(6), east.toFixed(6), 'W/H:', w, h);
    return L.latLngBounds([south,west],[north,east]);
  }

  window.TiffLayer = L.Layer.extend({

    initialize: function(arrayBuffer, options) {
      this._buffer        = arrayBuffer;
      this._options       = options || {};
      this._canvas        = null;
      this._offscreen     = null;
      this._rendering     = false;
      this._pendingRender = false;
      this._bounds        = null;
      this._srcCanvas     = null;
    },

    onAdd: function(map) {
		this._map = map;
		this._canvas = document.createElement('canvas');
		this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
		(map.getPane('cartePane') || map.getPanes().mapPane).appendChild(this._canvas);
		this._offscreen = document.createElement('canvas');
		this._zooming = false;

		map.on('move',            this._onMove,        this);
		map.on('moveend zoomend', this._scheduleRender, this);
		map.on('zoomstart',       this._onZoomStart,    this);
		map.on('zoomend',         this._onZoomEnd,      this);

		var self = this;
		setTimeout(function() { self._loadTiff(); }, 0);
		return this;
	},

	onRemove: function(map) {
		if (this._canvas && this._canvas.parentNode)
			this._canvas.parentNode.removeChild(this._canvas);
		map.off('move',            this._onMove,        this);
		map.off('moveend zoomend', this._scheduleRender, this);
		map.off('zoomstart',       this._onZoomStart,    this);
		map.off('zoomend',         this._onZoomEnd,      this);
	},

    _loadTiff: function() {
      var self = this;
      try {
        var ifds = UTIF.decode(self._buffer);
        if (!ifds || !ifds.length) throw new Error('Aucun IFD dans le TIFF');

        // Stocker tous les IFDs (overview 0=pleine res, 1,2,3...= réductions)
        self._ifds   = ifds;
        self._buffer2 = self._buffer;

        // Décoder uniquement l'overview la plus petite pour init rapide
        var initIdx = ifds.length > 3 ? ifds.length - 2 : 0;
        var ifd = ifds[initIdx];
        UTIF.decodeImage(self._buffer, ifd, ifds);
        var rgba = UTIF.toRGBA8(ifd);

        var w = ifd.width, h = ifd.height;
        if (!w || !h)   throw new Error('Dimensions invalides: ' + w + 'x' + h);
        if (!rgba || !rgba.length) throw new Error('Pixels vides');

        var src = document.createElement('canvas');
        src.width = w; src.height = h;
        var ctx = src.getContext('2d');
        var imgData = ctx.createImageData(w, h);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);
        self._srcCanvas    = src;
        self._srcLevel     = initIdx;
        self._srcFullW     = ifds[0].width;

        // Bounds — toujours depuis l'IFD principal (index 0)
        var bounds = getBoundsFromTags(ifds[0]);
        if (!bounds) throw new Error('Géoréférencement introuvable');
        self._bounds = bounds;

        if (self._map) {
          // fitBounds puis render après que Leaflet a repositionné la vue
          // on écoute moveend UNE fois, avec fallback setTimeout
          var rendered = false;
          function doRender() {
            if (rendered) return;
            rendered = true;
            console.log('doRender appelé, map zoom:', self._map ? self._map.getZoom() : 'null');
            self._render();
            console.log('canvas apres render:', self._canvas ? self._canvas.width + 'x' + self._canvas.height : 'null');
            if (self._options.onReady) self._options.onReady();
          }
          self._map.once('moveend', doRender);
          setTimeout(doRender, 500); // fallback si moveend ne se déclenche pas
          if (!self._options.keepView) self._map.fitBounds(bounds); // v3 : keepView garde la vue (ex. centrée GPS)
        }

      } catch(err) {
        console.error('TiffLayer._loadTiff:', err);
        var fn = self._options.onError || window._onTiffError;
        if (fn) fn(err.message);
      }
    },

    _onMove: function() {
		if (!this._canvas || !this._map || !this._bounds || !this._lastRenderPxW) return;
		if (this._zooming) return;
		var map = this._map;
		var tl  = map.latLngToLayerPoint(this._bounds.getNorthWest());
		L.DomUtil.setPosition(this._canvas, tl);
	},

    _onZoomStart: function() { this._zooming = true; },
	_onZoomEnd:   function() { this._zooming = false; },
	_onZoomAnim:  function() {},

    _scheduleRender: function() {
      if (!this._srcCanvas) return;
      if (this._rendering) { this._pendingRender = true; return; }
      this._render();
    },

    _render: function() {
      if (!this._srcCanvas || !this._srcCanvas.width || !this._srcCanvas.height) return;
      if (!this._bounds || !this._map) return;
      if (this._rendering) { this._pendingRender = true; return; }
      this._rendering = true;

      var map = this._map;
      var tl  = map.latLngToLayerPoint(this._bounds.getNorthWest());
      var br  = map.latLngToLayerPoint(this._bounds.getSouthEast());
      var pxW = Math.max(1, Math.round(Math.abs(br.x - tl.x)));
      var pxH = Math.max(1, Math.round(Math.abs(br.y - tl.y)));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Choisir le niveau d'overview optimal pour la résolution d'affichage
      var self     = this;
      var ifds     = this._ifds;
      var neededW  = pxW * dpr;
      var bestIdx  = 0;
      if (ifds && ifds.length > 1) {
        for (var i = ifds.length - 1; i >= 0; i--) {
          if (ifds[i].width >= neededW * 0.9) { bestIdx = i; break; }
        }
      }
      // Recharger le canvas source si le niveau change
      if (ifds && bestIdx !== this._srcLevel) {
        var ifd2 = ifds[bestIdx];
        UTIF.decodeImage(this._buffer2, ifd2, ifds);
        var rgba2 = UTIF.toRGBA8(ifd2);
        if (rgba2 && rgba2.length) {
          var src2 = document.createElement('canvas');
          src2.width = ifd2.width; src2.height = ifd2.height;
          var ctx2 = src2.getContext('2d');
          var id2  = ctx2.createImageData(ifd2.width, ifd2.height);
          id2.data.set(rgba2);
          ctx2.putImageData(id2, 0, 0);
          this._srcCanvas = src2;
          this._srcLevel  = bestIdx;
        }
      }

      // Limite WebKit iOS : max 4096px par dimension
      // Downscale proportionnel pour garder les proportions
      var maxDim = 4096;
      var canW = pxW * dpr;
      var canH = pxH * dpr;
      if (canW > maxDim || canH > maxDim) {
        var ratio = Math.min(maxDim / canW, maxDim / canH);
        canW = Math.floor(canW * ratio);
        canH = Math.floor(canH * ratio);
      }
      canW = Math.max(1, canW);
      canH = Math.max(1, canH);

      var off = this._offscreen;
      off.width  = canW;
      off.height = canH;
      try {
        off.getContext('2d').drawImage(this._srcCanvas, 0, 0, canW, canH);
      } catch(e) {
        this._rendering = false;
        return;
      }

      var vis = this._canvas;
      vis.width  = canW;
      vis.height = canH;
      vis.style.width  = pxW + 'px';
      vis.style.height = pxH + 'px';
      // Réinitialiser le scale CSS après re-rasterisation
      vis.style.transition      = 'none';
      vis.style.transform       = '';
      vis.style.transformOrigin = '';
      vis.getContext('2d').drawImage(off, 0, 0);
      L.DomUtil.setPosition(this._canvas, tl);

      this._lastRenderPxW  = pxW;
      this._lastRenderPxH  = pxH;
      this._lastRenderTL   = tl;
      this._lastRenderZoom = map.getZoom();

      this._rendering = false;
      if (this._pendingRender) { this._pendingRender = false; this._render(); }
    }
  });

  window.createTiffLayer = function(ab, opts) {
    // Aiguillage : GeoPDF → PdfLayer, sinon GeoTIFF → TiffLayer
    if (window.isPdfBuffer && window.isPdfBuffer(ab)) return new window.PdfLayer(ab, opts);
    return new window.TiffLayer(ab, opts);
  };

})();

// PdfLayer — GeoPDF (ISO 32000 : /VP + /Measure /GEO) rendu vectoriel via pdf.js
(function() {

  // ── Chargement paresseux de pdf.js (auto-hébergé dans lib/, mis en cache par le SW) ──
  var _pdfjsPromise = null;
  function loadPdfJs() {
    if (!_pdfjsPromise) {
      var base = document.baseURI;
      _pdfjsPromise = import(new URL('lib/pdf.min.mjs', base).href).then(function(m) {
        m.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', base).href;
        return m;
      }).catch(function(e) { _pdfjsPromise = null; throw e; });
    }
    return _pdfjsPromise;
  }

  function isPdfBuffer(ab) {
    var n = Math.min(1024, ab.byteLength), u = new Uint8Array(ab, 0, n);
    for (var i = 0; i < n - 4; i++) {
      if (u[i] === 0x25 && u[i+1] === 0x50 && u[i+2] === 0x44 && u[i+3] === 0x46) return true; // %PDF
    }
    return false;
  }

  // ── Mini-lecteur de syntaxe PDF (juste ce qu'il faut pour le géoréférencement) ──
  function nums(s) {
    return (String(s || '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
  }
  function skipWs(t, i) {
    while (i < t.length) {
      var c = t.charCodeAt(i);
      if (c === 37) { while (i < t.length && t[i] !== '\n' && t[i] !== '\r') i++; continue; } // commentaire %
      if (c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0) { i++; continue; }
      break;
    }
    return i;
  }
  // Retourne la valeur composée [..] ou <<..>> qui commence à i (chaînes (..) gérées)
  function readComposite(t, i) {
    var depth = 0, start = i;
    while (i < t.length) {
      var ch = t[i];
      if (ch === '(') { // chaîne littérale
        var d = 1; i++;
        while (i < t.length && d > 0) { if (t[i] === '\\') i++; else if (t[i] === '(') d++; else if (t[i] === ')') d--; i++; }
        continue;
      }
      if (ch === '<' && t[i+1] === '<') { depth++; i += 2; continue; }
      if (ch === '>' && t[i+1] === '>') { depth--; i += 2; if (depth === 0) return t.slice(start, i); continue; }
      if (ch === '[') { depth++; i++; continue; }
      if (ch === ']') { depth--; i++; if (depth === 0) return t.slice(start, i); continue; }
      i++;
    }
    return null;
  }
  // Lit une valeur à la position i ; résout les références indirectes "N G R"
  function valueAt(t, i, resolve, hops) {
    i = skipWs(t, i);
    var ch = t[i];
    if (ch === '[' || (ch === '<' && t[i+1] === '<')) return readComposite(t, i);
    var ref = /^(\d+)\s+(\d+)\s+R(?![A-Za-z])/.exec(t.slice(i, i + 40));
    if (ref) {
      if ((hops || 0) > 8) return null;
      var body = resolve(+ref[1], +ref[2]);
      return body == null ? null : valueAt(body, 0, resolve, (hops || 0) + 1);
    }
    var tok = /^[^\s\/\[\]<>()]+|^\/[^\s\/\[\]<>()]*/.exec(t.slice(i, i + 200));
    return tok ? tok[0] : null;
  }
  // Valeur d'une clé de premier niveau d'un dictionnaire <<...>>
  function dictGet(dict, key, resolve) {
    if (!dict) return null;
    var depth = 0, i = 0;
    while (i < dict.length) {
      var ch = dict[i];
      if (ch === '(') { var d = 1; i++; while (i < dict.length && d > 0) { if (dict[i] === '\\') i++; else if (dict[i] === '(') d++; else if (dict[i] === ')') d--; i++; } continue; }
      if (ch === '<' && dict[i+1] === '<') { depth++; i += 2; continue; }
      if (ch === '>' && dict[i+1] === '>') { depth--; i += 2; continue; }
      if (ch === '[') { depth++; i++; continue; }
      if (ch === ']') { depth--; i++; continue; }
      if (ch === '/' && depth === 1) {
        var m = /^\/([^\s\/\[\]<>()]+)/.exec(dict.slice(i, i + 64));
        if (!m) { i++; continue; }
        if (m[1] === key) return valueAt(dict, i + m[0].length, resolve);
        // saute la valeur de cette clé (un nom-valeur comme /GEO ne doit pas être lu comme une clé)
        i = skipWs(dict, i + m[0].length);
        if (dict[i] === '[' || (dict[i] === '<' && dict[i+1] === '<')) {
          var comp = readComposite(dict, i); i += comp ? comp.length : 1;
        } else {
          var r = /^\d+\s+\d+\s+R(?![A-Za-z])/.exec(dict.slice(i, i + 40))
               || /^\/[^\s\/\[\]<>()]*|^[^\s\/\[\]<>()]+/.exec(dict.slice(i, i + 200));
          i += r ? r[0].length : 1;
        }
        continue;
      }
      i++;
    }
    return null;
  }
  // Éléments d'un tableau [ ... ] (dictionnaires ou références résolues)
  function arrayItems(arr, resolve) {
    var out = [], i = 1;
    while (i < arr.length - 1) {
      i = skipWs(arr, i);
      if (arr[i] === '<' && arr[i+1] === '<') { var d = readComposite(arr, i); if (!d) break; out.push(d); i += d.length; continue; }
      var ref = /^(\d+)\s+(\d+)\s+R/.exec(arr.slice(i, i + 40));
      if (ref) { var v = valueAt(arr, i, resolve); if (v) out.push(v); i += ref[0].length; continue; }
      i++;
    }
    return out;
  }

  function makeResolver(text, extra) {
    var cache = {};
    return function(num, gen) {
      var k = num + '_' + gen;
      if (k in cache) return cache[k];
      var re = new RegExp('(?:^|[^0-9])' + num + '\\s+' + gen + '\\s+obj(?![A-Za-z])', 'g'), m, last = null;
      while ((m = re.exec(text))) last = m;      // dernière occurrence = mise à jour incrémentale la plus récente
      var body = null;
      if (last) {
        var s = last.index + last[0].length, e = text.indexOf('endobj', s);
        body = text.slice(s, e < 0 ? s + 65536 : e);
      } else if (extra && extra[num] != null) {
        body = extra[num];
      }
      cache[k] = body;
      return body;
    };
  }

  async function inflate(u8) {
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Décompresse les flux d'objets (/ObjStm) — PDF « compactés » (Adobe, qpdf, etc.)
  async function expandObjStms(bytes, text, resolve) {
    var objs = {}, texts = [], re = /\/Type\s*\/ObjStm/g, m, dec = new TextDecoder('latin1');
    while ((m = re.exec(text))) {
      try {
        var objKw = text.lastIndexOf('obj', m.index);
        var dStart = text.indexOf('<<', objKw);
        var dict = readComposite(text, dStart);
        if (!dict || !/\/FlateDecode/.test(dict)) continue;
        var sIdx = text.indexOf('stream', dStart + dict.length);
        var ds = sIdx + 6;
        if (text[ds] === '\r') ds++;
        if (text[ds] === '\n') ds++;
        var len = nums(dictGet(dict, 'Length', resolve))[0];
        var end;
        if (len > 0) end = ds + len;
        else { end = text.indexOf('endstream', ds); while (end > ds && (text[end-1] === '\n' || text[end-1] === '\r')) end--; }
        var s = dec.decode(await inflate(bytes.subarray(ds, end)));
        var N = nums(dictGet(dict, 'N', resolve))[0] | 0, first = nums(dictGet(dict, 'First', resolve))[0] | 0;
        var hdr = nums(s.slice(0, first));
        for (var k = 0; k < N; k++) {
          var on = hdr[2*k], off = hdr[2*k+1], nxt = (k + 1 < N) ? hdr[2*k+3] : s.length - first;
          objs[on] = s.slice(first + off, first + nxt);
        }
        texts.push(s.slice(first));
      } catch (err) { console.warn('ObjStm illisible (ignoré):', err); }
    }
    return { objs: objs, texts: texts };
  }

  function findViewports(text, resolve) {
    var out = [], re = /\/VP(?![A-Za-z0-9])/g, m;
    while ((m = re.exec(text))) {
      var arr = valueAt(text, m.index + 3, resolve);
      if (!arr || arr[0] !== '[') continue;
      arrayItems(arr, resolve).forEach(function(vp) {
        if (vp.slice(0, 2) !== '<<') return;
        var bbox = nums(dictGet(vp, 'BBox', resolve));
        var meas = dictGet(vp, 'Measure', resolve);
        if (bbox.length !== 4 || !meas || meas.slice(0, 2) !== '<<') return;
        var sub = dictGet(meas, 'Subtype', resolve);
        if (sub && sub !== '/GEO') return;
        var gpts = nums(dictGet(meas, 'GPTS', resolve));
        var lpts = nums(dictGet(meas, 'LPTS', resolve));
        if (gpts.length < 6 || gpts.length % 2 || lpts.length !== gpts.length) return;
        out.push({ bbox: bbox, gpts: gpts, lpts: lpts,
                   area: Math.abs((bbox[2]-bbox[0]) * (bbox[3]-bbox[1])) });
      });
    }
    return out;
  }

  // Extrait le géoréférencement : retourne {pdfPts:[[x,y]], geoPts:[[lat,lon]], vpCount}
  async function parseGeoPdf(ab) {
    var bytes = new Uint8Array(ab);
    var text = new TextDecoder('latin1').decode(bytes);
    var resolve = makeResolver(text, null);
    var vps = findViewports(text, resolve);
    if (!vps.length && /\/ObjStm/.test(text)) {
      if (typeof DecompressionStream === 'undefined')
        throw new Error('Ce PDF est compressé et ce navigateur ne sait pas le lire (iOS 16.4+ requis)');
      var ex = await expandObjStms(bytes, text, resolve);
      resolve = makeResolver(text, ex.objs);
      vps = findViewports(ex.texts.join('\n') + '\n' + text, resolve);
    }
    if (!vps.length) {
      if (/\/LGIDict/.test(text))
        throw new Error('GeoPDF au format OGC/TerraGo non pris en charge — réexportez-le depuis QGIS (PDF géospatial)');
      throw new Error('Ce PDF n\'est pas géoréférencé (aucun /VP /Measure trouvé)');
    }
    vps.sort(function(a, b) { return b.area - a.area; }); // le plus grand cadre = la carte principale
    var v = vps[0], x0 = Math.min(v.bbox[0], v.bbox[2]), y0 = Math.min(v.bbox[1], v.bbox[3]);
    var bw = Math.abs(v.bbox[2] - v.bbox[0]), bh = Math.abs(v.bbox[3] - v.bbox[1]);
    var pdfPts = [], geoPts = [];
    for (var i = 0; i < v.gpts.length; i += 2) {
      pdfPts.push([x0 + v.lpts[i] * bw, y0 + v.lpts[i+1] * bh]);
      geoPts.push([v.gpts[i], v.gpts[i+1]]); // GPTS = latitude, longitude
    }
    return { pdfPts: pdfPts, geoPts: geoPts, bbox: [x0, y0, x0 + bw, y0 + bh], vpCount: vps.length };
  }

  // ── Transformation affine PDF (points) → pixels Web Mercator au zoom 0 (moindres carrés) ──
  function solve3(M, r) {
    var a = M.map(function(row, i) { return row.concat([r[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c;
      for (var j = c + 1; j < 3; j++) if (Math.abs(a[j][c]) > Math.abs(a[p][c])) p = j;
      var tmp = a[c]; a[c] = a[p]; a[p] = tmp;
      if (Math.abs(a[c][c]) < 1e-18) throw new Error('Points de géoréférencement dégénérés');
      for (var j2 = 0; j2 < 3; j2++) {
        if (j2 === c) continue;
        var f = a[j2][c] / a[c][c];
        for (var k = c; k < 4; k++) a[j2][k] -= f * a[c][k];
      }
    }
    return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
  }
  function fitAffine(src, dst) {
    var n = src.length, sx = 0, sy = 0, dx = 0, dy = 0, i;
    for (i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
    sx /= n; sy /= n; dx /= n; dy /= n;
    var xx = 0, xy = 0, yy = 0, xu = 0, yu = 0, xv = 0, yv = 0;
    for (i = 0; i < n; i++) {
      var x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
      xx += x*x; xy += x*y; yy += y*y; xu += x*u; yu += y*u; xv += x*v; yv += y*v;
    }
    var M = [[xx, xy, 0], [xy, yy, 0], [0, 0, 1]];
    var pu = solve3(M, [xu, yu, 0]), pv = solve3(M, [xv, yv, 0]);
    var a = pu[0], b = pu[1], d = pv[0], e = pv[1];
    return [a, b, dx - a*sx - b*sy, d, e, dy - d*sx - e*sy];
  }
  function applyA(A, x, y) { return [A[0]*x + A[1]*y + A[2], A[3]*x + A[4]*y + A[5]]; }
  // Composition de matrices canvas [a,b,c,d,e,f] : résultat = M1 ∘ M2 (M2 appliquée d'abord)
  function mul(m1, m2) {
    return [m1[0]*m2[0] + m1[2]*m2[1], m1[1]*m2[0] + m1[3]*m2[1],
            m1[0]*m2[2] + m1[2]*m2[3], m1[1]*m2[2] + m1[3]*m2[3],
            m1[0]*m2[4] + m1[2]*m2[5] + m1[4], m1[1]*m2[4] + m1[3]*m2[5] + m1[5]];
  }
  function inv(m) {
    var det = m[0]*m[3] - m[1]*m[2];
    return [m[3]/det, -m[1]/det, -m[2]/det, m[0]/det,
            (m[2]*m[5] - m[3]*m[4])/det, (m[1]*m[4] - m[0]*m[5])/det];
  }

  var MARGIN = 0.15;      // marge de rendu autour de l'écran (fraction)
  var MAX_AREA = 8e6;     // pixels max d'un canvas (plafond mémoire iOS)
  var BASE_MAX_AREA = 4e6;

  window.PdfLayer = L.Layer.extend({

    initialize: function(arrayBuffer, options) {
      this._ab = arrayBuffer;
      this._options = options || {};
      this._token = 0;
    },

    onAdd: function(map) {
      this._map = map;
      var c = this._canvas = document.createElement('canvas');
      c.className = 'leaflet-zoom-animated';
      c.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
      (map.getPane('cartePane') || map.getPane('tilePane')).appendChild(c);
      this._hi = document.createElement('canvas');
      map.on('moveend resize', this._schedule, this);
      map.on('zoomanim', this._animateZoom, this);
      map.on('zoom viewreset', this._resetPos, this);
      this._load();
      return this;
    },

    onRemove: function(map) {
      this._destroyed = true;
      clearTimeout(this._timer);
      if (this._task) { try { this._task.cancel(); } catch (e) {} }
      map.off('moveend resize', this._schedule, this);
      map.off('zoomanim', this._animateZoom, this);
      map.off('zoom viewreset', this._resetPos, this);
      if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
      // Libère la mémoire canvas (iOS la récupère mal sinon)
      [this._canvas, this._hi, this._base].forEach(function(cv) { if (cv) { cv.width = 0; cv.height = 0; } });
      if (this._doc) { try { this._doc.destroy(); } catch (e) {} }
      this._doc = this._page = null;
    },

    getBounds: function() { return this._bounds; },

    _load: async function() {
      var self = this;
      try {
        var geo = await parseGeoPdf(self._ab);
        var pdfjs = await loadPdfJs();
        var data = new Uint8Array(self._ab.slice(0)); // pdf.js transfère le tampon au worker
        self._ab = null;
        var doc = await pdfjs.getDocument({ data: data, isEvalSupported: false }).promise;
        if (self._destroyed) { doc.destroy(); return; }
        var page = await doc.getPage(1);
        self._doc = doc; self._page = page;

        // Affine PDF → pixels zoom 0 (EPSG:3857), à partir des points de contrôle
        var crs = L.CRS.EPSG3857;
        var dst = geo.geoPts.map(function(g) { var p = crs.latLngToPoint(L.latLng(g[0], g[1]), 0); return [p.x, p.y]; });
        self._A = fitAffine(geo.pdfPts, dst);
        var rms = 0, lat0 = geo.geoPts[0][0];
        geo.pdfPts.forEach(function(p, i) {
          var q = applyA(self._A, p[0], p[1]);
          rms += Math.pow(q[0] - dst[i][0], 2) + Math.pow(q[1] - dst[i][1], 2);
        });
        rms = Math.sqrt(rms / geo.pdfPts.length) * (40075016.686 / 256) * Math.cos(lat0 * Math.PI / 180);
        console.log('GeoPDF : ' + geo.pdfPts.length + ' points de contrôle, résidu RMS ≈ ' + rms.toFixed(2) + ' m, cadres : ' + geo.vpCount + ', pages : ' + doc.numPages);

        var b = geo.bbox, corners = [[b[0], b[1]], [b[0], b[3]], [b[2], b[3]], [b[2], b[1]]];
        self._bounds = L.latLngBounds(corners.map(function(p) {
          var q = applyA(self._A, p[0], p[1]); return crs.pointToLatLng(L.point(q[0], q[1]), 0);
        }));

        // Aperçu basse résolution de la page entière (affiché instantanément pendant les zooms)
        var vp1 = page.getViewport({ scale: 1 });
        self._V1inv = inv(vp1.transform);
        self._pageBox = page.view; // [x0,y0,x1,y1] en points PDF
        var sb = Math.min(Math.sqrt(BASE_MAX_AREA / (vp1.width * vp1.height)), 4096 / Math.max(vp1.width, vp1.height));
        var vpb = page.getViewport({ scale: sb });
        var base = document.createElement('canvas');
        base.width = Math.floor(vpb.width); base.height = Math.floor(vpb.height);
        await page.render({ canvasContext: base.getContext('2d'), viewport: vpb }).promise;
        if (self._destroyed) return;
        self._base = base; self._baseScale = sb; self._VbInv = inv(vpb.transform);

        if (self._map) {
          var done = false;
          var ready = function() {
            if (done) return; done = true;
            self._render();
            if (self._options.onReady) self._options.onReady();
            if (rms > 15) toast('⚠ Géoréférencement approximatif (≈' + Math.round(rms) + ' m)', 4000);
          };
          self._map.once('moveend', ready);
          setTimeout(ready, 500);
          if (!self._options.keepView) self._map.fitBounds(self._bounds); // v3 : keepView
        }
      } catch (err) {
        console.error('PdfLayer._load:', err);
        var fn = self._options.onError || window._onTiffError;
        if (fn) fn(err && err.message ? err.message : String(err));
      }
    },

    _schedule: function() {
      var self = this;
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { self._render(); }, 80);
    },

    _geometry: function() {
      var map = this._map, size = map.getSize(), z = map.getZoom();
      var m = Math.round(Math.max(size.x, size.y) * MARGIN);
      var pb = map.getPixelBounds();
      var ox = pb.min.x - m, oy = pb.min.y - m, W = size.x + 2*m, H = size.y + 2*m;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (W * H * dpr * dpr > MAX_AREA) dpr = Math.sqrt(MAX_AREA / (W * H));
      var k = map.options.crs.scale(z) / map.options.crs.scale(0), s = dpr * k, A = this._A;
      return {
        z: z, ox: ox, oy: oy, W: W, H: H, dpr: dpr,
        cw: Math.round(W * dpr), ch: Math.round(H * dpr),
        // PDF (points) → pixels du canvas
        T: [s*A[0], s*A[3], s*A[1], s*A[4], dpr*(k*A[2] - ox), dpr*(k*A[5] - oy)],
        pxPerPt: s * Math.sqrt(Math.abs(A[0]*A[4] - A[1]*A[3]))
      };
    },

    _place: function(g) {
      var map = this._map, c = this._canvas;
      if (c.width !== g.cw) c.width = g.cw;
      if (c.height !== g.ch) c.height = g.ch;
      c.style.width = g.W + 'px'; c.style.height = g.H + 'px';
      L.DomUtil.setPosition(c, L.point(g.ox, g.oy).subtract(map.getPixelOrigin()));
      this._rs = { nw: map.unproject([g.ox, g.oy], g.z), se: map.unproject([g.ox + g.W, g.oy + g.H], g.z), z: g.z };
    },

    _fillPage: function(ctx, T) {
      var v = this._pageBox;
      ctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(v[0], v[1], v[2] - v[0], v[3] - v[1]);
    },

    _drawBase: function(ctx, T) {
      var M = mul(T, this._VbInv);
      ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this._base, 0, 0);
    },

    _render: function() {
      if (!this._page || !this._map || !this._base || this._destroyed) return;
      var map = this._map; if (!map.getSize().x) return;
      var self = this, g = this._geometry(), token = ++this._token;
      var zoomChanged = !this._rs || this._rs.z !== g.z;
      var needHi = g.pxPerPt > this._baseScale * 1.05;

      // 1) Aperçu immédiat (si zoom changé, ou si l'aperçu suffit à ce niveau)
      if (zoomChanged || !needHi) {
        this._place(g);
        var ctx = this._canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, g.cw, g.ch);
        this._drawBase(ctx, g.T);
      }
      if (this._task) { try { this._task.cancel(); } catch (e) {} this._task = null; }
      if (!needHi) return;

      // 2) Rendu vectoriel net de la zone visible
      var hi = this._hi;
      hi.width = g.cw; hi.height = g.ch;
      var hctx = hi.getContext('2d');
      this._fillPage(hctx, g.T);
      hctx.setTransform(1, 0, 0, 1, 0, 0);
      var vp = this._page.getViewport({ scale: 1 });
      var task = this._task = this._page.render({
        canvasContext: hctx, viewport: vp,
        transform: mul(g.T, this._V1inv),
        background: 'rgba(0,0,0,0)'
      });
      task.promise.then(function() {
        if (token !== self._token || self._destroyed) return;
        self._task = null;
        self._place(g);
        var ctx2 = self._canvas.getContext('2d');
        ctx2.setTransform(1, 0, 0, 1, 0, 0);
        ctx2.clearRect(0, 0, g.cw, g.ch);
        ctx2.drawImage(hi, 0, 0);
      }).catch(function(e) {
        if (!e || e.name !== 'RenderingCancelledException') console.warn('PdfLayer render:', e);
      });
    },

    _animateZoom: function(e) {
      if (!this._rs) return;
      var scale = this._map.getZoomScale(e.zoom, this._rs.z);
      var offset = this._map._latLngBoundsToNewLayerBounds(L.latLngBounds(this._rs.nw, this._rs.se), e.zoom, e.center).min;
      L.DomUtil.setTransform(this._canvas, offset, scale);
    },

    _resetPos: function() {
      if (!this._rs || !this._map) return;
      var scale = this._map.getZoomScale(this._map.getZoom(), this._rs.z);
      L.DomUtil.setTransform(this._canvas, this._map.latLngToLayerPoint(this._rs.nw), scale);
    }
  });

  window.isPdfBuffer = isPdfBuffer;
  window.parseGeoPdf = parseGeoPdf;
  window.loadPdfJs = loadPdfJs;
})();


// ── Emprise d'une carte, sans rendu (v3) ──
// Retourne { kind:'pdf'|'tiff'|'tuiles', footprint:[[lat,lon]×4], bbox:[ouest,sud,est,nord] }
(function() {
  function fromCorners(c) {
    var lats = c.map(function(p) { return p[0]; }), lons = c.map(function(p) { return p[1]; });
    return { footprint: c, bbox: [Math.min.apply(null, lons), Math.min.apply(null, lats), Math.max.apply(null, lons), Math.max.apply(null, lats)] };
  }
  function carteKind(ab) {
    var u8 = new Uint8Array(ab, 0, Math.min(8, ab.byteLength));
    if (window.NVPmtiles && window.NVPmtiles.isPmtiles(u8)) return 'tuiles';
    if (window.isPdfBuffer(ab)) return 'pdf';
    var u = new Uint8Array(ab, 0, Math.min(4, ab.byteLength));
    if ((u[0] === 0x49 && u[1] === 0x49 && u[2] === 0x2A) || (u[0] === 0x4D && u[1] === 0x4D && u[3] === 0x2A)) return 'tiff';
    return null;
  }
  async function carteFootprint(blob) {
    // Mosaïque en tuiles : seul l'en-tête est lu (le fichier peut faire des centaines de Mo)
    var head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (window.NVPmtiles && window.NVPmtiles.isPmtiles(head)) {
      var h = (await window.NVPmtiles.info(blob)).header;
      var r0 = fromCorners([[h.maxLat, h.minLon], [h.maxLat, h.maxLon], [h.minLat, h.maxLon], [h.minLat, h.minLon]]);
      r0.kind = 'tuiles'; return r0;
    }
    var ab = await blob.arrayBuffer();
    var kind = carteKind(ab);
    if (kind === 'pdf') {
      var g = await window.parseGeoPdf(ab);
      var pts = g.geoPts; // [lat, lon]
      if (pts.length !== 4) {
        var b = fromCorners(pts).bbox;
        pts = [[b[3], b[0]], [b[3], b[2]], [b[1], b[2]], [b[1], b[0]]];
      }
      var r = fromCorners(pts); r.kind = 'pdf'; return r;
    }
    if (kind === 'tiff') {
      var ifd = UTIF.decode(ab)[0];
      var tie = ifd.t33922, sc = ifd.t33550;
      if (!tie || !sc) throw new Error('GeoTIFF sans géoréférencement (tags 33922/33550)');
      var w = ifd.t256[0], h = ifd.t257[0];
      var west = tie[3] - tie[0] * sc[0], north = tie[4] + tie[1] * sc[1];
      var east = west + w * sc[0], south = north - h * sc[1];
      var t = fromCorners([[north, west], [north, east], [south, east], [south, west]]); t.kind = 'tiff'; return t;
    }
    throw new Error('Format de carte non reconnu');
  }
  window.carteKind = carteKind;
  window.carteFootprint = carteFootprint;
})();
