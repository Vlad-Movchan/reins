// Managed by sdd-harness. Helpers shared by the CI scripts.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../.claude/hooks/sdd-lib/patterns.mjs';

export const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

export function config(cwd = process.cwd()) {
  const f = path.join(cwd, '.sdd', 'harness.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

export const matcher = (globs = []) => {
  const res = globs.map(globToRegExp);
  return (p) => res.some((r) => r.test(p));
};

export function changedFiles(base, head = 'HEAD') {
  const out = git('diff', '--name-only', '--diff-filter=ACMRD', `${base}...${head}`);
  return out ? out.split('\n') : [];
}

export function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    const v = String(value);
    const delim = `EOF_${Math.random().toString(36).slice(2)}`;
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${v}\n${delim}\n`);
  }
  console.log(`${name}=${value}`);
}
