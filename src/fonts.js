/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* fonts.js — the text fonts, bundled and loaded when used, identified by key. */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  /* Every font ships with the library (fonts/<key>.js, the Latin regular of a
     Google Font under the OFL or Apache licence; see fonts/LICENSE-fonts.txt),
     so a design looks the same on every machine instead of falling back to
     whatever is installed. Identified by `key`, not position, so the list can
     grow without changing anyone's saved design; older keys keep their place
     with a face of their own. `css` is the stack, `fb` the fallback while the
     font loads. Bold and italic are synthesised from the regular. */
  var F = function (key, name, group, fb) { return { key: key, name: name, group: group, css: '"WB ' + key + '",' + fb }; };
  WB.FONTS = [
    F('grotesk', 'Inter', 'Clean', 'sans-serif'),
    F('neue', 'Space Grotesk', 'Clean', 'sans-serif'),
    F('futura', 'Jost', 'Clean', 'sans-serif'),
    F('skia', 'Josefin Sans', 'Clean', 'sans-serif'),
    F('optima', 'Belleza', 'Clean', 'sans-serif'),
    F('rounded', 'Fredoka', 'Clean', 'sans-serif'),
    F('bauhaus', 'Comfortaa', 'Clean', 'sans-serif'),
    F('condensed', 'Oswald', 'Clean', 'sans-serif'),
    F('wideblack', 'Archivo Black', 'Clean', 'sans-serif'),

    F('serif', 'Lora', 'Serif', 'serif'),
    F('baskerville', 'Libre Baskerville', 'Serif', 'serif'),
    F('cochin', 'EB Garamond', 'Serif', 'serif'),
    F('elegant', 'Playfair Display', 'Serif', 'serif'),
    F('slab', 'Zilla Slab', 'Serif', 'serif'),
    F('clarendon', 'Alfa Slab One', 'Serif', 'serif'),
    F('copperplate', 'Cinzel', 'Serif', 'serif'),
    F('herculanum', 'Cinzel Decorative', 'Serif', 'serif'),
    F('fraktur', 'UnifrakturMaguntia', 'Serif', 'serif'),

    F('impact', 'Anton', 'Display', 'sans-serif'),
    F('sixcaps', 'Six Caps', 'Display', 'sans-serif'),
    F('stencil', 'Stardos Stencil', 'Display', 'sans-serif'),
    F('phosphate', 'Bungee', 'Display', 'sans-serif'),
    F('playbill', 'Rye', 'Display', 'serif'),
    F('luminari', 'MedievalSharp', 'Display', 'serif'),
    F('papyrus', 'Uncial Antiqua', 'Display', 'serif'),
    F('jazz', 'Righteous', 'Display', 'sans-serif'),
    F('party', 'Bangers', 'Display', 'sans-serif'),
    F('krungthep', 'Orbitron', 'Display', 'sans-serif'),
    F('shrikhand', 'Shrikhand', 'Display', 'serif'),

    F('script', 'Great Vibes', 'Script & hand', 'cursive'),
    F('savoye', 'Pinyon Script', 'Script & hand', 'cursive'),
    F('zapfino', 'Alex Brush', 'Script & hand', 'cursive'),
    F('signpainter', 'Yellowtail', 'Script & hand', 'cursive'),
    F('pacifico', 'Pacifico', 'Script & hand', 'cursive'),
    F('trattatello', 'IM Fell English', 'Script & hand', 'serif'),
    F('hand', 'Caveat', 'Script & hand', 'cursive'),
    F('noteworthy', 'Patrick Hand', 'Script & hand', 'cursive'),
    F('marker', 'Permanent Marker', 'Script & hand', 'cursive'),
    F('chalk', 'Cabin Sketch', 'Script & hand', 'cursive'),
    F('chalkboard', 'Schoolbell', 'Script & hand', 'cursive'),
    F('comic', 'Comic Neue', 'Script & hand', 'cursive'),

    F('mono', 'JetBrains Mono', 'Mono', 'monospace'),
    F('typewriter', 'Special Elite', 'Mono', 'monospace'),
    F('pixel', 'Press Start 2P', 'Mono', 'monospace'),

    F('creepster', 'Creepster', 'Fun & odd', 'fantasy'),
    F('eater', 'Eater', 'Fun & odd', 'fantasy'),
    F('monoton', 'Monoton', 'Fun & odd', 'fantasy'),
    F('bungeeshade', 'Bungee Shade', 'Fun & odd', 'fantasy'),
    F('rampart', 'Rampart One', 'Fun & odd', 'fantasy'),
    F('glitch', 'Rubik Glitch', 'Fun & odd', 'fantasy'),
    F('moonrocks', 'Rubik Moonrocks', 'Fun & odd', 'fantasy'),
    F('bubbles', 'Rubik Bubbles', 'Fun & odd', 'fantasy'),
    F('frijole', 'Frijole', 'Fun & odd', 'fantasy'),
    F('faster', 'Faster One', 'Fun & odd', 'fantasy'),
    F('lucky', 'Luckiest Guy', 'Fun & odd', 'fantasy'),
    F('chewy', 'Chewy', 'Fun & odd', 'fantasy'),
    F('diner', 'Fontdiner Swanky', 'Fun & odd', 'fantasy'),
    F('barriecito', 'Barriecito', 'Fun & odd', 'fantasy'),
    F('ewert', 'Ewert', 'Fun & odd', 'fantasy'),

    /* The marques' own typefaces are licensed, not free, so these are open
       fonts in the same spirit, not copies. */
    F('moto-cruiser', 'Graduate (cruiser)', 'Motorcycle style', 'serif'),
    F('moto-race', 'Russo One (race)', 'Motorcycle style', 'sans-serif'),
    F('moto-condensed', 'Teko (race condensed)', 'Motorcycle style', 'sans-serif'),
    F('moto-touring', 'Barlow (touring)', 'Motorcycle style', 'sans-serif'),
    F('moto-geo', 'Kanit (geometric)', 'Motorcycle style', 'sans-serif'),
    F('moto-heritage', 'Abril Fatface (heritage)', 'Motorcycle style', 'serif'),
    F('moto-script', 'Lobster (retro script)', 'Motorcycle style', 'cursive'),
    F('moto-enduro', 'Black Ops One (enduro)', 'Motorcycle style', 'fantasy')
  ];

  /* Loading. Each font is a script calling WB.fontData with its bytes, which
     works from file:// too (a font file fetched by URL would not); the face
     is added from memory. 'wbfont' fires on window as each one arrives, so
     the app can redraw; WB.fontEpoch counts them, for cache keys. */
  var base = (function () {
    var s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]*$/, '') : '';
  })();
  var loading = {}, done = {}, ready = {};
  WB.fontEpoch = 0;
  WB.fontData = function (key, b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var face = new FontFace('WB ' + key, u.buffer);
    face.load().then(function () {
      document.fonts.add(face);
      ready[key] = true;
      WB.fontEpoch++;
      window.dispatchEvent(new CustomEvent('wbfont', { detail: key }));
    }, function () { /* unreadable: the fallback stays */ }).then(function () { if (done[key]) done[key](); });
  };
  /* Starts loading a font (a key or legacy index) if it hasn't, and resolves
     once it is in, or once it has failed and the fallback is all there is. */
  WB.loadFont = function (k) {
    var key = WB.fontKey(k);
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
    if (!loading[key]) {
      loading[key] = new Promise(function (resolve) {
        done[key] = resolve;
        var s = document.createElement('script');
        s.src = base + 'fonts/' + key + '.js';
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    return loading[key];
  };
  WB.fontReady = function (k) { return !!ready[WB.fontKey(k)]; };
  WB.loadFonts = function (keys) { return Promise.all((keys || []).map(WB.loadFont)); };

  /* v1/v2 designs stored the font as an index into this exact order. */
  var LEGACY_FONTS = ['grotesk', 'neue', 'rounded', 'wideblack', 'condensed', 'serif',
                      'slab', 'elegant', 'mono', 'impact', 'script', 'hand', 'chalk',
                      'typewriter', 'copperplate', 'marker'];

  WB.fontByKey = function (key) {
    for (var i = 0; i < WB.FONTS.length; i++) if (WB.FONTS[i].key === key) return WB.FONTS[i];
    return WB.FONTS[0];
  };

  /* Accepts a key, or a legacy numeric index, and always returns a key. */
  WB.fontKey = function (v) {
    if (typeof v === 'number') return LEGACY_FONTS[v] || LEGACY_FONTS[0];
    return WB.fontByKey(v).key;
  };
})(window.WB);
