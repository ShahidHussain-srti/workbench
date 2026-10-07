/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* run.mjs — checks for the parts that run without a browser: helpers, masks,
 * distance fields, contour tracing, the ZIP writer, 3MF export and share
 * links. Loads the built bundle, the same file apps ship. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
vm.runInThisContext(readFileSync(join(root, 'dist/workbench.js'), 'utf8'), { filename: 'workbench.js' });
const WB = globalThis.WB;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
export const section = name => console.log('\n' + name);

section('base');
ok(WB.clamp(5, 0, 3) === 3 && WB.clamp(-1, 0, 3) === 0, 'clamp');
ok(WB.tidy(0.1 + 0.2) === 0.3, 'tidy removes float dust');
{
  const st = { colors: { base: 'url(https://evil.example/x)', lid: '#abc' }, texts: [{ color: 'red;background:url(x)' }, { color: '#112233' }], name: 'url(x)' };
  WB.cleanColours(st, { colors: { base: '#2f6db5', lid: '#ffffff' } });
  ok(st.colors.base === '#2f6db5' && st.colors.lid === '#abc' && st.texts[0].color === '#808080' && st.texts[1].color === '#112233' && st.name === 'url(x)',
     'cleanColours keeps hex colours, resets anything else, leaves other strings');
  ok(WB.isImageData('data:image/png;base64,iVBORw0KGgo=') && !WB.isImageData('https://evil.example/x.png') &&
     !WB.isImageData('data:image/svg+xml;base64,PHN2Zz4='), 'isImageData takes inline raster data only');
  const o = { a: 5000, b: 'x', c: null, d: -3 };
  WB.clampField(o, 'a', 1, 400, 10); WB.clampField(o, 'b', 1, 400, 10); WB.clampField(o, 'c', 1, 400, 10); WB.clampField(o, 'd', 0, 4, 1);
  ok(o.a === 400 && o.b === 10 && o.c === null && o.d === 0, 'clampField keeps numbers in range');
}
{
  const base = { a: 1, b: { c: 2, d: [1, 2] }, e: 'x' }, obj = { a: 1, b: { c: 3, d: [1, 2] }, e: 'y', f: 0.123456 };
  const d = WB.shareDiff(base, obj);
  ok(JSON.stringify(d) === '{"b":{"c":3},"e":"y","f":0.1235}', 'shareDiff keeps only the changes');
  const back = WB.sharePatch(base, d);
  ok(back.a === 1 && back.b.c === 3 && back.b.d.length === 2 && back.e === 'y', 'sharePatch lays them back over the defaults');
  ok(WB.shareDiff(base, JSON.parse(JSON.stringify(base))) === undefined, 'no changes, no diff');
  const dropped = WB.sharePatch({ m: { a: 1 }, k: 2 }, WB.shareDiff({ m: { a: 1 }, k: 2 }, { m: {}, k: 2 }));
  ok(JSON.stringify(dropped.m) === '{}', 'an emptied object survives the round trip');
  const evil = WB.sharePatch({}, JSON.parse('{"__proto__":{"polluted":1}}'));
  ok(({}).polluted === undefined && evil.polluted === undefined, 'sharePatch ignores __proto__');
}
ok(WB.borderReach({ style: 'double', shape: 'follow', inset: 1, width: 0.8, gap: 0.6 }) === 3.2 &&
   WB.borderReach({ style: 'none' }) === 0, 'borderReach: where the border ink ends inside the plate');
{
  const lines = { x: [0, 10, { v: 20, centre: true }], y: [5] };
  const s1 = WB.snapBox({ x0: 9.4, x1: 12, y0: 0, y1: 2 }, lines, 1);
  ok(s1.x && Math.abs(s1.dx - 0.6) < 1e-9 && !s1.y && s1.dy === 0, 'snapBox lands the nearest edge on a line');
  const s2 = WB.snapBox({ x0: 18, x1: 20.5, y0: 4, y1: 6 }, lines, 1);
  ok(Math.abs(s2.dx - 0.75) < 1e-9 && s2.y && s2.dy === 0, 'snapBox: centre-only lines take the centre, centres snap too');
  const g = WB.boxGuides({ x0: 10, x1: 14, y0: 3, y1: 7 }, lines);
  ok(g.x.join() === '10' && g.y.join() === '5', 'boxGuides lists the lines the box sits on');
}
const o = { a: { b: 1 } }; WB.set(o, 'a.b', 2);
ok(WB.get(o, 'a.b') === 2 && WB.get(o, 'a.x.y') === undefined, 'get / set by path');
ok(WB.newId('s') !== WB.newId('s'), 'ids are unique');
ok(WB.hexToRgb('#ff8000').map(v => Math.round(v * 255)).join() === '255,128,0', 'hexToRgb');
const g = WB.makeGrid(20, 10, 4);
ok(g.cols === Math.ceil(28 * 4) && near(g.mmx(g.px(3.5)), 3.5, 1e-9) && near(g.mmy(g.py(-2)), -2, 1e-9), 'grid maps mm ↔ px both ways');

