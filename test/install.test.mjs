import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyFiles } from '../src/lib/install.mjs';

const read = (dir, f) => readFileSync(path.join(dir, f), 'utf8');

test('fresh install writes every file and a manifest', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sdd-install-'));
  const report = await applyFiles(dir);
  assert.equal(report.conflicts.length, 0);
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/skills/grilling/SKILL.md', 'openspec/schemas/sdd/schema.yaml', '.sdd/manifest.json']) {
    assert.ok(existsSync(path.join(dir, f)), f);
  }
  assert.match(read(dir, '.gitignore'), /^\.env$/m);
  assert.match(read(dir, '.github/workflows/sdd-spec-gate.yml'), /@fission-ai\/openspec@\d+\.\d+\.\d+/);
});

test('update keeps project text, settings and local edits', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sdd-install-'));
  writeFileSync(path.join(dir, 'AGENTS.md'), '# My project\n\nOur own rules.\n');
  await applyFiles(dir);
  assert.match(read(dir, 'AGENTS.md'), /Our own rules[\s\S]*sdd-harness:begin/);

  const settingsFile = path.join(dir, '.claude/settings.json');
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  settings.permissions.allow.push('Bash(make test)');
  writeFileSync(settingsFile, JSON.stringify(settings));
  appendFileSync(path.join(dir, '.claude/skills/trace-why/SKILL.md'), '\nlocal note\n');
  writeFileSync(path.join(dir, 'openspec/config.yaml'), 'schema: sdd\ncontext: mine\n');

  const report = await applyFiles(dir, { isUpdate: true });
  const merged = JSON.parse(readFileSync(settingsFile, 'utf8'));
  assert.ok(merged.permissions.allow.includes('Bash(make test)'));
  assert.equal(merged.hooks.PreToolUse.filter((h) => JSON.stringify(h).includes('sdd-protect-secrets')).length, 1);
  assert.deepEqual(report.conflicts, ['.claude/skills/trace-why/SKILL.md']);
  assert.ok(existsSync(path.join(dir, '.claude/skills/trace-why/SKILL.md.sdd-new')));
  assert.match(read(dir, '.claude/skills/trace-why/SKILL.md'), /local note/);
  assert.equal(read(dir, 'openspec/config.yaml'), 'schema: sdd\ncontext: mine\n');
});

test('deleted managed files and "exclude" globs stay out on update', async () => {
  const { rmSync } = await import('node:fs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sdd-install-'));
  await applyFiles(dir);
  rmSync(path.join(dir, '.github/workflows/sdd-confluence-sync.yml'));
  const cfgFile = path.join(dir, '.sdd/harness.json');
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
  cfg.exclude = ['.github/workflows/sdd-ci-triage.yml', '.claude/skills/spec-compaction/**'];
  writeFileSync(cfgFile, JSON.stringify(cfg));
  rmSync(path.join(dir, '.github/workflows/sdd-ci-triage.yml'));
  rmSync(path.join(dir, '.claude/skills/spec-compaction'), { recursive: true });

  const report = await applyFiles(dir, { isUpdate: true });
  for (const f of ['.github/workflows/sdd-confluence-sync.yml', '.github/workflows/sdd-ci-triage.yml', '.claude/skills/spec-compaction/SKILL.md']) {
    assert.ok(!existsSync(path.join(dir, f)), f);
    assert.ok(report.excluded.includes(f), f);
  }
  assert.ok(existsSync(path.join(dir, '.github/workflows/sdd-spec-gate.yml')));
});
