/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* base.js — the WB namespace and the small helpers everything else uses:
 * numbers, paths into objects, ids, an offscreen canvas pool, the mm↔pixel
 * grid and the coverage masks the decoration pipeline works on. */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  var uid = 0;
  WB.newId = function (p) { return p + (Date.now().toString(36)) + (uid++).toString(36); };

  /* Rounds away floating-point dust (0.6000000001 → 0.6), so values that
     should match compare equal and print cleanly. */
  WB.tidy = function (v) { return Math.round(v * 1e6) / 1e6; };

  /* ── tiny helpers ───────────────────────────────────────────────── */
  WB.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  WB.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ── checking what a file, a link or storage hands back ─────────────
     A design can come from anyone (a shared link, a file), so before it is
     used: colours must be plain hex colours (they end up in CSS, where
     anything else could fetch from elsewhere), pictures must be inline image
     data (so loading one never contacts another site), and numbers stay
     inside the limits their fields allow. */
  var HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  WB.isColour = function (v) { return typeof v === 'string' && HEX.test(v); };
  WB.isImageData = function (v) {
    return typeof v === 'string' && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/.test(v);
  };
  /* Every string under a key that names a colour (color, colour, base/lid
     inside `colors`, …) that isn't a hex colour goes back to the default at
     the same place, or a neutral grey. */
  WB.cleanColours = function (obj, defaults) {
    (function walk(o, d, inColours) {
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        var v = o[k], dv = d && typeof d === 'object' ? d[k] : undefined;
        var named = /colou?rs?$/i.test(k) || inColours;
        if (typeof v === 'string' && named && !WB.isColour(v)) o[k] = WB.isColour(dv) ? dv : '#808080';
        else if (v && typeof v === 'object') walk(v, Array.isArray(v) ? null : dv, /^colou?rs$|^palette$/i.test(k));
      });
    })(obj, defaults, false);
    return obj;
  };
  /* The limits of every bound number field: [{ path, min, max }], skipping
     fields whose limits follow the design (data-range, or an id in `skip`);
     the app keeps those in range itself. */
  WB.fieldLimits = function (root, skip) {
    var out = [], seen = {};
    var sel = 'input[type=number][data-bind], input[type=range][data-bind], input[type=number][data-numfor]';
    Array.prototype.forEach.call((root || document).querySelectorAll(sel), function (el) {
      var p = el.dataset.bind || el.dataset.numfor;
      if (seen[p] || el.dataset.range != null || (skip && skip.indexOf(el.id) >= 0) || el.min === '' || el.max === '') return;
      var lo = parseFloat(el.min), hi = parseFloat(el.max), k = +el.dataset.scale || 1;
      if (!isFinite(lo) || !isFinite(hi)) return;
      seen[p] = true;
      out.push({ path: p, min: lo / k, max: hi / k });
    });
    return out;
  };
  /* o[key] kept a finite number within [min, max]; anything else becomes
     the fallback (which may be null, "automatic"), if one is given. Nulls
     themselves are left alone. */
  WB.clampField = function (o, key, min, max, fallback) {
    if (!o || typeof o !== 'object' || !(key in o) || o[key] === null) return;
    var v = o[key];
    if (typeof v !== 'number' || !isFinite(v)) { if (fallback !== undefined) o[key] = fallback; return; }
    o[key] = v < min ? min : v > max ? max : v;
  };

  /* ── snapping a dragged box to its neighbours ───────────────────── */
  /* lines: { x: [...], y: [...] }, the positions a box's edges or centre can
     land on; an entry { v, centre: true } takes the centre only. Returns the
     shift that lands the nearest of the box's edges or centre on a line
     within tol, per axis, and whether that axis snapped. */
  function snapAxis(a0, a1, list, tol) {
    var best = null, own = [a0, (a0 + a1) / 2, a1];
    (list || []).forEach(function (l) {
      var v = typeof l === 'number' ? l : l.v;
      own.forEach(function (o, i) {
        if (typeof l !== 'number' && l.centre && i !== 1) return;
        var d = v - o;
        if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      });
    });
    return best;
  }
  WB.snapBox = function (box, lines, tol) {
    var hx = snapAxis(box.x0, box.x1, lines.x, tol), hy = snapAxis(box.y0, box.y1, lines.y, tol);
    return { dx: hx || 0, dy: hy || 0, x: hx !== null, y: hy !== null };
  };
  /* The lines a box's edges or centre sit on, to draw as guides. */
  WB.boxGuides = function (box, lines, eps) {
    eps = eps || 1e-3;
    var pick = function (a0, a1, list) {
      var out = [];
      (list || []).forEach(function (l) {
        var v = typeof l === 'number' ? l : l.v, c = typeof l !== 'number' && l.centre;
        var hit = Math.abs(v - (a0 + a1) / 2) <= eps || (!c && (Math.abs(v - a0) <= eps || Math.abs(v - a1) <= eps));
        if (hit && !out.some(function (o) { return Math.abs(o - v) <= eps; })) out.push(v);
      });
      return out;
    };
    return { x: pick(box.x0, box.x1, lines.x), y: pick(box.y0, box.y1, lines.y) };
  };

  WB.get = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  };
  WB.set = function (obj, path, val) {
    var ks = path.split('.'), last = ks.pop();
    var o = ks.reduce(function (o, k) { return o[k]; }, obj);
    o[last] = val;
  };

  /* fn after `ms` of quiet; .now() runs it at once (dropping any wait), for
     when there is nothing to wait for, such as the first build. */
  WB.debounce = function (fn, ms) {
    var t = 0;
    var d = function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
    d.now = function () { clearTimeout(t); return fn.apply(this, arguments); };
    return d;
  };

  WB.hexToRgb = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };

  /* Reusable offscreen canvas pool — avoids reallocating big buffers on every
     keystroke while the user drags a slider. */
  var pool = {};
  WB.scratch = function (key, w, h) {
    var c = pool[key];
    if (!c) { c = pool[key] = document.createElement('canvas'); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    else { c.getContext('2d').clearRect(0, 0, w, h); }
    return c;
  };

  /* Grid: maps millimetres (origin at face centre, +y up) to raster pixels. */
  WB.makeGrid = function (w, h, ppmm) {
    var pad = 4; // mm of empty margin so contours never touch the raster edge
    var cols = Math.max(16, Math.ceil((w + pad * 2) * ppmm));
    var rows = Math.max(16, Math.ceil((h + pad * 2) * ppmm));
    return {
      ppmm: ppmm, cols: cols, rows: rows,
      ox: cols / 2, oy: rows / 2,
      w: w, h: h,
      px: function (mm) { return this.ox + mm * this.ppmm; },
      py: function (mm) { return this.oy - mm * this.ppmm; },
      mmx: function (px) { return (px - this.ox) / this.ppmm; },
      mmy: function (py) { return (this.oy - py) / this.ppmm; }
    };
  };

  WB.mirrorMaskX = function (m, g) {
    if (!m) return null;
    var out = new Float32Array(m.length);
    for (var y = 0; y < g.rows; y++) {
      var row = y * g.cols, last = row + g.cols - 1;
      for (var x = 0; x < g.cols; x++) out[row + x] = m[last - x];
    }
    return out;
  };

  /* ── mask algebra (alpha 0..1 Float32Array) ─────────────────────── */
  WB.mask = {
    make: function (g) { return new Float32Array(g.cols * g.rows); },
    union: function (a, b) {
      if (!a) return b; if (!b) return a;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] > b[i] ? a[i] : b[i];
      return o;
    },
    sub: function (a, b) {           // a AND NOT b
      if (!a) return null; if (!b) return a;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] * (1 - b[i]);
      return o;
    },
    and: function (a, b) {
      if (!a || !b) return null;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] * b[i];
      return o;
    },
    empty: function (m) {
      if (!m) return true;
      for (var i = 0; i < m.length; i++) if (m[i] > 0.5) return false;
      return true;
    },
    /* Coverage in mm², handy for sanity checks. */
    area: function (m, g) {
      if (!m) return 0;
      var s = 0;
      for (var i = 0; i < m.length; i++) s += m[i];
      return s / (g.ppmm * g.ppmm);
    },
    /* Read the alpha channel of a canvas into a mask. */
    fromCanvas: function (canvas) {
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var n = canvas.width * canvas.height, out = new Float32Array(n);
      for (var i = 0; i < n; i++) out[i] = d[i * 4 + 3] / 255;
      return out;
    },
    /* Zero the outermost ring so marching squares always yields closed loops. */
    sealEdges: function (m, g) {
      var c = g.cols, r = g.rows, i;
      for (i = 0; i < c; i++) { m[i] = 0; m[(r - 1) * c + i] = 0; }
      for (i = 0; i < r; i++) { m[i * c] = 0; m[i * c + c - 1] = 0; }
      return m;
    }
  };

})(window.WB);
