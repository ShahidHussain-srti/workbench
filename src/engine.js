/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* engine.js — starts the Manifold geometry engine (vendor/manifold.js, loaded
 * with its own <script> tag before this, and its wasm). Manifold's booleans
 * always return watertight, consistently oriented meshes. */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  var started = null;

  /* The engine's wasm sits next to this script. Served over http(s) it is
     fetched straight away, while the app sets itself up, and compiled as it
     streams in; from file://, where fetch() is refused, its base64 copy
     (manifold-wasm.js) is loaded as a script instead. */
  var here = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  var dir = here.replace(/[^/]*$/, '');
  var online = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && typeof fetch === 'function';
  var early = online ? fetch(dir + 'manifold.wasm').catch(function () { return null; }) : null;

  function fromBase64() {
    var s = atob(window.ManifoldWasmBase64), bin = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    return bin;
  }
  function viaScript() {
    if (window.ManifoldWasmBase64) return Promise.resolve(fromBase64());
    return new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = dir + 'manifold-wasm.js';
      tag.onload = function () { window.ManifoldWasmBase64 ? resolve(fromBase64()) : reject(new Error('empty')); };
      tag.onerror = function () { reject(new Error('missing')); };
      document.head.appendChild(tag);
    });
  }
  /* Emscripten's hook for doing the instantiation ourselves: streaming when
     the server says application/wasm, else from the bytes. */
  function streaming(imports, done) {
    early.then(function (res) {
      if (!res || !res.ok) throw new Error('no wasm');
      var copy = res.clone();
      return WebAssembly.instantiateStreaming(res, imports).catch(function () {
        return copy.arrayBuffer().then(function (b) { return WebAssembly.instantiate(b, imports); });
      });
    }).catch(function () {
      return viaScript().then(function (bin) { return WebAssembly.instantiate(bin, imports); });
    }).then(function (r) { done(r.instance, r.module); }, function (err) {
      started = null;
      failed(err);
    });
    return {};
  }
  var failed = function () {};

  /* → Promise of the ready Manifold module (Manifold, CrossSection, Mesh, …).
     Starting it twice hands back the same promise. */
  WB.loadManifold = function () {
    if (started) return started;
    var damaged = new Error('vendor/workbench/manifold.js or its wasm is missing or damaged, so nothing can be built.');
    started = new Promise(function (resolve, reject) {
      if (typeof window.ManifoldModule !== 'function') { reject(damaged); return; }
      failed = function () { reject(damaged); };
      var boot = function (opts) {
        window.ManifoldModule(opts).then(function (w) {
          w.setup();
          resolve(w);
        }, function (err) {
          reject(new Error('The geometry engine failed to start: ' + err.message));
        });
      };
      if (early) { boot({ instantiateWasm: streaming }); return; }
      viaScript().then(function (bin) { boot({ wasmBinary: bin }); }, function () { reject(damaged); });
    });
    return started;
  };

  /* A Manifold solid → a part's flat positions and triangle indices. */
  WB.meshOf = function (solid) {
    var m = solid.getMesh(), np = m.numProp;
    var nv = m.vertProperties.length / np, pos = new Float32Array(nv * 3);
    for (var i = 0; i < nv; i++) {
      pos[i * 3] = m.vertProperties[i * np];
      pos[i * 3 + 1] = m.vertProperties[i * np + 1];
      pos[i * 3 + 2] = m.vertProperties[i * np + 2];
    }
    return { positions: pos, indices: new Uint32Array(m.triVerts) };
  };

})(window.WB);
