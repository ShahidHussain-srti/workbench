/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* viewer.js — small WebGL viewer with orbit controls.
 * Meant to render the very mesh that gets exported, so the preview cannot
 * drift from the file. Corner normals are smoothed within a crease angle, so
 * curves shade smoothly while edges stay crisp, and textured surfaces can be
 * bump-shaded per pixel from a height atlas. Apps add poses (moving parts on
 * the CPU), overlay lines and click handling through the hooks below.
 */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec3 aColor;',
    'attribute vec2 aTex;',      // height-atlas coordinates (textured surfaces only)
    'attribute vec3 aBN;',       // the surface's normal before texturing
    'attribute vec3 aTa;',       // tangent along the atlas u axis
    'attribute float aKind;',    // 0 plain, 1 wall, 2 lid top, 3 underside
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying vec3 vN;',
    'varying vec3 vC;',
    'varying vec3 vP;',
    'varying vec2 vTex;',
    'varying vec3 vBN;',
    'varying vec3 vTa;',
    'varying float vKind;',
    'void main(){',
    '  vN = aNormal; vC = aColor; vP = aPos;',
    '  vTex = aTex; vBN = aBN; vTa = aTa; vKind = aKind;',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  /* Textured surfaces are shaded per pixel from the height atlas:
     the light preview mesh gives the shape, and the normal
     at every pixel comes from the atlas gradient around the surface's own
     untextured normal. Height h is how far the surface moves in, so the
     normal is N + dh/da·Ta + dh/db·Tb (a, b the atlas axes, in mm). */
  var FS = [
    'precision highp float;',
    'varying vec3 vN;',
    'varying vec3 vC;',
    'varying vec3 vP;',
    'varying vec2 vTex;',
    'varying vec3 vBN;',
    'varying vec3 vTa;',
    'varying float vKind;',
    'uniform vec3 uEye;',
    'uniform sampler2D uAtlas;',
    'uniform float uBump;',      // 1 when this draw has an atlas
    'uniform vec2 uTexel;',      // one texel in atlas coordinates
    'uniform float uTexelMM;',   // one texel in millimetres
    'uniform float uHScale;',    // atlas value → millimetres
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  if (uBump > 0.5 && vKind > 0.5) {',
    '    float hL = texture2D(uAtlas, vTex - vec2(uTexel.x, 0.0)).r;',
    '    float hR = texture2D(uAtlas, vTex + vec2(uTexel.x, 0.0)).r;',
    '    float hD = texture2D(uAtlas, vTex - vec2(0.0, uTexel.y)).r;',
    '    float hU = texture2D(uAtlas, vTex + vec2(0.0, uTexel.y)).r;',
    '    float ga = (hR - hL) * uHScale / (2.0 * uTexelMM);',
    '    float gb = (hU - hD) * uHScale / (2.0 * uTexelMM);',
    '    vec3 N = normalize(vBN), Ta = normalize(vTa);',
    '    vec3 Tb = cross(N, Ta) * (vKind > 2.5 ? -1.0 : 1.0);',
    '    n = normalize(N + ga * Ta + gb * Tb);',
    '  }',
    '  vec3 v = normalize(uEye - vP);',
    '  vec3 l1 = normalize(vec3(0.45, -0.7, 1.0));',
    '  vec3 l2 = normalize(vec3(-0.8, 0.5, 0.35));',
    '  float d1 = max(dot(n, l1), 0.0);',
    '  float d2 = max(dot(n, l2), 0.0);',
    // Filament colours are sRGB. Light has to be mixed in linear space and the
    // result encoded back, or dark colours wash out to grey.
    '  vec3 base = pow(vC, vec3(2.2));',
    '  float amb = 0.26 + 0.18 * (n.z * 0.5 + 0.5);',   // hemispheric fill
    '  float dif = 0.52 * d1 + 0.18 * d2;',
    '  vec3 h = normalize(l1 + v);',
    '  float spec = pow(max(dot(n, h), 0.0), 38.0) * 0.16;',
    '  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.14;',
    '  vec3 col = base * (amb + dif + rim) + vec3(spec);',
    '  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);',
    '}'
  ].join('\n');

  /* Selection outlines: flat colour, drawn over everything. */
  var LVS = [
    'attribute vec3 aPos;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'void main(){ gl_Position = uProj * uView * vec4(aPos, 1.0); }'
  ].join('\n');
  var LFS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'void main(){ gl_FragColor = uColor; }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* ── 4×4 matrices, column-major ─────────────────────────────────── */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function lookAt(eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }

  /* opts: {
       view:    { az, el }     the starting camera angle (radians)
       onClick(ray, event)     a click that wasn't a drag; ray = { a, b }, two
                               world points on the line under the pointer
     }
     Parts are { positions, indices, color, half?, tex? }: `tex` carries
     per-vertex atlas data for bump-shaded textures (9 floats a vertex), and
     `half` names which atlas in setModel(parts, atlases) it reads. */
  WB.Viewer = function (canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { this.failed = true; return; }

    this.canvas = canvas;
    this.gl = gl;
    this.onClick = opts.onClick || function () {};
    this.view0 = opts.view || { az: -1.15, el: 0.72 };
    this.count = 0;
    this.center = [0, 0, 0];
    this.radius = 40;
    this.parts = [];
    this.poser = null;
    this.lines = null;
    this.bed = null;

    // camera state
    this.az = this.view0.az;
    this.el = this.view0.el;
    this.dist = 160;
    this.pan = [0, 0];

    this.atlasTex = {};
    this._initGL();
    this._bindControls();

    // A lost context (GPU reset, too many tabs) comes back empty: rebuild the
    // programs and buffers and upload the model again.
    var self = this;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () {
      var srcs = {};
      Object.keys(self.atlasTex).forEach(function (k) { if (self.atlasTex[k]) srcs[k] = self.atlasTex[k].src; });
      self.atlasTex = {};
      self._initGL();
      self._setAtlases(srcs);
      self._upload();
      self._uploadLines();
      self._uploadBed();
      self.draw();
    });
  };

  WB.Viewer.prototype._initGL = function () {
    var gl = this.gl;
    this.prog = program(gl, VS, FS);
    this.loc = {
      pos: gl.getAttribLocation(this.prog, 'aPos'),
      nrm: gl.getAttribLocation(this.prog, 'aNormal'),
      col: gl.getAttribLocation(this.prog, 'aColor'),
      proj: gl.getUniformLocation(this.prog, 'uProj'),
      view: gl.getUniformLocation(this.prog, 'uView'),
      eye: gl.getUniformLocation(this.prog, 'uEye'),
      tex: gl.getAttribLocation(this.prog, 'aTex'),
      bn: gl.getAttribLocation(this.prog, 'aBN'),
      ta: gl.getAttribLocation(this.prog, 'aTa'),
      kind: gl.getAttribLocation(this.prog, 'aKind'),
      atlas: gl.getUniformLocation(this.prog, 'uAtlas'),
      bump: gl.getUniformLocation(this.prog, 'uBump'),
      texel: gl.getUniformLocation(this.prog, 'uTexel'),
      texelMM: gl.getUniformLocation(this.prog, 'uTexelMM'),
      hscale: gl.getUniformLocation(this.prog, 'uHScale')
    };
    // Float atlases when the GPU filters them, else 8-bit with a scale.
    this.floatTex = !!(gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear'));
    this.lprog = program(gl, LVS, LFS);
    this.lloc = {
      pos: gl.getAttribLocation(this.lprog, 'aPos'),
      proj: gl.getUniformLocation(this.lprog, 'uProj'),
      view: gl.getUniformLocation(this.lprog, 'uView'),
      color: gl.getUniformLocation(this.lprog, 'uColor')
    };
    this.buf = gl.createBuffer();
    this.lbuf = gl.createBuffer();
    this.bbuf = gl.createBuffer();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  };

  WB.Viewer.prototype._bindControls = function () {
    var self = this, canvas = this.canvas;
    var down = false, lastX = 0, lastY = 0, shift = false, travel = 0, button = 0;

    // Right-drag pans, so the browser's menu must not open at the end of it.
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      down = true; shift = e.shiftKey; travel = 0; button = e.button;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      travel += Math.abs(dx) + Math.abs(dy);
      if (shift || button === 1 || button === 2) {           // shift, middle or right: pan
        var k = self.dist * 0.0016;
        var c = Math.cos(self.az), s = Math.sin(self.az);
        self.fitted = false;
        // Along the camera's right and forward directions on the ground, so
        // the model follows the pointer from any angle.
        self.pan[0] += (s * dx - c * dy) * k;
        self.pan[1] += (-c * dx - s * dy) * k;
      } else {
        self.az -= dx * 0.008;
        self.el = WB.clamp(self.el + dy * 0.008, -1.5, 1.5);
      }
      self.draw();
    });
    var end = function (e) {
      if (down && travel < 4 && e.type === 'pointerup' && button === 0) { var ray = self.ray(e); if (ray) self.onClick(ray, e); }
      down = false;
      canvas.classList.remove('dragging');
      if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.fitted = false;
      self.dist = WB.clamp(self.dist * Math.exp(e.deltaY * 0.0012), self.radius * 0.55, Math.max(self.radius * 14, self.dist));
      self.draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', function () { self.frame(); self.draw(); });
  };

  /* The view ray under a pointer event: { a, b }, near and far points. */
  WB.Viewer.prototype.ray = function (e) {
    if (!this._mats) return null;
    var r = this.canvas.getBoundingClientRect();
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    var inv = invert(mul(this._mats.proj, this._mats.view));
    if (!inv) return null;
    return { a: unproject(inv, nx, ny, -1), b: unproject(inv, nx, ny, 1) };
  };

  WB.Viewer.prototype.setModel = function (parts, atlas) {
    this.parts = parts || [];
    this._setAtlases(atlas || {});
    this._upload();
  };

  /* fn(part) → a function mapping a point (x, y, z) to where it is drawn, or
     null to draw the part as it is. Rigid moves only: normals turn with it. */
  WB.Viewer.prototype.setPoser = function (fn) {
    this.poser = fn;
    this._upload();
  };

  /* Overlay lines as flat [x0, y0, z0, x1, y1, z1, …], bright where visible
     and faint where hidden; null clears them. */
  WB.Viewer.prototype.setLines = function (pts) {
    this.lines = pts && pts.length ? pts : null;
    this._uploadLines();
  };

  /* A print bed drawn under the model: { w, d, cx, cy, z } in mm, or null.
     A faint plate with a 10 mm grid, darker every 50 mm, measured from its
     centre, and a firm outline. */
  WB.Viewer.prototype.setBed = function (b) {
    var was = this.bed;
    this.bed = b && b.w > 0 && b.d > 0 ? b : null;
    this._uploadBed();
    // Zoom to suit when it appears, changes size or goes away.
    if (this.bed ? (!was || was.w !== this.bed.w || was.d !== this.bed.d) : was) this.fit();
  };
  WB.Viewer.prototype._uploadBed = function () {
    if (this.failed) return;
    this.bedRanges = null;
    var b = this.bed;
    if (!b) return;
    var x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2, y0 = b.cy - b.d / 2, y1 = b.cy + b.d / 2;
    var zp = b.z - 0.06, zl = b.z - 0.03, v = [];
    v.push(x0, y0, zp, x1, y0, zp, x1, y1, zp, x0, y0, zp, x1, y1, zp, x0, y1, zp);
    var grid = function (major) {
      var n0 = v.length;
      for (var k = -Math.floor(b.w / 20); k <= Math.floor(b.w / 20); k++) {
        var x = b.cx + k * 10;
        if ((k % 5 === 0) !== major || x <= x0 + 1e-6 || x >= x1 - 1e-6) continue;
        v.push(x, y0, zl, x, y1, zl);
      }
      for (var j = -Math.floor(b.d / 20); j <= Math.floor(b.d / 20); j++) {
        var y = b.cy + j * 10;
        if ((j % 5 === 0) !== major || y <= y0 + 1e-6 || y >= y1 - 1e-6) continue;
        v.push(x0, y, zl, x1, y, zl);
      }
      return (v.length - n0) / 3;
    };
    var minor = grid(false), major = grid(true);
    v.push(x0, y0, zl, x1, y0, zl, x1, y0, zl, x1, y1, zl, x1, y1, zl, x0, y1, zl, x0, y1, zl, x0, y0, zl);
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    this.bedRanges = { plate: [0, 6], minor: [6, minor], major: [6 + minor, major], edge: [6 + minor + major, 8] };
  };

  /* One GPU texture per atlas, re-uploaded only when the atlas itself changed
     (an app's geometry cache can hand back the same object when nothing fed it). */
  WB.Viewer.prototype._setAtlases = function (atlas) {
    var gl = this.gl, self = this;
    Object.keys(atlas).concat(Object.keys(this.atlasTex)).forEach(function (half) {
      var a = atlas[half], cur = self.atlasTex[half];
      if (!a) { self.atlasTex[half] = null; return; }
      if (cur && cur.src === a) return;
      var tex = (cur && cur.tex) || gl.createTexture(), scale = 1, offset = 0;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (self.floatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, a.w, a.h, 0, gl.LUMINANCE, gl.FLOAT, a.data);
      } else {
        var lo = Infinity, hi = -Infinity, i;
        for (i = 0; i < a.data.length; i++) { if (a.data[i] < lo) lo = a.data[i]; if (a.data[i] > hi) hi = a.data[i]; }
        scale = Math.max(1e-6, hi - lo); offset = lo;
        var bytes = new Uint8Array(a.data.length);
        for (i = 0; i < a.data.length; i++) bytes[i] = Math.round((a.data[i] - lo) / scale * 255);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, a.w, a.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      self.atlasTex[half] = { src: a, tex: tex, w: a.w, h: a.h, texelMM: a.texelMM, hscale: scale, offset: offset };
    });
  };

  /* Build the interleaved buffer from exported parts. */
  WB.Viewer.prototype._upload = function () {
    if (this.failed) return;
    var gl = this.gl, self = this;
    var parts = this.parts;

    var tris = 0;
    parts.forEach(function (p) { tris += p.indices.length / 3; });
    this.count = tris * 3;
    if (!tris) { this.bounds = null; return; }

    var STRIDE = 18, data = new Float32Array(tris * 3 * STRIDE);
    var o = 0, ranges = [];
    this.stride = STRIDE;
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    parts.forEach(function (part) {
      var pose = self.poser ? self.poser(part) : null;
      var rgb = WB.hexToRgb(part.color);
      var p = part.positions, ix = part.indices, cn = cornerNormals(part), tx = part.tex;
      // Poses are rigid, so a direction turns with the point it sits on.
      var turn = function (q, x0, y0, z0, vx, vy, vz) {
        var e = pose(x0 + vx, y0 + vy, z0 + vz);
        return [e[0] - q[0], e[1] - q[1], e[2] - q[2]];
      };
      ranges.push({ start: o / STRIDE, count: ix.length, half: part.half, tex: !!tx });
      for (var i = 0; i < ix.length; i++) {
        var a = ix[i] * 3, x = p[a], y = p[a + 1], z = p[a + 2];
        var nx = cn[i * 3], ny = cn[i * 3 + 1], nz = cn[i * 3 + 2];
        var t9 = tx ? ix[i] * 9 : -1;
        var bn = t9 >= 0 ? [tx[t9 + 2], tx[t9 + 3], tx[t9 + 4]] : [0, 0, 1];
        var ta = t9 >= 0 ? [tx[t9 + 5], tx[t9 + 6], tx[t9 + 7]] : [1, 0, 0];
        if (pose) {
          var q = pose(x, y, z), qn = turn(q, x, y, z, nx, ny, nz);
          if (t9 >= 0) { bn = turn(q, x, y, z, bn[0], bn[1], bn[2]); ta = turn(q, x, y, z, ta[0], ta[1], ta[2]); }
          nx = qn[0]; ny = qn[1]; nz = qn[2];
          x = q[0]; y = q[1]; z = q[2];
        }
        data[o++] = x; data[o++] = y; data[o++] = z;
        data[o++] = nx; data[o++] = ny; data[o++] = nz;
        data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
        data[o++] = t9 >= 0 ? tx[t9] : 0; data[o++] = t9 >= 0 ? tx[t9 + 1] : 0;
        data[o++] = bn[0]; data[o++] = bn[1]; data[o++] = bn[2];
        data[o++] = ta[0]; data[o++] = ta[1]; data[o++] = ta[2];
        data[o++] = t9 >= 0 ? tx[t9 + 8] : 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.ranges = ranges;

    this.bounds = { minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ };
    this.center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    this.radius = Math.max(6, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    // Zoom to suit when the model grows or shrinks a lot, keeping the angle.
    if (this._framed && (this.radius > this._framed * 1.12 || this.radius < this._framed * 0.7)) this.fit();
    this._uploadLines();
  };

  WB.Viewer.prototype._uploadLines = function () {
    if (this.failed) return;
    this.lineCount = 0;
    if (!this.lines) return;
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.lines), gl.DYNAMIC_DRAW);
    this.lineCount = this.lines.length / 3;
  };

  /* Fit the bounding sphere in whichever field of view is narrower. */
  WB.Viewer.prototype.fit = function () {
    var aspect = Math.max(0.2, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    var r = this.bed ? Math.max(this.radius, Math.hypot(this.bed.w, this.bed.d) / 2 * 0.95) : this.radius;
    this.dist = r / Math.sin(0.31) / Math.min(1, aspect) * 1.02;
    this.pan = [0, 0];
    this._framed = this.radius;
    this.fitted = true;      // keeps refitting as the canvas resizes, until you zoom or pan
  };

  WB.Viewer.prototype.frame = function () {
    this.fit();
    this.az = this.view0.az;
    this.el = this.view0.el;
  };

  WB.Viewer.prototype.draw = function () {
    if (this.failed) return;
    var gl = this.gl, canvas = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      if (this.fitted) this.fit();
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.count) return;

    var ce = Math.cos(this.el), se = Math.sin(this.el);
    var target = [this.center[0] + this.pan[0], this.center[1] + this.pan[1], this.center[2]];
    var eye = [
      target[0] + this.dist * ce * Math.cos(this.az),
      target[1] + this.dist * ce * Math.sin(this.az),
      target[2] + this.dist * se
    ];

    // Clip planes hug the model: a tight depth range keeps a 1 mm lid top from
    // flickering against the lettering on its far side.
    var reach = this.radius * 1.6 + Math.hypot(this.pan[0], this.pan[1]);
    if (this.bedRanges) {                     // keep the whole bed inside the depth range
      var bd = this.bed;
      reach = Math.max(reach, Math.hypot(Math.abs(bd.cx - target[0]) + bd.w / 2, Math.abs(bd.cy - target[1]) + bd.d / 2,
                                         bd.z - target[2]) + 5);
    }
    var proj = perspective(0.62, w / h, Math.max(this.radius * 0.02, this.dist - reach), this.dist + reach);
    var view = lookAt(eye, target, [0, 0, 1]);
    this._mats = { proj: proj, view: view };

    if (this.bedRanges) this._drawBed(proj, view);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.proj, false, proj);
    gl.uniformMatrix4fv(this.loc.view, false, view);
    gl.uniform3fv(this.loc.eye, new Float32Array(eye));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    var stride = (this.stride || 18) * 4, L = this.loc;
    [[L.pos, 3, 0], [L.nrm, 3, 12], [L.col, 3, 24], [L.tex, 2, 36], [L.bn, 3, 44], [L.ta, 3, 56], [L.kind, 1, 68]]
      .forEach(function (at) {
        if (at[0] < 0) return;
        gl.enableVertexAttribArray(at[0]);
        gl.vertexAttribPointer(at[0], at[1], gl.FLOAT, false, stride, at[2]);
      });
    gl.uniform1i(L.atlas, 0);
    gl.activeTexture(gl.TEXTURE0);

    /* No depth bias needed: an inlay fills a recess cut exactly to its shape,
       so it never shares a same-facing surface with the body. (A bias would
       pull the lid-top lettering through the lid at grazing angles.) */
    var self = this;
    (this.ranges || [{ start: 0, count: this.count }]).forEach(function (r) {
      var at = r.tex && self.atlasTex[r.half];
      gl.uniform1f(L.bump, at ? 1 : 0);
      if (at) {
        gl.bindTexture(gl.TEXTURE_2D, at.tex);
        gl.uniform2f(L.texel, 1 / at.w, 1 / at.h);
        gl.uniform1f(L.texelMM, at.texelMM);
        gl.uniform1f(L.hscale, at.hscale);
      }
      gl.drawArrays(gl.TRIANGLES, r.start, r.count);
    });
    [L.nrm, L.col, L.tex, L.bn, L.ta, L.kind].forEach(function (a) { if (a >= 0) gl.disableVertexAttribArray(a); });

    if (this.lineCount) {
      gl.useProgram(this.lprog);
      gl.uniformMatrix4fv(this.lloc.proj, false, proj);
      gl.uniformMatrix4fv(this.lloc.view, false, view);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
      gl.enableVertexAttribArray(this.lloc.pos);
      gl.vertexAttribPointer(this.lloc.pos, 3, gl.FLOAT, false, 12, 0);
      // Faint where hidden, bright where visible: reads in every pose.
      gl.depthFunc(gl.GREATER);
      gl.uniform4f(this.lloc.color, 0.35, 0.66, 1.0, 0.35);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
      gl.depthFunc(gl.LEQUAL);
      gl.uniform4f(this.lloc.color, 0.35, 0.66, 1.0, 1.0);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      gl.disableVertexAttribArray(this.lloc.pos);
    }
  };

  /* Under everything and translucent, so it reads on light and dark pages
     and never hides the model; it writes no depth, so the model always draws
     over it. */
  WB.Viewer.prototype._drawBed = function (proj, view) {
    var gl = this.gl, R = this.bedRanges;
    gl.useProgram(this.lprog);
    gl.uniformMatrix4fv(this.lloc.proj, false, proj);
    gl.uniformMatrix4fv(this.lloc.view, false, view);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbuf);
    gl.enableVertexAttribArray(this.lloc.pos);
    gl.vertexAttribPointer(this.lloc.pos, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.uniform4f(this.lloc.color, 0.52, 0.58, 0.66, 0.30);
    gl.drawArrays(gl.TRIANGLES, R.plate[0], R.plate[1]);
    gl.uniform4f(this.lloc.color, 0.60, 0.66, 0.74, 0.40);
    if (R.minor[1]) gl.drawArrays(gl.LINES, R.minor[0], R.minor[1]);
    gl.uniform4f(this.lloc.color, 0.60, 0.66, 0.74, 0.70);
    if (R.major[1]) gl.drawArrays(gl.LINES, R.major[0], R.major[1]);
    gl.uniform4f(this.lloc.color, 0.52, 0.58, 0.66, 0.9);
    gl.drawArrays(gl.LINES, R.edge[0], R.edge[1]);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(this.lloc.pos);
  };

  /* ── shading ────────────────────────────────────────────────────── */
  /* One normal per triangle corner: the area-weighted average of the faces
     round that vertex that lie within CREASE of this triangle. Curves and
     textures shade smoothly; box edges and steps stay crisp. Cached on the
     part, so posing the lid doesn't recompute it. */
  var CREASE = Math.cos(35 * Math.PI / 180);

  function cornerNormals(part) {
    if (part._cn) return part._cn;
    var P = part.positions, I = part.indices, nt = I.length / 3, nv = P.length / 3;
    var fn = new Float32Array(nt * 3), fa = new Float32Array(nt);
    for (var t = 0; t < nt; t++) {
      var a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      var vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.hypot(nx, ny, nz) || 1;
      fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len; fa[t] = len;
    }
    // Faces round each vertex, as a compact adjacency list.
    var start = new Uint32Array(nv + 1);
    for (var i = 0; i < I.length; i++) start[I[i] + 1]++;
    for (var v = 0; v < nv; v++) start[v + 1] += start[v];
    var fill = start.slice(0, nv), adj = new Uint32Array(I.length);
    for (var k = 0; k < I.length; k++) adj[fill[I[k]]++] = (k / 3) | 0;

    var out = new Float32Array(I.length * 3);
    for (var j = 0; j < I.length; j++) {
      var tf = (j / 3) | 0, vtx = I[j], sx = 0, sy = 0, sz = 0;
      var fx = fn[tf * 3], fy = fn[tf * 3 + 1], fz = fn[tf * 3 + 2];
      for (var q = start[vtx]; q < start[vtx + 1]; q++) {
        var g = adj[q], gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2];
        if (gx * fx + gy * fy + gz * fz >= CREASE) { sx += gx * fa[g]; sy += gy * fa[g]; sz += gz * fa[g]; }
      }
      var l = Math.hypot(sx, sy, sz);
      if (l < 1e-12) { sx = fx; sy = fy; sz = fz; l = 1; }
      out[j * 3] = sx / l; out[j * 3 + 1] = sy / l; out[j * 3 + 2] = sz / l;
    }
    part._cn = out;
    return out;
  }

  /* ── picking maths ──────────────────────────────────────────────── */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function invert(m) {
    var inv = new Float64Array(16), i;
    inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (Math.abs(det) < 1e-12) return null;
    for (i = 0; i < 16; i++) inv[i] /= det;
    return inv;
  }
  function unproject(inv, x, y, z) {
    var v = [x, y, z, 1], o = [0, 0, 0, 0];
    for (var r = 0; r < 4; r++) for (var k = 0; k < 4; k++) o[r] += inv[k * 4 + r] * v[k];
    return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
  }

})(window.WB);
