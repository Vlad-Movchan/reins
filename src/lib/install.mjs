// Applies harness files to a project, tracking what it wrote in .sdd/manifest.json so updates
// never clobber local edits.
//
// Ownership modes:
//   managed  harness owns the file; overwritten on update unless edited locally
//            (then the new version lands next to it as <file>.sdd-new)
//   seed     written once on init; project-owned afterwards
//   block    only the text between <!-- sdd-harness:begin --> and <!-- sdd-harness:end --> is managed
//   merge    JSON deep-merge: arrays are unioned, existing scalars win, harness hook entries replaced
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lock, log, pkgVersion, sha256, TEMPLATES, VENDOR_SKILLS, walk } from './util.mjs';

const MANIFEST = '.sdd/manifest.json';
const BLOCK_RE = /<!-- sdd-harness:begin[^>]*-->[\s\S]*?<!-- sdd-harness:end -->/;

const SEED = new Set(['openspec/config.yaml', '.sdd/harness.json']);
const BLOCK = new Set(['AGENTS.md', 'CLAUDE.md']);
const MERGE = new Set(['.claude/settings.json', '.mcp.json']);

export function modeFor(rel) {
  if (SEED.has(rel)) return 'seed';
  if (BLOCK.has(rel)) return 'block';
  if (MERGE.has(rel)) return 'merge';
  return 'managed';
}

function vars(cwd, openspecVersion) {
  const l = lock();
  return {
    PROJECT_NAME: path.basename(cwd),
    HARNESS_VERSION: pkgVersion(),
    OPENSPEC_VERSION: openspecVersion ?? l.openspec.version,
    PLAYWRIGHT_MCP_VERSION: l.mcp['@playwright/mcp'],
    CLAUDE_CODE_ACTION: l.actions['anthropics/claude-code-action'],
    SECURITY_REVIEW_ACTION: l.actions['anthropics/claude-code-security-review'],
  };
}

const TEXT = /\.(md|mjs|js|json|ya?ml|sh|txt)$|(^|\/)[^.]+$/;
function render(rel, buf, v) {
  if (!TEXT.test(rel)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => v[k] ?? m));
}

/** All files the harness ships, as [{rel, src, content}], templates + vendored skills. */
export async function plannedFiles(cwd, openspecVersion) {
  const v = vars(cwd, openspecVersion);
  const files = [];
  for (const rel of await walk(TEMPLATES)) {
    files.push({ rel, content: render(rel, await readFile(path.join(TEMPLATES, rel)), v) });
  }
  for (const rel of await walk(VENDOR_SKILLS)) {
    files.push({ rel: `.claude/skills/${rel}`, content: await readFile(path.join(VENDOR_SKILLS, rel)) });
  }
  return files;
}

async function readManifest(cwd) {
  const f = path.join(cwd, MANIFEST);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : { files: {} };
}

// --- merge helpers -----------------------------------------------------------------------
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isHarnessHook = (entry) => JSON.stringify(entry).includes('/.claude/hooks/sdd-');

function deepMerge(existing, incoming, keyPath = []) {
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    // Hook event arrays: replace previous harness entries so updated commands don't duplicate.
    const base = keyPath[0] === 'hooks' ? existing.filter((e) => !isHarnessHook(e)) : existing;
    const seen = new Set(base.map((e) => JSON.stringify(e)));
    return [...base, ...incoming.filter((e) => !seen.has(JSON.stringify(e)))];
  }
  if (isObj(existing) && isObj(incoming)) {
    const out = { ...existing };
    for (const [k, val] of Object.entries(incoming)) {
      out[k] = k in existing ? deepMerge(existing[k], val, [...keyPath, k]) : val;
    }
    return out;
  }
  return existing; // scalars: the project's value wins
}

