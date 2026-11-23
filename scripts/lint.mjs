#!/usr/bin/env node
// Syntax-checks every .mjs file and validates every JSON file (no dependencies).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'vendor']);
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let failed = 0;
for (const file of walk('.')) {
  if (file.endsWith('.mjs')) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      failed++;
      console.error(`✗ ${file}\n${r.stderr}`);
    }
  } else if (file.endsWith('.json')) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      failed++;
      console.error(`✗ ${file}: ${e.message}`);
    }
  }
}
if (failed) process.exit(1);
console.log('lint ok');
