import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { chooseMode, ciVersion, compatibilityWarning, detectOpenspec } from '../src/lib/openspec.mjs';
import { lock } from '../src/lib/util.mjs';

const pinned = lock().openspec.version;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'sdd-os-'));
const quiet = { interactive: false };

test('new project without OpenSpec defaults to install', async () => {
  const det = { present: false };
  assert.equal(await chooseMode(det, quiet), 'install');
});

test('project with OpenSpec keeps it by default when non-interactive', async () => {
  const dir = tmp();
  mkdirSync(path.join(dir, 'openspec'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { '@fission-ai/openspec': '^2.0.3' } }));
  const det = detectOpenspec(dir);
  assert.equal(det.initialized, true);
  assert.equal(det.declared, '^2.0.3');
  assert.equal(det.present, true);
  assert.equal(await chooseMode(det, quiet), 'existing');
});

test('explicit flag and remembered mode win over detection', async () => {
  const det = { present: true, initialized: true };
  assert.equal(await chooseMode(det, { ...quiet, flag: 'install' }), 'install');
  assert.equal(await chooseMode(det, { ...quiet, previous: 'install' }), 'install');
  assert.equal(await chooseMode({ present: false }, { ...quiet, previous: 'existing' }), 'existing');
  await assert.rejects(chooseMode(det, { ...quiet, flag: 'maybe' }));
});

test('CI uses the project version in existing mode and the pin otherwise', () => {
  assert.equal(ciVersion('existing', { version: '2.0.3' }), '2.0.3');
  assert.equal(ciVersion('install', { version: '2.0.3' }), pinned);
  assert.equal(ciVersion('existing', { version: null }), pinned);
});

test('older major version produces a compatibility warning', () => {
  assert.match(compatibilityWarning({ version: '1.6.0' }), /older than/);
  assert.equal(compatibilityWarning({ version: pinned }), null);
  assert.match(compatibilityWarning({ version: null }), /could not determine/);
});