// --- apply -------------------------------------------------------------------------------
export async function applyFiles(cwd, { isUpdate = false, openspec = { mode: 'install', version: lock().openspec.version } } = {}) {
  const manifest = await readManifest(cwd);
  const next = { harnessVersion: pkgVersion(), openspec, files: {} };
  const report = { written: [], unchanged: [], conflicts: [], skipped: [], removed: [], excluded: [] };
  const planned = await plannedFiles(cwd, openspec.version);
  const isExcluded = await excludeMatcher(cwd);

  for (const { rel, content } of planned) {
    const dest = path.join(cwd, rel);
    const mode = modeFor(rel);
    const exists = existsSync(dest);
    const current = exists ? await readFile(dest) : null;

    // Opt-outs: listed in .sdd/harness.json "exclude", or a managed file the project deleted.
    if (isExcluded(rel) || (mode === 'managed' && !exists && rel in manifest.files)) {
      if (rel in manifest.files) next.files[rel] = manifest.files[rel];
      report.excluded.push(rel);
      continue;
    }
    await mkdir(path.dirname(dest), { recursive: true });

    if (mode === 'seed') {
      if (exists && !isPristineOpenspecConfig(rel, current)) {
        report.skipped.push(rel);
        continue;
      }
      await writeFile(dest, content);
      report.written.push(rel);
      continue;
    }

    if (mode === 'block') {
      const block = content.toString('utf8').match(BLOCK_RE)[0];
      let text;
      if (!exists) text = content.toString('utf8');
      else if (BLOCK_RE.test(current.toString('utf8'))) text = current.toString('utf8').replace(BLOCK_RE, block);
      else text = `${current.toString('utf8').trimEnd()}\n\n${block}\n`;
      if (rel === 'CLAUDE.md' && exists && !/^@AGENTS\.md/m.test(text)) text = `@AGENTS.md\n\n${text}`;
      await write(dest, text, current, report, rel);
      continue;
    }

    if (mode === 'merge') {
      const incoming = JSON.parse(content.toString('utf8'));
      const merged = exists ? deepMerge(JSON.parse(current.toString('utf8')), incoming) : incoming;
      await write(dest, JSON.stringify(merged, null, 2) + '\n', current, report, rel);
      continue;
    }

    // managed
    const hash = sha256(content);
    next.files[rel] = hash;
    if (exists) {
      const curHash = sha256(current);
      if (curHash === hash) {
        report.unchanged.push(rel);
        continue;
      }
      const known = manifest.files[rel];
      const locallyEdited = known ? curHash !== known : true;
      if (locallyEdited) {
        await writeFile(`${dest}.sdd-new`, content);
        next.files[rel] = known ?? curHash; // keep tracking the version the user diverged from
        report.conflicts.push(rel);
        continue;
      }
    }
    await writeFile(dest, content);
    if (rel.startsWith('.githooks/') || rel.endsWith('.sh')) await chmod(dest, 0o755);
    report.written.push(rel);
  }

  // Files the previous harness version shipped but this one doesn't: remove if untouched.
  if (isUpdate) {
    for (const [rel, hash] of Object.entries(manifest.files)) {
      if (rel in next.files) continue;
      const dest = path.join(cwd, rel);
      if (!existsSync(dest)) continue;
      if (sha256(await readFile(dest)) === hash) {
        await rm(dest);
        report.removed.push(rel);
      } else {
        report.conflicts.push(`${rel} (removed upstream, kept because edited locally)`);
      }
    }
  }

  await ensureGitignore(cwd, report);
  await mkdir(path.join(cwd, '.sdd'), { recursive: true });
  await writeFile(path.join(cwd, MANIFEST), JSON.stringify(next, null, 2) + '\n');
  return report;
}

async function excludeMatcher(cwd) {
  const cfgFile = path.join(cwd, '.sdd', 'harness.json');
  if (!existsSync(cfgFile)) return () => false;
  let globs = [];
  try {
    globs = JSON.parse(await readFile(cfgFile, 'utf8')).exclude ?? [];
  } catch {
    return () => false;
  }
  const { globToRegExp } = await import(path.join(TEMPLATES, '.claude/hooks/sdd-lib/patterns.mjs'));
  const res = globs.map((g) => globToRegExp(g.replace(/^\.?\//, '')));
  // Never let a project exclude its own config or the manifest bookkeeping.
  return (rel) => !SEED.has(rel) && res.some((r) => r.test(rel));
}

const GITIGNORE = ['.env', '.env.*', '!.env.example', '*.pem', '*.key', '*.dump', '*.sdd-new', 'node_modules/'];
async function ensureGitignore(cwd, report) {
  const file = path.join(cwd, '.gitignore');
  const current = existsSync(file) ? await readFile(file, 'utf8') : '';
  const have = new Set(current.split('\n').map((l) => l.trim()));
  const missing = GITIGNORE.filter((l) => !have.has(l));
  if (!missing.length) return;
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  await writeFile(file, `${current}${sep}${current ? '\n' : ''}# sdd-harness: secrets never reach git\n${missing.join('\n')}\n`);
  report.written.push('.gitignore');
}

async function write(dest, text, current, report, rel) {
  if (current && current.toString('utf8') === text) {
    report.unchanged.push(rel);
    return;
  }
  await writeFile(dest, text);
  report.written.push(rel);
}

// `openspec init` writes a default config.yaml (schema: spec-driven + comments). Replace that one.
function isPristineOpenspecConfig(rel, buf) {
  if (rel !== 'openspec/config.yaml') return false;
  const meaningful = buf
    .toString('utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return meaningful.length === 1 && meaningful[0] === 'schema: spec-driven';
}

export function printReport(report) {
  if (report.written.length) log.ok(`${report.written.length} file(s) written`);
  if (report.unchanged.length) log.ok(`${report.unchanged.length} file(s) already up to date`);
  for (const f of report.skipped) log.info(`  - kept project-owned ${f}`);
  for (const f of report.removed) log.info(`  - removed ${f} (no longer shipped)`);
  if (report.excluded.length) log.info(`  - ${report.excluded.length} file(s) left out (deleted locally or in .sdd/harness.json "exclude")`);
  for (const f of report.conflicts) log.warn(`${f} was edited locally; new version saved as ${f.split(' ')[0]}.sdd-new; merge it by hand`);
}

export async function isDir(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
