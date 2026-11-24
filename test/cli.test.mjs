import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const bin = new URL('../bin/reins.mjs', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const cli = (...args) => execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }).trim();

test('--version and -v print the package version', () => {
  assert.equal(cli('--version'), version);
  assert.equal(cli('-v'), version);
});

test('--help prints usage', () => {
  assert.match(cli('--help'), /^reins .*\n\nUsage:/);
});
