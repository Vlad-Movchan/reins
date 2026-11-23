import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', '.claude', 'hooks');
const project = mkdtempSync(path.join(os.tmpdir(), 'sdd-hooks-'));
mkdirSync(path.join(project, 'openspec', 'changes', 'add-export'), { recursive: true });
mkdirSync(path.join(project, 'openspec', 'changes', 'archive', '2026-10-01-old-change'), { recursive: true });

function hook(name, input, env = {}) {
  const res = spawnSync('node', [path.join(HOOKS, name)], {
    input: JSON.stringify({ cwd: project, ...input }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, SDD_MODE: '', ...env },
  });
  return { code: res.status, stderr: res.stderr };
}
const tool = (tool_name, tool_input) => ({ tool_name, tool_input });

test('protect-secrets blocks secret files across tools', () => {
  const blocked = [
    tool('Read', { file_path: `${project}/.env` }),
    tool('Read', { file_path: 'config/.env.production' }),
    tool('Read', { file_path: 'deploy/server.pem' }),
    tool('Read', { file_path: 'data/real/patients.csv' }),
    tool('Read', { file_path: 'backups/db.dump' }),
    tool('Edit', { file_path: '.env.local' }),
    tool('Grep', { pattern: 'API_KEY', path: '.env' }),
    tool('Glob', { pattern: '**/.env*' }),
    tool('Bash', { command: 'cat .env' }),
    tool('Bash', { command: 'grep TOKEN ./apps/api/.env.staging' }),
    tool('Bash', { command: 'source .env && npm start' }),
    tool('Bash', { command: 'git show HEAD~1:.env' }),
    tool('Bash', { command: 'cat .env*' }),
    tool('Bash', { command: 'printenv' }),
    tool('Bash', { command: 'env | grep KEY' }),
    tool('Bash', { command: 'cat ~/.ssh/id_rsa' }),
  ];
  for (const input of blocked) assert.equal(hook('sdd-protect-secrets.mjs', input).code, 2, JSON.stringify(input));
});

test('protect-secrets allows normal work and env templates', () => {
  const allowed = [
    tool('Read', { file_path: '.env.example' }),
    tool('Read', { file_path: 'src/environment.ts' }),
    tool('Grep', { pattern: '\\.env', path: 'src' }),
    tool('Glob', { pattern: 'src/**/*.ts' }),
    tool('Bash', { command: 'npm test' }),
    tool('Bash', { command: 'env NODE_ENV=test npm test' }),
    tool('Bash', { command: 'cp .env.example docs/env.example.txt' }),
    tool('Bash', { command: 'git log --oneline' }),
  ];
  for (const input of allowed) assert.equal(hook('sdd-protect-secrets.mjs', input).code, 0, JSON.stringify(input));
});

test('prompt guard rejects prompts with secrets', () => {
  assert.equal(hook('sdd-prompt-guard.mjs', { prompt: 'use key AKIAABCDEFGHIJKLMNOP please' }).code, 2);
  assert.equal(hook('sdd-prompt-guard.mjs', { prompt: 'token ghp_' + 'a'.repeat(36) }).code, 2);
  assert.equal(hook('sdd-prompt-guard.mjs', { prompt: 'add CSV export to the orders page' }).code, 0);
});

test('fix-mode guard freezes tests and specs only in fix mode', () => {
  const editTest = tool('Edit', { file_path: 'src/orders.test.ts' });
  const editSpec = tool('Write', { file_path: 'openspec/specs/orders/spec.md' });
  const editSrc = tool('Edit', { file_path: 'src/orders.ts' });
  const rmTests = tool('Bash', { command: 'rm -rf tests/legacy' });
  assert.equal(hook('sdd-fix-mode-guard.mjs', editTest).code, 0);
  assert.equal(hook('sdd-fix-mode-guard.mjs', editTest, { SDD_MODE: 'fix' }).code, 2);
  assert.equal(hook('sdd-fix-mode-guard.mjs', editSpec, { SDD_MODE: 'fix' }).code, 2);
  assert.equal(hook('sdd-fix-mode-guard.mjs', rmTests, { SDD_MODE: 'fix' }).code, 2);
  assert.equal(hook('sdd-fix-mode-guard.mjs', editSrc, { SDD_MODE: 'fix' }).code, 0);
});

test('commit guard requires a valid Change-Id', () => {
  const commit = (command) => hook('sdd-commit-guard.mjs', tool('Bash', { command })).code;
  assert.equal(commit('git commit -m "feat: export"'), 2);
  assert.equal(commit('git commit -m "feat: export" --trailer "Change-Id: add-export"'), 0);
  assert.equal(commit('git commit -m "feat: x" --trailer "Change-Id: does-not-exist"'), 2);
  assert.equal(commit('git commit -m "fix: y" --trailer "Change-Id: old-change"'), 0);
  assert.equal(commit('git commit -m "chore: deps\n\nChange-Id: none"'), 0);
  writeFileSync(path.join(project, 'msg.txt'), 'feat: z\n\nChange-Id: add-export\n');
  assert.equal(commit('git commit -F msg.txt'), 0);
  assert.equal(commit('git status'), 0);
});
