import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATES = path.join(PKG_ROOT, 'templates');
export const VENDOR_SKILLS = path.join(PKG_ROOT, 'vendor', 'skills');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const pkgVersion = () => readJson(path.join(PKG_ROOT, 'package.json')).version;
export const lock = () => readJson(path.join(PKG_ROOT, 'harness.lock.json'));
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const log = {
  info: (m) => console.log(m),
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  warn: (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m${m}\x1b[0m`),
};

export async function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

export function run(cmd, args, { cwd, quiet = false } = {}) {
  const res = spawnSync(cmd, args, { cwd, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    const detail = quiet ? `\n${res.stderr || res.stdout}` : '';
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})${detail}`);
  }
  return res.stdout;
}

export function tryRun(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();
  } catch {
    return null;
  }
}

export function detectPackageManager(cwd) {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

export function addDevDepArgs(pm, spec) {
  switch (pm) {
    case 'pnpm':
      return ['add', '-D', '-E', spec];
    case 'yarn':
      return ['add', '-D', '-E', spec];
    case 'bun':
      return ['add', '-d', '--exact', spec];
    default:
      return ['install', '-D', '-E', spec];
  }
}

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-') && ['dir', 'since', 'until', 'openspec'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}
