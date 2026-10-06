/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* engine.js — starts the Manifold geometry engine (vendor/manifold.js, loaded
 * with its own <script> tag before this). Manifold's booleans always return
 * watertight, consistently oriented meshes. */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  var started = null;

  /* → Promise of the ready Manifold module (Manifold, CrossSection, Mesh, …).
     Starting it twice hands back the same promise. */
  WB.loadManifold = function () {
    if (started) return started;
    started = new Promise(function (resolve, reject) {
      var bin;
      try {
        var s = atob(window.ManifoldWasmBase64);
        bin = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
      } catch (e) {
        reject(new Error('vendor/workbench/manifold.js is missing or damaged, so nothing can be built.'));
        return;
      }
      window.ManifoldModule({ wasmBinary: bin }).then(function (w) {
        w.setup();
        resolve(w);
      }, function (err) {
        reject(new Error('The geometry engine failed to start: ' + err.message));
      });
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
