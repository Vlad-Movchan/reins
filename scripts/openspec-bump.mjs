#!/usr/bin/env node
// Maintainer script: moves the pinned OpenSpec version.
//
//   node scripts/openspec-bump.mjs --check       exit 1 if npm has a newer `latest` than the pin
//   node scripts/openspec-bump.mjs [version]     pin <version> (default: latest) and print the diff of the
//                                                upstream `spec-driven` schema between old and new pins, so
//                                                the fork in templates/openspec/schemas/sdd can be ported.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'harness.lock.json');
const lock = JSON.parse(await readFile(LOCK, 'utf8'));
const pkg = lock.openspec.package;
const current = lock.openspec.version;

const sh = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', ...opts }).trim();
const latest = sh('npm', ['view', pkg, 'dist-tags.latest']);

if (process.argv.includes('--check')) {
  console.log(`${pkg}: pinned ${current}, latest ${latest}`);
  process.exit(latest === current ? 0 : 1);
}

const target = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : latest;
if (target === current) {
  console.log(`${pkg} already pinned at ${current}`);
  process.exit(0);
}

async function unpack(version) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `openspec-${version}-`));
  const tgz = sh('npm', ['pack', `${pkg}@${version}`, '--silent', '--pack-destination', dir]);
  sh('tar', ['-xzf', path.join(dir, tgz), '-C', dir]);
  return path.join(dir, 'package', 'schemas', lock.openspec.schemaForkedFrom);
}

const [oldDir, newDir] = [await unpack(current), await unpack(target)];
let diff = '';
try {
  diff = sh('diff', ['-ru', oldDir, newDir]);
} catch (e) {
  diff = e.stdout; // diff exits 1 when files differ
}

lock.openspec.version = target;
await writeFile(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log(`Pinned ${pkg} ${current} -> ${target}`);
if (diff) {
  console.log(`\nUpstream "${lock.openspec.schemaForkedFrom}" schema changed. Port what applies into templates/openspec/schemas/sdd:\n`);
  console.log(diff);
} else {
  console.log(`Upstream "${lock.openspec.schemaForkedFrom}" schema unchanged; the sdd fork needs no porting.`);
}