section('masks');
function disc(g, cx, cy, r) {
  const m = WB.mask.make(g);
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
    const d = Math.hypot(g.mmx(x + 0.5) - cx, g.mmy(y + 0.5) - cy);
    m[y * g.cols + x] = WB.clamp(r - d + 0.5 / g.ppmm, 0, 1 / g.ppmm) * g.ppmm;
  }
  return m;
}
const G = WB.makeGrid(40, 40, 8);
const A = disc(G, 0, 0, 10), B = disc(G, 5, 0, 10);
ok(near(WB.mask.area(A, G), Math.PI * 100, 2), 'disc area ≈ πr²');
ok(WB.mask.area(WB.mask.union(A, B), G) > WB.mask.area(A, G), 'union grows');
ok(WB.mask.area(WB.mask.sub(A, B), G) < WB.mask.area(A, G), 'subtraction shrinks');
ok(WB.mask.empty(WB.mask.sub(A, A)), 'a − a is empty');
const M = WB.mirrorMaskX(disc(G, 8, 0, 3), G);
ok(M[G.cols * Math.round(G.py(0)) + Math.round(G.px(-8))] > 0.5, 'mirror flips left ↔ right');

section('distance field and contours');
const d = WB.sdf(A, G);
const ci = Math.round(G.py(0)) * G.cols + Math.round(G.px(0));
ok(near(d[ci], 10, 0.5), 'distance at the centre ≈ radius');
const polys = WB.contours(A, G);
ok(polys.length === 1 && polys[0].holes.length === 0, 'one disc → one outline, no holes');
ok(near(Math.abs(WB.ringArea(polys[0].outer)), Math.PI * 100, 3), 'outline area matches');
const ring = WB.mask.sub(A, disc(G, 0, 0, 5));
const rp = WB.contours(ring, G);
ok(rp.length === 1 && rp[0].holes.length === 1, 'a ring has one hole');

section('zip');
const blob = await WB.zip([{ name: 'a.txt', data: new TextEncoder().encode('hello hello hello hello') }, { name: 'dir/b.txt', data: new TextEncoder().encode('world') }]);
const buf = Buffer.from(await blob.arrayBuffer());
function unzip(b) {
  const out = {};
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const method = b.readUInt16LE(p + 8), csize = b.readUInt32LE(p + 18), nlen = b.readUInt16LE(p + 26), xlen = b.readUInt16LE(p + 28);
    const name = b.slice(p + 30, p + 30 + nlen).toString();
    const data = b.slice(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString();
    p += 30 + nlen + xlen + csize;
  }
  return out;
}
const files = unzip(buf);
ok(files['a.txt'] === 'hello hello hello hello' && files['dir/b.txt'] === 'world', 'zip round-trips');
ok(WB.crc32(new TextEncoder().encode('hello')) >>> 0 === 0x3610a686, 'crc32');

section('3MF export');
const cube = (x0, color, colorIndex, label) => {
  const P = [], I = [];
  const v = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(q => [q[0] * 10 + x0, q[1] * 10, q[2] * 10]);
  v.forEach(q => P.push(...q));
  [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].forEach(t => I.push(...t));
  return { positions: new Float32Array(P), indices: new Uint32Array(I), color, colorIndex, label };
};
const mf = await WB.export3MF({ app: 'Test App', title: 'two & things', objects: [
  { name: 'left', parts: [cube(0, '#ff0000', 4, 'red'), cube(0, '#00ff00', 1, 'green')] },
  { name: 'right', parts: [cube(20, '#00ff00', 1, 'green 2')] },
  { name: 'empty', parts: [] }
] });
const z = unzip(Buffer.from(await mf.arrayBuffer()));
const model = z['3D/3dmodel.model'], settings = z['Metadata/model_settings.config'], pe = z['Metadata/Slic3r_PE_model.config'];
ok(model.includes('<metadata name="Application">Test App</metadata>') && model.includes('two &amp; things'), 'app and escaped title');
ok((model.match(/<item /g) || []).length === 2, 'two build items (empty object dropped)');
ok((model.match(/<component /g) || []).length === 3, 'three colour parts as components');
const extr = [...settings.matchAll(/<part id="(\d+)"[\s\S]*?key="extruder" value="(\d+)"/g)].map(m => m[2]).join();
ok(extr === '1,2,2', 'extruders numbered densely in order of use (palette 4 → 1, palette 1 → 2)');
ok(model.includes('name="Colour 1" displaycolor="#FF0000FF"'), 'colour names follow extruder numbers');
ok(pe.includes('firstid="0" lastid="11"') && pe.includes('firstid="12" lastid="23"'), 'PrusaSlicer triangle ranges per object');
ok(JSON.parse(z['Metadata/project_settings.config']).filament_colour.join() === '#FF0000,#00FF00', 'filament swatches');
const stl = Buffer.from(await WB.exportSTL([cube(-5, '#000', 0, 'a')], 'hdr').arrayBuffer());
let minx = 1e9; for (let t = 0; t < 12; t++) for (let k = 0; k < 3; k++) minx = Math.min(minx, stl.readFloatLE(84 + t * 50 + 12 + k * 12));
ok(stl.readUInt32LE(80) === 12 && minx === 0 && stl.slice(0, 3).toString() === 'hdr', 'STL: 12 triangles, moved to the origin, header');

section('share links');
const design = { app: 'test', state: { name: 'pump case', list: [1, 2, 3], nested: { a: 'ü✓' } } };
const hash = await WB.shareEncode(design);
ok(hash.startsWith('#d=1.') && !/[+/=]/.test(hash.slice(5)), 'compressed, URL-safe');
ok(JSON.stringify(await WB.shareDecode('https://x.test/app/' + hash)) === JSON.stringify(design), 'decodes back exactly');
ok((await WB.shareDecode('#nothing')) === null, 'a link without a design gives null');
let threw = false; try { await WB.shareDecode('#d=1.garbage!!'); } catch { threw = true; }
ok(threw, 'a damaged link throws');

export { WB, ok, near, unzip, pass, fail };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const more = join(root, 'test/more.mjs');
  try { readFileSync(more); await import(more); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
