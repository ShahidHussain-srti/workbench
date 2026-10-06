# Workbench

The shared parts behind my browser-based maker tools,
[Dabba](https://shahidhussain-srti.github.io/dabba/) and
[Keychain Studio](https://shahidhussain-srti.github.io/keychains/). Anything both of them
needed ended up written twice, so it lives here now, and the next tool can start from it.

It's plain JavaScript with no dependencies and no build step for the apps. Everything
hangs off one global, `WB`.

## What's in it

| File | What it does |
|---|---|
| `base.js` | Small helpers (clamp, paths into objects, ids, debounce), an offscreen canvas pool, the millimetre-to-pixel grid, and coverage masks with union / subtract / intersect |
| `fonts.js` | System font stacks for text, looked up by key |
| `edt.js` | Distance fields, for offsetting outlines and fitting things inside them |
| `contour.js` | Marching squares: a mask in, simplified polygons with holes out |
| `shapes.js` | Outline shapes (rectangle, circle, star, heart, shield…) drawn to a canvas |
| `decor.js` | Decoration as masks: 16 border styles, text boxes and pictures |
| `export.js` | Multi-colour 3MF that Bambu Studio, OrcaSlicer, Creality Print and PrusaSlicer open with colours assigned, plus binary STL |
| `zip.js` | The small ZIP writer the 3MF needs |
| `share.js` | Designs packed into a link (`#d=…`), the share popup, and clipboard helpers |
| `drawpad.js` | A freehand drawing pad in a modal |
| `viewer.js` | A WebGL viewer with orbit controls, smooth shading within a crease angle, bump-shaded textures, overlay lines, and hooks for posing parts and handling clicks |
| `ui.js` | Number fields you can drag like Unity's inspector, the warnings strip, undo/redo, and saving the design across refreshes |
| `css/workbench.css` | The shared look: colour tokens with a light theme, panels, form controls, panes, popups |

## Using it in an app

Each app keeps its own copy in `vendor/workbench/`, so it still works offline, from
`file://`, and from a GitHub "Download ZIP". To update the copies after changing
something here:

```sh
npm test                                   # builds dist/ and runs the checks
node tools/sync.mjs ../dabba ../keychains  # or: npm run sync
```

`vendor/workbench/VERSION` in each app records which version and commit it has. Then
load the two files before the app's own:

```html
<link rel="stylesheet" href="vendor/workbench/workbench.css">
<link rel="stylesheet" href="styles.css">
…
<script src="vendor/workbench/workbench.js"></script>
<script src="src/app.js"></script>
```

A few examples:

```js
// A 3MF with two printable objects, colours assigned per part
WB.export3MF({ app: 'My Tool', title: 'thing', objects: [
  { name: 'base', parts: baseParts }, { name: 'lid', parts: lidParts }
] }).then(blob => WB.download(blob, 'thing.3mf'));

// Undo and redo around your own state
const history = new WB.History({ snapshot, restore,
  undoButton: $('#btn-undo'), redoButton: $('#btn-redo') });
history.bind();
history.begin();   // call just before each change

// Keep the design across refreshes
const session = new WB.Session({ key: 'my-tool.v1', build: buildPayload, load: loadPayload });
```

A part handed to the 3MF writer is `{ positions, indices, color, colorIndex, label }`,
already placed where it should print.

## Development

`npm test` builds `dist/` and runs the checks in node: helpers, masks, distance fields,
contours, ZIP, 3MF structure, STL and share links. The canvas-based parts (text,
pictures, the drawing pad, the UI pieces) are tested through the apps.

`dist/` is committed so the built files are always there to copy.

## License

Copyright © 2026 shahidhussain2k13@gmail.com

Workbench is free software under the **GNU General Public License v3.0 or later**. You can
use it, change it and share it. If you distribute something built from it, including
hosting it on a website, that has to be GPL with its source available too. There's no
warranty. See [LICENSE](LICENSE) for the full text.
