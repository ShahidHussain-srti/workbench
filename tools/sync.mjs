/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* sync.mjs — copy the built library into an app: node tools/sync.mjs ../dabba
 * Apps keep their own copy in vendor/workbench/, so they still work offline,
 * from file://, and from a GitHub "Download ZIP", with no build step. */
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const apps = process.argv.slice(2);
if (!apps.length) { console.error('usage: node tools/sync.mjs <app dir> [...]'); process.exit(1); }

execSync('node tools/build.mjs', { cwd: root, stdio: 'inherit' });
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
for (const app of apps) {
  const out = join(resolve(app), 'vendor/workbench');
  mkdirSync(out, { recursive: true });
  for (const f of ['workbench.js', 'workbench.css']) copyFileSync(join(root, 'dist', f), join(out, f));
  for (const f of ['manifold.js', 'LICENSE-manifold.txt']) copyFileSync(join(root, 'vendor', f), join(out, f));
  copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE'));
  writeFileSync(join(out, 'VERSION'), `${pkg.version}${commit ? ' (' + commit + ')' : ''}\n`);
  console.log('synced', pkg.version, commit, '→', out);
}
