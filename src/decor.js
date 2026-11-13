/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* decor.js — decoration elements rendered to anti-aliased alpha masks:
 * borders (16 styles), text boxes and pictures.
 *
 * Working in mask space buys three things at once: 2-D booleans (so colours
 * never overlap in the mesh), polygon offsetting via the distance transform
 * (so borders follow any outline), and one geometry path shared by text,
 * uploads and freehand drawings. Borders take the border settings, the face
 * outline {w, h} in mm and, for styles that trace it, the face mask.
 */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  /* Transform passed to shape/preview drawing routines. */
  function gridTransform(g) { return { s: g.ppmm, ox: g.ox, oy: g.oy }; }
  WB.gridTransform = gridTransform;

  /* A cleared offscreen 2-D context the size of grid g, reused per key. */
  function ctxFor(key, g) {
    var c = WB.scratch(key, g.cols, g.rows);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, g.cols, g.rows);
    return { canvas: c, ctx: ctx };
  }

  WB.rasterCtx = ctxFor;

  /* Pictures by element id: uploaded images and freehand drawings, as
     canvases. Apps keep their own extra bitmaps alongside (an app's
     WB.assets is this same object). */
  WB.assets = { images: {}, drawings: {} };

  WB.artBitmap = function (art) {
    if (!art) return null;
    if (art.source === 'image') return WB.assets.images[art.id] || null;
    if (art.source === 'draw') return WB.assets.drawings[art.id] || null;
    return null;
  };

  /* ── border ───────────────────────────────────────────────────────
     Built from a signed distance field so it hugs whatever outline it is given —
     including hand-drawn ones — with naturally rounded corners.

     Solid styles are distance bands. Broken styles (dashes, dots, ticks) are
     stroked along the traced centreline instead, because spacing them by angle
     from the plate centre bunches them at the corners of anything that isn't a
     circle. Canvas dash patterns run on arc length, which is what we want. */

  /* Each style is a list of [from, to] distances inward from the outline,
     expressed in multiples of the line width and the gap. */
  WB.BORDER_STYLES = [
    ['none',      'None'],
    ['single',    'Single line'],
    ['double',    'Double line'],
    ['triple',    'Triple line'],
    ['thinthick', 'Thick + thin'],
    ['groove',    'Groove'],
    ['band',      'Thick band'],
    ['dashed',    'Dashed'],
    ['dotted',    'Dotted'],
    ['dashdot',   'Dash-dot'],
    ['beads',     'Beads'],
    ['ticks',     'Ticks'],
    ['wave',      'Wave'],
    ['zigzag',    'Zigzag'],
    ['scallop',   'Scallop'],
    ['braid',     'Braid'],
    ['wavedash',  'Wavy dashes']
  ];

  var STROKED = { dashed: 1, dotted: 1, dashdot: 1, beads: 1, ticks: 1,
                  wave: 1, zigzag: 1, scallop: 1, braid: 1, wavedash: 1 };
  var WAVY = { wave: 'wave', zigzag: 'zigzag', scallop: 'scallop',
               braid: 'wave', wavedash: 'wave' };
  WB.isWavyBorder = function (style) { return !!WAVY[style]; };
  WB.isStrokedBorder = function (style) { return !!STROKED[style]; };

  /* Distance bands for the solid styles, measured inward from the outline. */
  function bandsFor(b) {
    var w = b.width, gap = b.gap, i0 = b.inset, out = [];
    switch (b.style) {
      case 'single': out.push([i0, i0 + w]); break;
      case 'double':
        out.push([i0, i0 + w], [i0 + w + gap, i0 + 2 * w + gap]);
        break;
      case 'triple':
        out.push([i0, i0 + w],
                 [i0 + w + gap, i0 + 2 * w + gap],
                 [i0 + 2 * w + 2 * gap, i0 + 3 * w + 2 * gap]);
        break;
      case 'thinthick':
        out.push([i0, i0 + w * 1.8], [i0 + w * 1.8 + gap, i0 + w * 2.4 + gap]);
        break;
      case 'groove':
        out.push([i0, i0 + w * 0.45],
                 [i0 + w * 0.45 + gap * 0.6, i0 + w * 0.9 + gap * 0.6]);
        break;
      case 'band': out.push([i0, i0 + w * 2.4]); break;
      default: out.push([i0, i0 + w]);
    }
    return out;
  }

  /* Trace the isoline of a signed distance field at `dist` mm inside. */
  function isoline(d, g, dist) {
    var m = new Float32Array(d.length), aa = 1 / g.ppmm;
    for (var i = 0; i < d.length; i++) m[i] = WB.clamp((d[i] - dist) / aa + 0.5, 0, 1);
    WB.mask.sealEdges(m, g);
    return WB.contours(m, g, { eps: 0.3 / g.ppmm, minArea: 0.4 });
  }

  function ringPerimeter(r) {
    var p = 0;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      p += Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y);
    }
    return p;
  }

  /* Walk a closed ring at fixed arc-length steps, calling back with the point
     and unit tangent. Used for ticks, which canvas dashes can't draw. */
  function walkRing(r, step, fn) {
    var acc = 0, next = step / 2;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var ax = r[j].x, ay = r[j].y, bx = r[i].x, by = r[i].y;
      var len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-9) continue;
      while (next <= acc + len) {
        var t = (next - acc) / len;
        fn(ax + (bx - ax) * t, ay + (by - ay) * t,
           (bx - ax) / len, (by - ay) / len, next);
        next += step;
      }
      acc += len;
    }
  }

  /* Periodic profiles, all normalised to [-1, 1] over one cycle. */
  function profile(kind, ph) {
    switch (kind) {
      case 'zigzag':  return 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1;
      case 'scallop': return 2 * Math.abs(Math.sin(Math.PI * ph)) - 1;
      default:        return Math.sin(2 * Math.PI * ph);
    }
  }

  /* Push a ring sideways by a periodic amount to make a wave. The cycle count
     is a whole number per loop, so the pattern closes seamlessly instead of
     showing a step where the phase wraps. */
  function displaceRing(ring, cycles, amp, kind, flip) {
    var per = ringPerimeter(ring);
    if (per < 1) return ring;
    var step = Math.max(0.08, per / 700);
    var pts = [];
    walkRing(ring, step, function (x, y, tx, ty, sAt) {
      var f = profile(kind, (sAt / per) * cycles) * (flip ? -1 : 1);
      pts.push({ x: x - ty * amp * f, y: y + tx * amp * f });
    });
    return pts.length > 3 ? pts : ring;
  }

  function strokedBorder(b, g, d, dist) {
    var polys = isoline(d, g, dist);
    if (!polys.length) return null;

    var o = ctxFor('bstroke', g);
    var ctx = o.ctx;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineJoin = 'round';

    var count = Math.max(2, Math.round(b.dashes));

    polys.forEach(function (poly) {
      [poly.outer].concat(poly.holes).forEach(function (ring) {
        if (ring.length < 3) return;
        var per = ringPerimeter(ring);
        if (per < 1) return;
        var pitch = per / count;                   // one repeat per dash

        if (b.style === 'ticks') {
          // short strokes across the outline, at right angles to it
          ctx.lineCap = 'butt';
          ctx.lineWidth = Math.max(0.35, b.width * 0.7) * g.ppmm;
          var half = Math.max(b.width, b.gap * 1.2) * 0.5 * g.ppmm;
          ctx.beginPath();
          walkRing(ring, pitch, function (x, y, tx, ty) {
            var nx = -ty, ny = tx;                 // outward-ish normal
            var px = g.px(x), py = g.py(y);
            // tangent is in mm space with y up; flip y for pixels
            var dx = nx * half, dy = -ny * half;
            ctx.moveTo(px - dx, py - dy);
            ctx.lineTo(px + dx, py + dy);
          });
          ctx.stroke();
          return;
        }

        if (WAVY[b.style]) {
          var cycles = Math.max(3, Math.round(count));
          var amp = Math.max(0.2, b.gap);
          ctx.lineCap = 'round';
          ctx.lineWidth = b.width * g.ppmm;
          // a braid is the same wave twice, in antiphase
          var passes = b.style === 'braid' ? [false, true] : [false];
          passes.forEach(function (flip) {
            var w = displaceRing(ring, cycles, amp, WAVY[b.style], flip);
            if (b.style === 'wavedash') {
              ctx.setLineDash([Math.max(0.001, pitch * 0.55 * g.ppmm),
                               Math.max(0.001, pitch * 0.45 * g.ppmm)]);
            }
            ctx.beginPath();
            ctx.moveTo(g.px(w[0].x), g.py(w[0].y));
            for (var q = 1; q < w.length; q++) ctx.lineTo(g.px(w[q].x), g.py(w[q].y));
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          });
          return;
        }

        // everything else is an arc-length dash pattern along the centreline
        var lw, pattern, cap;
        if (b.style === 'dotted') {
          lw = b.width; cap = 'round';
          pattern = [0.001, pitch];                // round caps make the dots
        } else if (b.style === 'beads') {
          lw = b.width * 1.7; cap = 'round';
          pattern = [0.001, pitch];
        } else if (b.style === 'dashdot') {
          lw = b.width; cap = 'butt';
          var dash = pitch * 0.44, dot = Math.min(lw, pitch * 0.08), sp = (pitch - dash - dot) / 2;
          pattern = [dash, sp, dot, sp];
        } else {                                    // dashed
          lw = b.width; cap = 'butt';
          pattern = [pitch * 0.6, pitch * 0.4];
        }

        ctx.lineCap = cap;
        ctx.lineWidth = lw * g.ppmm;
        ctx.setLineDash(pattern.map(function (v) { return Math.max(0.001, v * g.ppmm); }));
        ctx.beginPath();
        ctx.moveTo(g.px(ring[0].x), g.py(ring[0].y));
        for (var k = 1; k < ring.length; k++) ctx.lineTo(g.px(ring[k].x), g.py(ring[k].y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      });
    });

    return WB.mask.sealEdges(WB.mask.fromCanvas(o.canvas), g);
  }

  /* How far in from the plate's edge the border's ink reaches, mm: what an
     element dragged inside it lines up with. */
  WB.borderReach = function (b) {
    if (!b || b.style === 'none') return 0;
    if (!STROKED[b.style]) {
      return Math.max.apply(null, bandsFor(b).map(function (k) { return k[1]; }));
    }
    var amp = WAVY[b.style] ? Math.max(0.2, b.gap) : 0;
    var centre = b.inset + (b.shape === 'follow' ? b.width / 2 + amp : 0);
    var half = b.style === 'ticks' ? Math.max(b.width, b.gap * 1.2) / 2
             : b.style === 'beads' ? b.width * 0.85 : b.width / 2 + amp;
    return centre + half;
  };

  WB.borderMask = function (b, fo, g, plate) {
    if (b.style === 'none') return null;

    var follow = b.shape === 'follow';
    var src, centred;

    if (follow) {
      src = plate;
      centred = false;
    } else {
      var w = Math.max(2, fo.w - 2 * b.inset), h = Math.max(2, fo.h - 2 * b.inset);
      var o = ctxFor('bshape', g);
      o.ctx.fillStyle = '#fff';
      o.ctx.beginPath();
      WB.shapePath(o.ctx, b.shape, w, h, b.radius, gridTransform(g));
      o.ctx.fill();
      src = WB.mask.sealEdges(WB.mask.fromCanvas(o.canvas), g);
      centred = true;     // bands straddle the outline instead of insetting
    }

    var d = WB.sdf(src, g, !centred);          // an inset border only looks inside

    if (STROKED[b.style]) {
      // centreline sits half a line width inside the nominal inset, plus the
      // wave amplitude so the crests stay on the plate rather than clipping off
      var room = b.width / 2 + (WAVY[b.style] ? Math.max(0.2, b.gap) : 0);
      return strokedBorder(b, g, d, centred ? 0 : b.inset + room);
    }

    var bands = bandsFor(b);
    var n = d.length, out = new Float32Array(n), aa = 1 / g.ppmm;

    for (var i = 0; i < n; i++) {
      var v = 0, dv = centred ? Math.abs(d[i]) : d[i];
      for (var k = 0; k < bands.length; k++) {
        var lo = bands[k][0], hi = bands[k][1];
        if (centred) { lo = Math.max(0, lo - b.inset); hi = hi - b.inset; }
        var t = WB.band(dv, lo, hi, aa);
        if (t > v) v = t;
      }
      out[i] = v;
    }
    return out;
  };

  /* ── text ─────────────────────────────────────────────────────────
     Laid out once, here, and reused by the rasteriser and the selection box so
     the two can never disagree.

     Vertical centring uses the *ink* bounds (actualBoundingBox…), not canvas's
     'middle' baseline. 'middle' centres the em box, which reserves descender
     space below the baseline that caps-only text never uses — so "HELLO"
     centred that way sits visibly high. */
  WB.textLayout = function (ctx, tx, t) {
    var content = tx.content || '';
    if (!content.trim()) return null;
    var px = tx.size * t.s;
    if (px < 1) return null;

    var lines = content.split('\n');
    WB.loadFont(tx.font);       // drawn in the fallback until it arrives; the app redraws on 'wbfont'
    var font = (tx.italic ? 'italic ' : '') + (tx.bold ? '700 ' : '400 ') + px + 'px ' +
               WB.fontByKey(WB.fontKey(tx.font)).css;
    var track = tx.tracking * t.s;
    var lh = px * tx.lineHeight;

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';

    var info = lines.map(function (line) {
      var m = ctx.measureText(line);
      var w = m.width;
      if (Math.abs(track) > 0.01) {
        var chars = Array.from(line), sum = 0;
        for (var i = 0; i < chars.length; i++) sum += ctx.measureText(chars[i]).width;
        w = sum + track * Math.max(0, chars.length - 1);
      }
      var asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
      if (!(asc > 0 || asc === 0) || !isFinite(asc)) asc = px * 0.72;   // pre-2020 fallback
      if (!(desc > 0 || desc === 0) || !isFinite(desc)) desc = px * 0.2;
      if (!line.trim()) { asc = 0; desc = 0; }                          // blank line: no ink
      return { w: w, asc: asc, desc: desc };
    });
    ctx.restore();

    var maxW = 0;
    info.forEach(function (i) { if (i.w > maxW) maxW = i.w; });

    // topmost and bottommost lines that actually put ink down
    var firstInk = -1, lastInk = 0;
    for (var i = 0; i < info.length; i++) {
      if (info[i].asc > 0 || info[i].desc > 0) { if (firstInk < 0) firstInk = i; lastInk = i; }
    }
    if (firstInk < 0) return null;

    var top = firstInk * lh - info[firstInk].asc;
    var bot = lastInk * lh + info[lastInk].desc;
    var y0 = -(top + bot) / 2;          // baseline of line 0, ink centred on 0

    return { lines: lines, info: info, font: font, lh: lh, y0: y0, track: track,
             width: maxW, height: bot - top, align: tx.align };
  };

  /* Also used by the preview, hence the colour/stroke parameters. */
  WB.drawText = function (ctx, tx, t, style) {
    var L = WB.textLayout(ctx, tx, t);
    if (!L) return null;

    ctx.save();
    ctx.translate(t.ox + tx.x * t.s, t.oy - tx.y * t.s);
    ctx.rotate(-tx.rotation * Math.PI / 180);
    ctx.font = L.font;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = tx.align;
    ctx.fillStyle = style.fill || '#fff';
    ctx.strokeStyle = style.fill || '#fff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = tx.strokeWidth * t.s;

    var outline = tx.style === 'outline';
    for (var i = 0; i < L.lines.length; i++) {
      var y = L.y0 + i * L.lh;
      if (Math.abs(L.track) < 0.01) {
        if (outline) ctx.strokeText(L.lines[i], 0, y); else ctx.fillText(L.lines[i], 0, y);
      } else {
        drawTracked(ctx, L.lines[i], y, L.track, tx.align, outline, L.info[i].w);
      }
    }
    ctx.restore();
    return true;
  };

  /* Letter-spacing done by hand so it behaves identically everywhere. */
  function drawTracked(ctx, line, y, track, align, outline, total) {
    var chars = Array.from(line);
    var x = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    var prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (var i = 0; i < chars.length; i++) {
      if (outline) ctx.strokeText(chars[i], x, y); else ctx.fillText(chars[i], x, y);
      x += ctx.measureText(chars[i]).width + track;
    }
    ctx.textAlign = prev;
  }

  WB.textMask = function (tx, g) {
    if (!(tx.content || '').trim()) return null;
    var o = ctxFor('text', g);
    var ok = WB.drawText(o.ctx, tx, gridTransform(g), { fill: '#fff' });
    if (!ok) return null;
    return WB.mask.sealEdges(WB.mask.fromCanvas(o.canvas), g);
  };

  /* ── picture / drawing ──────────────────────────────────────────── */
  /* Places the bitmap; returns the device-space box it occupies. */
  WB.artPlacement = function (art, t, src) {
    src = src || WB.artBitmap(art);
    if (!src) return null;
    if (src._bbox === undefined) src._bbox = WB.contentBBox(src);
    var bb = src._bbox;
    if (!bb) return null;
    var k = art.size * t.s / Math.max(bb.w, bb.h);
    return { src: src, bb: bb, k: k,
             w: bb.w * k, h: bb.h * k,
             cx: t.ox + art.x * t.s, cy: t.oy - art.y * t.s };
  };

  /* What gets drawn: the bitmap, or for a multi-colour picture its recoloured copy. */
  function artSource(art) {
    return WB.resolveArtMode(art) === 'colors' ? WB.artRecolored(art) : WB.artBitmap(art);
  }

  WB.drawArt = function (ctx, art, t) {
    var p = WB.artPlacement(art, t, artSource(art));
    if (!p) return false;
    ctx.save();
    ctx.translate(p.cx, p.cy);
    ctx.rotate(-art.rotation * Math.PI / 180);
    ctx.scale(art.mirror ? -p.k : p.k, p.k);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(p.src, p.bb.x, p.bb.y, p.bb.w, p.bb.h, -p.bb.w / 2, -p.bb.h / 2, p.bb.w, p.bb.h);
    ctx.restore();
    return true;
  };

  /* Decide how to turn pixels into a silhouette. Uploaded logos are usually
     either transparent PNGs or dark-on-white line art. */
  WB.resolveArtMode = function (art) {
    if (art.source === 'draw') return 'alpha';
    if (art.mode !== 'auto') return art.mode;
    var src = WB.assets.images[art.id];
    if (!src) return 'alpha';
    return hasAlpha(src) ? 'alpha' : 'dark';
  };
  function hasAlpha(src) {
    if (src._hasAlpha == null) {
      var c = document.createElement('canvas');
      var w = c.width = Math.min(160, src.width), h = c.height = Math.min(160, src.height);
      var cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(src, 0, 0, w, h);
      var d = cx.getImageData(0, 0, w, h).data, transparent = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 240) transparent++;
      src._hasAlpha = transparent > (w * h) * 0.02;
    }
    return src._hasAlpha;
  }

  WB.artMask = function (art, g) {
    if (!WB.artBitmap(art)) return null;

    var o = ctxFor('art', g);
    if (!WB.drawArt(o.ctx, art, gridTransform(g))) return null;

    var mode = WB.resolveArtMode(art);
    var img = o.ctx.getImageData(0, 0, g.cols, g.rows).data;
    var n = g.cols * g.rows, out = new Float32Array(n);

    if (mode === 'alpha' || mode === 'colors') {
      for (var i = 0; i < n; i++) out[i] = img[i * 4 + 3] / 255;
    } else {
      var thr = art.threshold, soft = 0.09, dark = (mode === 'dark');
      for (var j = 0; j < n; j++) {
        var a = img[j * 4 + 3] / 255;
        if (a <= 0.004) { out[j] = 0; continue; }
        var lum = (0.2126 * img[j * 4] + 0.7152 * img[j * 4 + 1] + 0.0722 * img[j * 4 + 2]) / 255;
        var v = dark ? (thr - lum) : (lum - thr);
        out[j] = a * WB.clamp(v / soft + 0.5, 0, 1);
      }
    }
    return WB.mask.sealEdges(out, g);
  };

  /* ── multi-colour pictures ──────────────────────────────────────── */
  /* An uploaded picture in 'colors' mode prints as one body per colour. Its
     pixels are grouped into a handful of colours, and colours closer than
     art.merge (ΔE: how different they look) are crushed into one. Each group
     prints in its own colour unless art.recolor maps it: {found: '#hex'}, or
     '' to leave it out. */
  WB.ART_MAX_COLORS = 8;
  var HEX = /^#[0-9A-F]{6}$/i;

  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function toLab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    var x = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047),
        y = labF(0.2126 * r + 0.7152 * g + 0.0722 * b),
        z = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function d2(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; }
  function nearest(list, v) {
    var bi = -1, bd = Infinity;
    for (var i = 0; i < list.length; i++) { var d = d2(list[i], v); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  function toHex(r, g, b) {
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1).toUpperCase();
  }
  function rgb255(hex) { return WB.hexToRgb(hex).map(function (v) { return v * 255; }); }

  /* RGBA pixels (w wide) → at most `max` colours, biggest first:
     [{hex, lab, count, edge}], edge being how many of its pixels sit on the
     border. Opaque pixels only; specks under 0.3 % fold into the nearest. */
  WB.quantizeColors = function (d, w, merge, max) {
    var bins = {}, keys = [], n = d.length / 4, h = n / w, total = 0;
    for (var i = 0; i < n; i++) {
      if (d[i * 4 + 3] < 128) continue;
      var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      var k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      var bin = bins[k];
      if (!bin) { bin = bins[k] = { r: 0, g: 0, b: 0, n: 0, e: 0 }; keys.push(k); }
      bin.r += r; bin.g += g; bin.b += b; bin.n++; total++;
      var x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bin.e++;
    }
    // Biggest first, so each crushed group is seeded by its main shade.
    var groups = [], seeds = [], m2 = merge * merge;
    keys.map(function (k) { return bins[k]; }).sort(function (a, b) { return b.n - a.n; }).forEach(function (bin) {
      var lab = toLab(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n), gi = nearest(seeds, lab);
      if (gi >= 0 && d2(seeds[gi], lab) <= m2) {
        var gr = groups[gi];
        gr.r += bin.r; gr.g += bin.g; gr.b += bin.b; gr.n += bin.n; gr.e += bin.e;
      } else {
        seeds.push(lab);
        groups.push({ r: bin.r, g: bin.g, b: bin.b, n: bin.n, e: bin.e });
      }
    });
    groups.forEach(function (gr) {
      gr.hex = toHex(gr.r / gr.n, gr.g / gr.n, gr.b / gr.n);
      gr.lab = toLab(gr.r / gr.n, gr.g / gr.n, gr.b / gr.n);
    });
    groups.sort(function (a, b) { return b.n - a.n; });
    var keep = groups.filter(function (gr, i) { return i < max && gr.n >= total * 0.003; });
    if (!keep.length) keep = groups.slice(0, 1);
    var keepLabs = keep.map(function (q) { return q.lab; });
    groups.forEach(function (gr) {
      if (keep.indexOf(gr) >= 0) return;
      var to = keep[nearest(keepLabs, gr.lab)];
      to.n += gr.n; to.e += gr.e;                // its pixels join; the colour stays
    });
    keep.sort(function (a, b) { return b.n - a.n; });
    return keep.map(function (gr) { return { hex: gr.hex, lab: gr.lab, count: gr.n, edge: gr.e }; });
  };

  function imageOf(art) { return art && art.source === 'image' ? WB.assets.images[art.id] || null : null; }
  function mergeOf(art) { var m = +art.merge; return isFinite(m) ? WB.clamp(m, 0, 100) : 0; }

  /* Grouped on a small copy: enough to find the colours, cheap to redo. */
  function groupsOf(art, src) {
    var merge = mergeOf(art);
    if (!src._groups || src._groups.merge !== merge) {
      if (!src._sample) {
        var k = Math.min(1, 256 / Math.max(src.width, src.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
        var cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(src, 0, 0, c.width, c.height);
        src._sample = { d: cx.getImageData(0, 0, c.width, c.height).data, w: c.width };
      }
      src._groups = { merge: merge, list: WB.quantizeColors(src._sample.d, src._sample.w, merge, WB.ART_MAX_COLORS) };
    }
    return src._groups.list;
  }

  /* [{src, out, count}]: each colour found, and what it prints as ('' = left out). */
  WB.artPalette = function (art) {
    var src = imageOf(art);
    if (!src) return [];
    var list = groupsOf(art, src), rec = art.recolor || {}, bg = -1;
    if (!hasAlpha(src)) {
      // No transparency: the colour holding most of the border is the background.
      var edges = 0;
      list.forEach(function (g) { edges += g.edge; });
      list.forEach(function (g, i) { if (g.edge > edges * 0.5) bg = i; });
    }
    return list.map(function (g, i) {
      var o = WB.recolorOf(rec, g.hex);
      if (o === undefined) o = i === bg ? '' : g.hex;
      return { src: g.hex, out: o.toUpperCase(), count: g.count };
    });
  };

  /* What a found colour was set to print as ('#hex', '' left out, or
     undefined). Found colours are averages, and on another browser or
     after a reload one can come out a shade off, so a choice saved for a
     colour that looks the same (ΔE under 10) still counts. Saved or shared
     junk is ignored. */
  WB.recolorOf = function (rec, hex) {
    var ok = function (v) { return v === '' || HEX.test(v); };
    if (!rec) return undefined;
    if (Object.prototype.hasOwnProperty.call(rec, hex)) return ok(rec[hex]) ? rec[hex] : undefined;
    var lab = toLab.apply(null, rgb255(hex)), best, bd = 100;
    Object.keys(rec).forEach(function (k) {
      if (!HEX.test(k) || !ok(rec[k])) return;
      var d = d2(toLab.apply(null, rgb255(k)), lab);
      if (d < bd) { bd = d; best = rec[k]; }
    });
    return best;
  };

  /* The distinct colours a picture prints in. */
  WB.artColors = function (art) {
    if (WB.resolveArtMode(art) !== 'colors') return [art.color];
    var seen = [];
    WB.artPalette(art).forEach(function (p) { if (p.out && seen.indexOf(p.out) < 0) seen.push(p.out); });
    return seen;
  };

  /* The picture repainted in its print colours, full size, left-out colours
     transparent. Keeps the original's bounding box so the picture doesn't
     jump when a colour is dropped. */
  WB.artRecolored = function (art) {
    var src = imageOf(art);
    if (!src) return null;
    var pal = WB.artPalette(art), key = mergeOf(art) + JSON.stringify(pal);
    if (src._recol && src._recol.key === key) return src._recol.canvas;
    var labs = groupsOf(art, src).map(function (g) { return g.lab; });
    var outs = pal.map(function (p) { return p.out ? rgb255(p.out) : null; });
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, 0, 0);
    var im = cx.getImageData(0, 0, c.width, c.height), d = im.data;
    var memo = new Int8Array(32768).fill(-1);   // 5-bit-per-channel colour → group
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3);
      if (memo[k] < 0) memo[k] = nearest(labs, toLab((d[i] | 7) - 3, (d[i + 1] | 7) - 3, (d[i + 2] | 7) - 3));
      var o = outs[memo[k]];
      if (!o) { d[i + 3] = 0; continue; }
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
    }
    cx.putImageData(im, 0, 0);
    if (src._bbox === undefined) src._bbox = WB.contentBBox(src);
    c._bbox = src._bbox;
    src._recol = { key: key, canvas: c };
    return c;
  };

  /* A picture as [{color, mask}]: one layer per print colour, or one for a
     single-colour picture. Layers never overlap. */
  WB.artLayers = function (art, g) {
    if (WB.resolveArtMode(art) !== 'colors') {
      var m = WB.artMask(art, g);
      return m ? [{ color: art.color, mask: m }] : [];
    }
    var cols = WB.artColors(art);
    if (!cols.length) return [];
    var o = ctxFor('art', g);
    if (!WB.drawArt(o.ctx, art, gridTransform(g))) return [];
    var img = o.ctx.getImageData(0, 0, g.cols, g.rows).data, n = g.cols * g.rows;
    var rgb = cols.map(rgb255), masks = cols.map(function () { return new Float32Array(n); });
    for (var j = 0; j < n; j++) {
      var a = img[j * 4 + 3];
      if (a <= 1) continue;
      masks[nearest(rgb, [img[j * 4], img[j * 4 + 1], img[j * 4 + 2]])][j] = a / 255;
    }
    return cols.map(function (c, k) { return { color: c, mask: WB.mask.sealEdges(masks[k], g) }; })
               .filter(function (l) { return l.mask && !WB.mask.empty(l.mask); });
  };

})(window.WB);
