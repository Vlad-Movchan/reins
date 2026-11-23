// OpenSpec ownership. Two modes:
//   install   the harness pins @fission-ai/openspec (exact devDependency), runs init/update and
//             moves the pin on every `sdd-harness update`.
//   existing  the project already uses OpenSpec and keeps it: the harness never installs, bumps or
//             re-inits it, only adds the `sdd` schema, skills, hooks and CI next to it. CI uses the
//             project's OpenSpec version.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { lock, log, readJson, tryRun } from './util.mjs';

export const MODES = ['install', 'existing'];
const semver = (s) => s?.match(/\d+\.\d+\.\d+(-[\w.]+)?/)?.[0] ?? null;

/** What OpenSpec the project already has, without changing anything. */
export function detectOpenspec(cwd) {
  const pkg = lock().openspec.package;
  const pj = path.join(cwd, 'package.json');
  const json = existsSync(pj) ? readJson(pj) : {};
  const declared = { ...json.dependencies, ...json.devDependencies }[pkg] ?? null;
  const localBin = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
  const localVersion = existsSync(localBin) ? semver(tryRun(localBin, ['--version'], { cwd })) : null;
  const globalVersion = localVersion ? null : semver(tryRun('openspec', ['--version'], { cwd }));
  const initialized = existsSync(path.join(cwd, 'openspec'));
  const version = localVersion ?? globalVersion ?? semver(declared);
  return {
    initialized,
    declared,
    version,
    bin: localVersion ? localBin : globalVersion ? 'openspec' : null,
    source: localVersion ? 'node_modules' : globalVersion ? 'global' : declared ? 'package.json (not installed)' : null,
    present: Boolean(initialized || declared || localVersion || globalVersion),
  };
}

/**
 * Decide the mode: explicit flag > mode recorded on a previous install > ask (TTY) >
 * safe default (keep the project's OpenSpec when it has one).
 */
export async function chooseMode(det, { flag, previous, interactive = process.stdin.isTTY && process.stdout.isTTY } = {}) {
  if (flag !== undefined && flag !== true) {
    if (!MODES.includes(flag)) throw new Error(`--openspec must be one of: ${MODES.join(', ')}`);
    return flag;
  }
  if (previous && MODES.includes(previous)) return previous;
  if (!det.present) return 'install';
  if (!interactive) {
    log.warn(`OpenSpec already present (${describe(det)}); keeping it. Pass --openspec=install to let the harness pin and manage it.`);
    return 'existing';
  }
  const pinned = lock().openspec.version;
  console.log(`\nOpenSpec is already set up in this project (${describe(det)}).`);
  console.log(`  1) Keep my OpenSpec: harness adds the sdd schema, skills, hooks and CI next to it (default)`);
  console.log(`  2) Let the harness manage it: pin ${lock().openspec.package}@${pinned} and bump it on sdd-harness update`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Choose 1 or 2 [1]: ')).trim();
  rl.close();
  return answer === '2' ? 'install' : 'existing';
}

export function describe(det) {
  const parts = [];
  if (det.version) parts.push(`v${det.version} from ${det.source}`);
  else if (det.declared) parts.push(`declared ${det.declared}`);
  if (det.initialized) parts.push('openspec/ initialised');
  return parts.join(', ') || 'not found';
}

/** Version CI should run: the pin in install mode, the project's own in existing mode. */
export function ciVersion(mode, det) {
  return mode === 'existing' && det.version ? det.version : lock().openspec.version;
}

/** Warn when the project's OpenSpec may not understand the forked schema. */
export function compatibilityWarning(det) {
  const pinned = lock().openspec.version;
  if (!det.version) return `could not determine the project's OpenSpec version; the sdd schema was forked from ${pinned}.`;
  const major = (v) => Number(v.split('.')[0]);
  if (major(det.version) < major(pinned)) {
    return `project OpenSpec ${det.version} is older than ${pinned} (the sdd schema's base). Custom schemas may not load; consider --openspec=install or upgrading OpenSpec.`;
  }
  return null;
}
