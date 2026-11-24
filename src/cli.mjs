import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyFiles, printReport } from './lib/install.mjs';
import { chooseMode, ciVersion, compatibilityWarning, describe, detectOpenspec } from './lib/openspec.mjs';
import {
  addDevDepArgs,
  detectPackageManager,
  lock,
  log,
  parseArgs,
  pkgName,
  pkgVersion,
  PKG_ROOT,
  readJson,
  run,
  tryRun,
} from './lib/util.mjs';

const HELP = `reins ${pkgVersion()}: spec-driven agent harness (OpenSpec + Claude Code)

Usage: reins <command> [options]

Commands:
  init            Install the harness into the current project
  update          Re-apply harness files after upgrading reins; bumps OpenSpec to the pinned version
  check           Show installed vs pinned vs latest versions (harness, OpenSpec, skills)
  audit-secrets   Scan Claude session transcripts (and --paths) for leaked secrets
  github-setup    Create the PR labels the CI workflows use (needs gh)

Options:
  --dir <path>       Project directory (default: cwd)
  --openspec <mode>  install: the harness pins and bumps OpenSpec (default for new projects)
                     existing: keep the project's own OpenSpec; only add schema, skills, hooks, CI
                     (asked interactively when OpenSpec is already present; remembered for update)
  --skip-install     Do not install @fission-ai/openspec as a devDependency (install mode)
  --no-package-json  Do not create a package.json in non-JS projects
  --no-git-hooks     Do not set core.hooksPath to .githooks
`;

