/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* fonts.js — system font stacks for text, identified by key. */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  /* Fonts are resolved from the system; each entry is a stack with fallbacks so
     the app still works where a face is missing. Identified by `key`, not by
     position, so the list can grow without changing anyone's saved design. */
  WB.FONTS = [
    // clean
    { key: 'grotesk',   name: 'Grotesk',     group: 'Clean',  css: '"Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif' },
    { key: 'neue',      name: 'Neue Sans',   group: 'Clean',  css: '"Helvetica Neue",Helvetica,Arial,sans-serif' },
    { key: 'futura',    name: 'Futura',      group: 'Clean',  css: 'Futura,"Century Gothic","Avenir Next",sans-serif' },
    { key: 'optima',    name: 'Optima',      group: 'Clean',  css: 'Optima,Candara,"Gill Sans","Trebuchet MS",sans-serif' },
    { key: 'rounded',   name: 'Rounded',     group: 'Clean',  css: '"Arial Rounded MT Bold",Nunito,"Trebuchet MS",sans-serif' },
    { key: 'condensed', name: 'Condensed',   group: 'Clean',  css: '"Arial Narrow","Avenir Next Condensed","Helvetica Neue",sans-serif' },
    { key: 'wideblack', name: 'Wide Black',  group: 'Clean',  css: '"Arial Black","Arial Bold",Gadget,sans-serif' },

    // serif
    { key: 'serif',     name: 'Serif',       group: 'Serif',  css: 'Georgia,"Times New Roman",serif' },
    { key: 'baskerville', name: 'Baskerville', group: 'Serif', css: 'Baskerville,"Libre Baskerville",Georgia,serif' },
    { key: 'cochin',    name: 'Cochin',      group: 'Serif',  css: 'Cochin,"Hoefler Text",Georgia,serif' },
    { key: 'elegant',   name: 'Elegant',     group: 'Serif',  css: 'Didot,"Bodoni 72","Playfair Display",Georgia,serif' },
    { key: 'slab',      name: 'Slab',        group: 'Serif',  css: 'Rockwell,"Courier New",Georgia,serif' },
    { key: 'clarendon', name: 'Fat Slab',    group: 'Serif',  css: 'Superclarendon,"Rockwell Extra Bold",Rockwell,Georgia,serif' },
    { key: 'copperplate', name: 'Copperplate', group: 'Serif', css: 'Copperplate,"Copperplate Gothic Light",Optima,serif' },

    // display / fun
    { key: 'impact',    name: 'Impact',      group: 'Display', css: 'Impact,Haettenschweiler,"Arial Black",sans-serif' },
    { key: 'stencil',   name: 'Stencil',     group: 'Display', css: 'Stencil,"Stencil Std","Arial Black",fantasy' },
    { key: 'phosphate', name: 'Phosphate',   group: 'Display', css: 'Phosphate,"Arial Narrow Bold",Impact,sans-serif' },
    { key: 'playbill',  name: 'Playbill',    group: 'Display', css: 'Playbill,Rockwell,"Arial Black",fantasy' },
    { key: 'luminari',  name: 'Luminari',    group: 'Display', css: 'Luminari,Herculanum,Papyrus,fantasy' },
    { key: 'herculanum',name: 'Herculanum',  group: 'Display', css: 'Herculanum,Luminari,Copperplate,fantasy' },
    { key: 'papyrus',   name: 'Papyrus',     group: 'Display', css: 'Papyrus,Herculanum,fantasy' },
    { key: 'jazz',      name: 'Jazz',        group: 'Display', css: '"Jazz LET","Party LET",Impact,fantasy' },
    { key: 'party',     name: 'Party',       group: 'Display', css: '"Party LET","Jazz LET","Comic Sans MS",fantasy' },
    { key: 'krungthep', name: 'Techno',      group: 'Display', css: 'Krungthep,"Silom","Courier New",monospace' },
    { key: 'bauhaus',   name: 'Geometric',   group: 'Display', css: '"Bauhaus 93","Century Gothic",Futura,sans-serif' },

    // script + hand
    { key: 'script',    name: 'Script',      group: 'Script & hand', css: '"Snell Roundhand","Brush Script MT",cursive' },
    { key: 'savoye',    name: 'Savoye',      group: 'Script & hand', css: '"Savoye LET","Snell Roundhand","Brush Script MT",cursive' },
    { key: 'zapfino',   name: 'Flourish',    group: 'Script & hand', css: 'Zapfino,"Savoye LET","Snell Roundhand",cursive' },
    { key: 'signpainter', name: 'Sign Painter', group: 'Script & hand', css: 'SignPainter,"Brush Script MT","Marker Felt",cursive' },
    { key: 'trattatello', name: 'Quill',     group: 'Script & hand', css: 'Trattatello,Herculanum,Papyrus,fantasy' },
    { key: 'hand',      name: 'Handwriting', group: 'Script & hand', css: '"Bradley Hand","Comic Sans MS",cursive' },
    { key: 'noteworthy',name: 'Noteworthy',  group: 'Script & hand', css: 'Noteworthy,"Bradley Hand","Comic Sans MS",cursive' },
    { key: 'marker',    name: 'Marker',      group: 'Script & hand', css: '"Marker Felt","Comic Sans MS",cursive' },
    { key: 'chalk',     name: 'Chalk',       group: 'Script & hand', css: 'Chalkduster,"Chalkboard SE","Comic Sans MS",fantasy' },
    { key: 'chalkboard',name: 'Chalkboard',  group: 'Script & hand', css: '"Chalkboard SE",Chalkboard,"Comic Sans MS",sans-serif' },
    { key: 'comic',     name: 'Comic',       group: 'Script & hand', css: '"Comic Sans MS","Chalkboard SE",cursive' },
    { key: 'skia',      name: 'Skia',        group: 'Script & hand', css: 'Skia,"Gill Sans","Trebuchet MS",sans-serif' },

    // mono
    { key: 'mono',      name: 'Monospace',   group: 'Mono',   css: '"SF Mono",Menlo,Consolas,"Courier New",monospace' },
    { key: 'typewriter',name: 'Typewriter',  group: 'Mono',   css: '"American Typewriter","Courier New",monospace' },

    /* Motorcycle marques all use commissioned typefaces that are licensed, not
       installed, and cannot be shipped here. Each stack asks for the real family
       first — so it is used if you happen to own it — then falls back to the
       closest face macOS provides. Names say "-ish" because that is what they
       are: look-alikes, not the originals. */
    { key: 'moto-cruiser', name: 'Cruiser Slab (H-D-ish)', group: 'Motorcycle style',
      css: '"Harley Script",Superclarendon,"Rockwell Extra Bold",Rockwell,"Bookman Old Style",serif' },
    { key: 'moto-race',    name: 'Race Italic (Ducati-ish)', group: 'Motorcycle style',
      css: '"Ducati Bold",Futura,"Avenir Next Condensed","Century Gothic",sans-serif' },
    { key: 'moto-condensed', name: 'Race Condensed (KTM-ish)', group: 'Motorcycle style',
      css: '"KTM Sans","Avenir Next Condensed","Arial Narrow",Impact,sans-serif' },
    { key: 'moto-touring', name: 'Touring Sans (BMW-ish)', group: 'Motorcycle style',
      css: '"BMW Motorrad","Helvetica Neue",Helvetica,Arial,sans-serif' },
    { key: 'moto-geo',     name: 'Geometric (Honda-ish)', group: 'Motorcycle style',
      css: '"Honda Sans",Futura,"Century Gothic","Avenir Next",sans-serif' },
    { key: 'moto-heritage', name: 'Heritage Serif (Triumph-ish)', group: 'Motorcycle style',
      css: '"Triumph Sans",Cochin,Baskerville,"Hoefler Text",Georgia,serif' },
    { key: 'moto-script',  name: 'Retro Script (Indian-ish)', group: 'Motorcycle style',
      css: '"Indian Script","Snell Roundhand","Savoye LET","Brush Script MT",cursive' },
    { key: 'moto-enduro',  name: 'Enduro Stencil', group: 'Motorcycle style',
      css: 'Stencil,"Stencil Std","Arial Black",Impact,fantasy' }
  ];

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
