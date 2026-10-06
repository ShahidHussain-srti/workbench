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