export async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const cmd = positional[0];
  const cwd = path.resolve(flags.dir ?? process.cwd());
  if (!cmd && flags.version) return console.log(pkgVersion());
  if (!cmd && flags.help) return console.log(HELP);
  switch (cmd) {
    case 'init':
      return init(cwd, flags);
    case 'update':
      return update(cwd, flags);
    case 'check':
      return check(cwd);
    case 'audit-secrets':
      return auditSecrets(cwd, positional.slice(1));
    case 'github-setup':
      return githubSetup(cwd);
    case '--version':
    case '-v':
      return console.log(pkgVersion());
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------------------
async function ensurePackageJson(cwd, flags) {
  const file = path.join(cwd, 'package.json');
  if (existsSync(file)) return true;
  if (flags['no-package-json']) return false;
  const name = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  await writeFile(file, JSON.stringify({ name: `${name}-tooling`, private: true, description: 'Dev tooling (reins, OpenSpec)' }, null, 2) + '\n');
  log.ok('created package.json (tooling only: OpenSpec and reins are pinned here)');
  return true;
}

async function installOpenspec(cwd, flags) {
  const { package: pkg, version } = lock().openspec;
  if (flags['skip-install']) return log.warn(`skipped installing ${pkg}@${version} (--skip-install)`);
  if (!(await ensurePackageJson(cwd, flags))) {
    return log.warn(`no package.json: run OpenSpec as "npx -y ${pkg}@${version}"`);
  }
  const deps = readJson(path.join(cwd, 'package.json')).devDependencies ?? {};
  if (deps[pkg] === version) return log.ok(`${pkg}@${version} already pinned`);
  const pm = detectPackageManager(cwd);
  run(pm, addDevDepArgs(pm, `${pkg}@${version}`), { cwd, quiet: true });
  log.ok(`${pkg}@${version} pinned in devDependencies (${pm})`);
}

function openspec(cwd, args) {
  const { package: pkg, version } = lock().openspec;
  const det = detectOpenspec(cwd);
  if (det.bin) return run(det.bin, args, { cwd, quiet: true });
  return run('npx', ['-y', `${pkg}@${version}`, ...args], { cwd, quiet: true });
}

// `openspec init` flags differ between versions (e.g. --scope appeared after 2.0): only pass what this one knows.
function initArgs(cwd) {
  let help = '';
  try {
    help = openspec(cwd, ['init', '--help']);
  } catch {
    /* fall back to the minimal flag set */
  }
  const args = ['init', '--tools', 'claude'];
  if (help.includes('--scope')) args.push('--scope', 'project');
  if (help.includes('--no-animation')) args.push('--no-animation');
  return [...args, '.'];
}

/** Resolve the OpenSpec mode and set OpenSpec up accordingly. Returns the manifest entry. */
async function setupOpenspec(cwd, flags, { previous, isUpdate }) {
  const det = detectOpenspec(cwd);
  const mode = await chooseMode(det, { flag: flags.openspec, previous });

  if (mode === 'install') {
    await installOpenspec(cwd, flags);
    if (!existsSync(path.join(cwd, 'openspec'))) {
      openspec(cwd, initArgs(cwd));
      log.ok('openspec init (Claude Code skills and /openspec-* commands)');
    } else {
      openspec(cwd, ['update', '.']);
      log.ok(`OpenSpec instruction files refreshed (${lock().openspec.version})`);
    }
    return { mode, version: lock().openspec.version };
  }

  // existing: never install, bump or refresh the project's OpenSpec.
  log.ok(`keeping the project's OpenSpec (${describe(det)}); the harness will not install or bump it`);
  if (!det.initialized && !isUpdate) {
    openspec(cwd, initArgs(cwd));
    log.ok('openspec init with the project\'s OpenSpec');
  }
  const warning = compatibilityWarning(det);
  if (warning) log.warn(warning);
  return { mode, version: ciVersion(mode, det) };
}

function checkSchema(cwd, openspecEntry) {
  try {
    openspec(cwd, ['schema', 'validate', 'sdd']);
    log.ok('sdd schema loads with this OpenSpec');
  } catch (e) {
    log.warn(`sdd schema did not validate with this OpenSpec: ${e.message.split('\n').slice(-2).join(' ').trim()}`);
    if (openspecEntry.mode === 'existing') log.warn('Upgrade the project\'s OpenSpec or rerun with --openspec=install.');
  }
  const cfg = path.join(cwd, 'openspec', 'config.yaml');
  if (existsSync(cfg) && !/^schema:\s*sdd\s*$/m.test(readFileSync(cfg, 'utf8'))) {
    log.info(`  - openspec/config.yaml keeps its default schema. Use sdd per change ("openspec new change <id> --schema sdd")
    or set "schema: sdd"; harness rules for config.yaml: ${path.join(PKG_ROOT, 'templates/openspec/config.yaml')}`);
  }
}

function setupGitHooks(cwd, flags) {
  if (flags['no-git-hooks']) return;
  if (!tryRun('git', ['rev-parse', '--is-inside-work-tree'], { cwd })) {
    return log.warn('not a git repository: run "git init" and then "git config core.hooksPath .githooks"');
  }
  const current = tryRun('git', ['config', '--get', 'core.hooksPath'], { cwd });
  if (current && current !== '.githooks') {
    return log.warn(`core.hooksPath is "${current}" (husky?). Call .sdd/scripts/check-commit-msg.mjs from your commit-msg hook.`);
  }
  tryRun('git', ['config', 'core.hooksPath', '.githooks'], { cwd });
  log.ok('git commit-msg hook enabled (core.hooksPath=.githooks)');
}

async function init(cwd, flags) {
  log.info(`reins ${pkgVersion()} → ${cwd}`);
  log.step('1. OpenSpec');
  const manifestFile = path.join(cwd, '.sdd', 'manifest.json');
  const previous = existsSync(manifestFile) ? readJson(manifestFile).openspec?.mode : undefined;
  const openspecEntry = await setupOpenspec(cwd, flags, { previous, isUpdate: false });

  log.step('2. Harness files');
  printReport(await applyFiles(cwd, { openspec: openspecEntry }));
  checkSchema(cwd, openspecEntry);

  log.step('3. Git');
  setupGitHooks(cwd, flags);

  log.step('Next steps');
  log.info(`  1. Fill the TODOs in AGENTS.md, openspec/config.yaml and .sdd/harness.json (layers, domain paths).
  2. Validate the schema:      npx openspec schema validate sdd
  3. GitHub: add secret ANTHROPIC_API_KEY (and CONFLUENCE_* for the export), then: npx reins github-setup
  4. Commit everything except .env files. Start a change with /openspec-propose in Claude Code.`);
}

async function update(cwd, flags) {
  const manifestFile = path.join(cwd, '.sdd', 'manifest.json');
  const before = existsSync(manifestFile) ? readJson(manifestFile) : null;
  if (!before) throw new Error('No .sdd/manifest.json: run "reins init" first.');
  log.info(`reins ${before.harnessVersion} → ${pkgVersion()}`);

  log.step('1. OpenSpec');
  // Manifests from 0.1.0 have no openspec.mode: the harness managed OpenSpec then.
  const previous = before.openspec?.mode ?? 'install';
  const openspecEntry = await setupOpenspec(cwd, flags, { previous, isUpdate: true });

  log.step('2. Harness files');
  printReport(await applyFiles(cwd, { isUpdate: true, openspec: openspecEntry }));
  checkSchema(cwd, openspecEntry);
  setupGitHooks(cwd, flags);
  log.info('\nReview with "git diff", run "npx openspec validate --all --strict", then commit with "Change-Id: none".');
}

// ---------------------------------------------------------------------------------------
async function check(cwd) {
  const l = lock();
  const manifestFile = path.join(cwd, '.sdd', 'manifest.json');
  const installed = existsSync(manifestFile) ? readJson(manifestFile) : null;
  const latestHarness = tryRun('npm', ['view', pkgName(), 'version']);
  const latestOpenspec = tryRun('npm', ['view', l.openspec.package, 'dist-tags.latest']);
  const projectOpenspec = detectOpenspec(cwd).version;

  const row = (name, inProject, pinned, latest) =>
    console.log(`${name.padEnd(26)} ${String(inProject ?? '-').padEnd(12)} ${String(pinned ?? '-').padEnd(12)} ${latest ?? '?'}${latest && pinned && latest !== pinned ? '  ← newer available' : ''}`);
  console.log(`${'component'.padEnd(26)} ${'project'.padEnd(12)} ${'pinned'.padEnd(12)} latest`);
  row(pkgName(), installed?.harnessVersion, pkgVersion(), latestHarness);
  const mode = installed?.openspec?.mode ?? 'install';
  row(l.openspec.package, projectOpenspec, mode === 'existing' ? '(project)' : l.openspec.version, latestOpenspec);
  for (const s of l.skills) row(`skill:${s.dest}`, null, s.sha.slice(0, 7), null);
  console.log(`\nSkills are pinned per harness release. Harness maintainers bump them with "npm run vendor:update".`);
  console.log(`OpenSpec mode: ${mode}${mode === 'existing' ? ' (project-owned; the harness never installs or bumps it)' : ''}`);
  if (installed && installed.harnessVersion !== pkgVersion()) console.log('Project is behind this harness version: run "npx reins update".');
}

// ---------------------------------------------------------------------------------------
async function auditSecrets(cwd, extraPaths) {
  const { findSecrets, mask } = await import(path.join(PKG_ROOT, 'templates/.claude/hooks/sdd-lib/patterns.mjs'));
  const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const transcripts = path.join(os.homedir(), '.claude', 'projects', encoded);
  const targets = [];
  if (existsSync(transcripts)) {
    for (const f of await readdir(transcripts)) if (f.endsWith('.jsonl')) targets.push(path.join(transcripts, f));
  } else log.warn(`no Claude transcripts at ${transcripts}`);
  targets.push(...extraPaths.map((p) => path.resolve(cwd, p)));

  let total = 0;
  for (const file of targets) {
    if (!existsSync(file)) continue;
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const hit of findSecrets(line)) {
        total++;
        console.log(`${file}:${i + 1}  ${hit.name}  ${mask(hit.match)}`);
      }
    });
  }
  log.info(`\nScanned ${targets.length} file(s): ${total} finding(s).`);
  if (total) {
    log.info('Rotate every real secret found, then delete or redact the affected transcript files.');
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------------------
const LABELS = [
  ['low-risk', '0e8a16', 'Change is low risk: skips drift warning and spec challenge'],
  ['ai-review', '5319e7', 'Run the spec-aware AI review on this PR'],
  ['security-review', 'b60205', 'Run the AI security review on this PR'],
  ['ai-triage', 'fbca04', 'Let the CI triage agent classify failures and open fix PRs'],
  ['ai-fix', 'c5def5', 'Fix PR opened by the CI triage agent'],
];

async function githubSetup(cwd) {
  if (!tryRun('gh', ['auth', 'status'])) throw new Error('gh is not authenticated: run "gh auth login".');
  for (const [name, color, description] of LABELS) {
    run('gh', ['label', 'create', name, '--color', color, '--description', description, '--force'], { cwd, quiet: true });
    log.ok(`label ${name}`);
  }
  const secrets = tryRun('gh', ['secret', 'list'], { cwd }) ?? '';
  for (const s of ['ANTHROPIC_API_KEY']) {
    if (!secrets.includes(s)) log.warn(`repository secret ${s} is missing: gh secret set ${s}`);
  }
  log.info('\nEnable "Allow auto-merge" in repo settings so low-risk fix PRs can merge after green CI.');
}
