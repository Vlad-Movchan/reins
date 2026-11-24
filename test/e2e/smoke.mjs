#!/usr/bin/env node
// End-to-end smoke test: installs the harness into throwaway git repositories with real OpenSpec
// from npm and walks a change through the lifecycle. Needs network. Run: npm run test:e2e
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'specjig.mjs');
const LOCK = JSON.parse(readFileSync(path.resolve(path.dirname(CLI), '..', 'harness.lock.json'), 'utf8'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'e2e', GIT_AUTHOR_EMAIL: 'e2e@example.com', GIT_COMMITTER_NAME: 'e2e', GIT_COMMITTER_EMAIL: 'e2e@example.com' };

function sh(cwd, cmd, args, { ok = true } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (ok && r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const harness = (cwd, ...args) => sh(cwd, process.execPath, [CLI, ...args]).stdout;
const openspec = (cwd, ...args) => sh(cwd, 'npx', ['openspec', ...args]);

function repo(name) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `sdd-e2e-${name}-`));
  sh(dir, 'git', ['init', '-q']);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, private: true }) + '\n');
  writeFileSync(path.join(dir, '.env'), 'NOT_A_REAL_SECRET=1\n');
  return dir;
}

function writeChange(dir, id) {
  const c = path.join(dir, 'openspec', 'changes', id);
  mkdirSync(path.join(c, 'specs', 'data-export'), { recursive: true });
  writeFileSync(path.join(c, 'proposal.md'), `# Proposal\n\n## Why\nUsers need their orders outside the product.\n\n## What Changes\n- Add CSV export.\n\n## Capabilities\n### New Capabilities\n- \`data-export\`: exporting user data\n\n## Impact\n- backend\n\n## Risk\nLevel: low\nSingle read-only endpoint.\n\n## Open questions\nNone\n`);
  writeFileSync(path.join(c, 'specs', 'data-export', 'spec.md'), `## Purpose\n\nLets users take their order data out of the product in a portable format.\n\n## ADDED Requirements\n\n### Requirement: User can export orders\nThe system SHALL let an authenticated user download their orders as CSV.\n\n#### Scenario: Successful export\n- **WHEN** an authenticated user requests the export\n- **THEN** the system returns a CSV with one row per order of that user\n`);
  for (const f of ['impact', 'tests', 'design']) writeFileSync(path.join(c, `${f}.md`), `# ${f}\n\nNot needed: low risk.\n`);
  writeFileSync(path.join(c, 'tasks.md'), '# Tasks\n\n## 1. [backend] Export\n\n- [x] 1.1 Failing test "Successful export", then implement; verify: test passes\n');
}

test('install mode: init → change → validate → commit → archive → notes → update', () => {
  const dir = repo('install-mode');
  try {
    harness(dir, 'init', '--openspec', 'install');
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.devDependencies['@fission-ai/openspec'], LOCK.openspec.version);
    for (const f of ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/skills/test-driven-development/SKILL.md', '.github/workflows/sdd-spec-gate.yml']) {
      assert.ok(existsSync(path.join(dir, f)), f);
    }
    assert.match(readFileSync(path.join(dir, 'openspec/config.yaml'), 'utf8'), /^schema: sdd$/m);
    assert.match(readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.env$/m);

    openspec(dir, 'schema', 'validate', 'sdd');
    sh(dir, 'npx', ['openspec', 'new', 'change', 'add-export']);
    assert.match(readFileSync(path.join(dir, 'openspec/changes/add-export/.openspec.yaml'), 'utf8'), /schema: sdd/);
    writeChange(dir, 'add-export');
    openspec(dir, 'validate', '--all', '--strict', '--no-interactive');

    sh(dir, 'git', ['add', '-A']);
    sh(dir, 'git', ['reset', '-q', '.env', 'node_modules']);
    assert.notEqual(sh(dir, 'git', ['commit', '-qm', 'feat: export'], { ok: false }).status, 0, 'commit without Change-Id must fail');
    sh(dir, 'git', ['commit', '-qm', 'feat: export', '--trailer', 'Change-Id: add-export']);

    openspec(dir, 'archive', 'add-export', '--yes');
    assert.ok(existsSync(path.join(dir, 'openspec/specs/data-export/spec.md')));
    sh(dir, 'git', ['add', '-A', 'openspec']);
    sh(dir, 'git', ['commit', '-qm', 'chore: archive', '--trailer', 'Change-Id: add-export']);
    sh(dir, process.execPath, ['.sdd/scripts/check-trailers.mjs', 'HEAD~1', 'HEAD']);
    assert.match(sh(dir, process.execPath, ['.sdd/scripts/release-notes.mjs']).stdout, /add-export/);

    const out = harness(dir, 'update');
    assert.doesNotMatch(out, /sdd-new/, 'update on an untouched install must not conflict');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('existing mode: the project keeps its OpenSpec version', () => {
  const dir = repo('existing-mode');
  try {
    sh(dir, 'npm', ['install', '-D', '-E', '@fission-ai/openspec@2.0.0', '--silent']);
    sh(dir, 'npx', ['openspec', 'init', '--tools', 'claude', '.']);
    writeFileSync(path.join(dir, 'openspec/config.yaml'), 'schema: spec-driven\ncontext: |\n  Project context\n');

    harness(dir, 'init'); // non-interactive: keeps the existing OpenSpec
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.devDependencies['@fission-ai/openspec'], '2.0.0');
    assert.match(readFileSync(path.join(dir, '.github/workflows/sdd-spec-gate.yml'), 'utf8'), /openspec@2\.0\.0/);
    assert.match(readFileSync(path.join(dir, 'openspec/config.yaml'), 'utf8'), /Project context/);
    assert.equal(JSON.parse(readFileSync(path.join(dir, '.sdd/manifest.json'), 'utf8')).openspec.mode, 'existing');
    sh(dir, 'npx', ['openspec', 'new', 'change', 'try-sdd', '--schema', 'sdd']);

    harness(dir, 'update');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).devDependencies['@fission-ai/openspec'], '2.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
