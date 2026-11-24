#!/usr/bin/env node
// Managed by reins. PreToolUse guard active only when SDD_MODE=fix (the CI triage agent).
// In fix mode the agent repairs lint / format / types / dependencies and must not touch tests or
// specs: changing them would let it "fix" CI by weakening the contract. The fix-PR workflow
// re-checks the final diff, so this hook is the early feedback, not the only line of defence.
import { globToRegExp } from './sdd-lib/patterns.mjs';
import { block, harnessConfig, projectDir, readHookInput } from './sdd-lib/io.mjs';
import path from 'node:path';

if (process.env.SDD_MODE !== 'fix') process.exit(0);

const input = await readHookInput();
const cwd = projectDir(input);
const cfg = harnessConfig(cwd);
const DEFAULT_FROZEN = ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', 'test/**', 'tests/**', 'e2e/**', '**/fixtures/**', '**/*.snap'];
const frozen = [...(cfg.fixMode?.frozenPaths ?? DEFAULT_FROZEN), 'openspec/**'].map(globToRegExp);

const rel = (p) => (path.isAbsolute(p) ? path.relative(cwd, p) : p).replace(/\\/g, '/').replace(/^\.\//, '');
const isFrozen = (p) => frozen.some((r) => r.test(rel(p)));

const t = input.tool_input ?? {};
for (const p of [t.file_path, t.notebook_path].filter(Boolean)) {
  if (isFrozen(p)) block(`fix mode: "${rel(p)}" is a test or spec file. Fix PRs may not change tests or openspec/. If the failure is in the test or spec itself, stop and report it for a human.`);
}

if (input.tool_name === 'Bash') {
  const cmd = t.command ?? '';
  const writes = /(\bsed\s+-i|\btee\b|>|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv)\b|\bperl\s+-p?i)/.test(cmd);
  const paths = cmd.split(/[\s;&|()<>'"]+/).filter((w) => w && !w.startsWith('-'));
  if (writes && paths.some(isFrozen)) {
    block('fix mode: this command would modify tests or openspec/. Fix PRs may only change source, config and lockfiles.');
  }
}
process.exit(0);
