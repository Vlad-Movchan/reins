// MCP servers and Claude Code plugins for a project.
//
// `init` offers two kinds of items and writes the chosen ones to the shared project config:
//   - harness MCP servers (CATALOG, versions pinned in harness.lock.json). The harness owns these
//     entries: `update` refreshes them while untouched (hash in .sdd/manifest.json → mcp.servers)
//     and keeps local edits;
//   - what the developer already has connected in Claude Code: user- and local-scope MCP servers
//     from ~/.claude.json and enabled plugins from ~/.claude/settings.json and
//     .claude/settings.local.json. Copied once, project-owned afterwards.
// Servers go to .mcp.json, plugins to .claude/settings.json (enabledPlugins, extraKnownMarketplaces).
// Both files are committed, so secrets never go in: env and header values, secret-looking
// arguments and URL credentials become ${VAR} references, the home directory becomes ${HOME}.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { findSecrets } from '../../templates/.claude/hooks/sdd-lib/patterns.mjs';
import { lock, log, sha256 } from './util.mjs';

const CATALOG = {
  playwright: {
    description: 'browser automation for UI checks and e2e flows',
    default: true,
    config: (pins) => ({ command: 'npx', args: ['-y', `@playwright/mcp@${pins['@playwright/mcp']}`, '--isolated'] }),
  },
};

// Marketplaces every Claude Code install knows; never declared in extraKnownMarketplaces.
const BUILTIN_MARKETPLACES = new Set(['claude-plugins-official']);

/** Harness MCP servers with their pinned configs. */
export function catalog() {
  const pins = lock().mcp;
  return Object.entries(CATALOG).map(([name, c]) => ({ name, description: c.description, default: c.default, config: c.config(pins) }));
}

// --- helpers -------------------------------------------------------------------------------
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const readJsonSafe = (file) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
};
const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
export const entryHash = (entry) => sha256(stable(entry));
const sameEntry = (a, b) => stable(a) === stable(b);
const VERSION = /@\d+\.\d+\.\d+[\w.+-]*/g;
// An entry written by an older harness version: same shape, only the pinned version differs.
const olderHarnessEntry = (entry, config) => stable(entry).replace(VERSION, '@V') === stable(config).replace(VERSION, '@V');

const SECRET_WORDS = new Set(['key', 'apikey', 'token', 'secret', 'password', 'passwd', 'pwd', 'pass', 'auth', 'credential', 'credentials', 'cookie', 'bearer', 'signature']);
const secretName = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).some((w) => SECRET_WORDS.has(w) || /(key|token|secret|password)$/.test(w));
const hasRef = (s) => /\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}/.test(s);
const envName = (...parts) =>
  parts.join('_').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1');

/**
 * Turns a server config from the developer's Claude Code into one that is safe to commit.
 * Returns {config, vars, notes} or {error} when a secret could not be moved out.
 */
export function portableServer(name, config, { home = os.homedir() } = {}) {
  if (!isObj(config)) return { error: 'not a server definition' };
  const vars = [];
  const ref = (v) => {
    if (!vars.includes(v)) vars.push(v);
    return `\${${v}}`;
  };
  const notes = [];
  const fromHome = (s) => {
    if (typeof s !== 'string' || !home || !(s === home || s.startsWith(`${home}/`))) return s;
    if (!notes.includes('home')) notes.push('home');
    return `\${HOME}${s.slice(home.length)}`;
  };
  const out = structuredClone(config);

  if (typeof out.command === 'string') out.command = fromHome(out.command);
  if (Array.isArray(out.args)) {
    out.args = out.args.map((arg, i, all) => {
      if (typeof arg !== 'string' || hasRef(arg)) return arg;
      const eq = arg.match(/^(--?[\w-]+)=([\s\S]*)$/);
      if (eq && secretName(eq[1])) return `${eq[1]}=${ref(envName(name, eq[1]))}`;
      const prev = all[i - 1];
      if (typeof prev === 'string' && /^--?[\w-]+$/.test(prev) && secretName(prev) && !arg.startsWith('-')) return ref(envName(name, prev));
      if (findSecrets(arg).length) return ref(envName(name, `arg${i}`));
      return fromHome(arg);
    });
  }
  if (isObj(out.env)) {
    for (const [k, v] of Object.entries(out.env)) {
      if (typeof v === 'string' && hasRef(v)) continue;
      out.env[k] = ref(envName(k));
    }
  }
  if (isObj(out.headers)) {
    for (const [h, v] of Object.entries(out.headers)) {
      if (typeof v !== 'string' || hasRef(v)) continue;
      const variable = /^[A-Z][A-Z0-9_]*$/.test(h) ? h : envName(name, /^authorization$/i.test(h) ? 'token' : h);
      const scheme = v.match(/^(Bearer|Basic|Token)\s+/i)?.[0] ?? '';
      out.headers[h] = `${scheme}${ref(variable)}`;
    }
  }
  if (typeof out.url === 'string') {
    out.url = out.url
      .replace(/^([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)@/i, (m, pre, pw) => (hasRef(pw) ? m : `${pre}${ref(envName(name, 'password'))}@`))
      .replace(/([?&])([^=&#]+)=([^&#]*)/g, (m, sep, k, v) => (v && secretName(k) && !hasRef(v) ? `${sep}${k}=${ref(envName(name, k))}` : m));
  }
  // Anything else (e.g. oauth.clientSecret): secret-named keys and secret-looking values.
  const walk = (node, keyPath) => {
    for (const [k, v] of Object.entries(node)) {
      if (keyPath.length === 0 && ['command', 'args', 'env', 'headers', 'url'].includes(k)) continue;
      if (isObj(v)) walk(v, [...keyPath, k]);
      else if (typeof v === 'string' && !hasRef(v) && (secretName(k) || findSecrets(v).length)) node[k] = ref(envName(name, ...keyPath, k));
    }
  };
  walk(out, []);

  // Safety net, ignoring the references themselves (user:${VAR}@host still looks like a credential URL).
  if (findSecrets(JSON.stringify(out).replace(/\$\{[^}]*\}/g, '')).length) return { error: 'contains a secret that cannot be moved to an environment variable' };
  return { config: out, vars, notes };
}

// --- what the developer has connected ------------------------------------------------------
function projectKeys(cwd) {
  const keys = [path.resolve(cwd)];
  try {
    const real = realpathSync(cwd);
    if (!keys.includes(real)) keys.push(real);
  } catch {
    /* cwd may not exist yet */
  }
  return keys;
}

/**
 * MCP servers and plugins the developer uses in this project through Claude Code, outside the
 * shared project config. Read-only.
 */
export function detectConnected(cwd, { home = os.homedir(), env = process.env } = {}) {
  const configDir = env.CLAUDE_CONFIG_DIR;
  const claudeJson = readJsonSafe(configDir ? path.join(configDir, '.claude.json') : path.join(home, '.claude.json')) ?? {};
  const claudeDir = configDir ?? path.join(home, '.claude');
  const local = projectKeys(cwd).map((k) => claudeJson.projects?.[k]).find(Boolean) ?? {};

  const servers = [];
  for (const [scope, map] of [['local', local.mcpServers], ['user', claudeJson.mcpServers]]) {
    for (const [name, config] of Object.entries(isObj(map) ? map : {})) {
      if (!servers.some((s) => s.name === name)) servers.push({ name, scope, config }); // local wins, as in Claude Code
    }
  }

  const userSettings = readJsonSafe(path.join(claudeDir, 'settings.json')) ?? {};
  const localSettings = readJsonSafe(path.join(cwd, '.claude', 'settings.local.json')) ?? {};
  const known = readJsonSafe(path.join(claudeDir, 'plugins', 'known_marketplaces.json')) ?? {};
  const enabled = { ...userSettings.enabledPlugins, ...localSettings.enabledPlugins };
  const plugins = [];
  for (const [id, on] of Object.entries(enabled)) {
    if (on !== true || !id.includes('@')) continue;
    const scope = localSettings.enabledPlugins?.[id] === true ? 'local' : 'user';
    const marketplace = id.slice(id.lastIndexOf('@') + 1);
    const source = localSettings.extraKnownMarketplaces?.[marketplace]?.source ?? userSettings.extraKnownMarketplaces?.[marketplace]?.source ?? known[marketplace]?.source;
    plugins.push({ id, scope, marketplace, ...marketplaceEntry(marketplace, source) });
  }
  return { servers, plugins };
}

function marketplaceEntry(name, source) {
  if (BUILTIN_MARKETPLACES.has(name)) return { source: null };
  if (!isObj(source)) return { error: `marketplace "${name}" has no known source` };
  if (['file', 'directory'].includes(source.source)) return { error: `marketplace "${name}" is a local ${source.source}` };
  if (source.headers || source.headersHelper) return { error: `marketplace "${name}" needs auth headers` };
  return { source };
}

// --- selection -----------------------------------------------------------------------------
const readMcpJson = (cwd) => readJsonSafe(path.join(cwd, '.mcp.json'));
const readProjectSettings = (cwd) => readJsonSafe(path.join(cwd, '.claude', 'settings.json'));

/**
 * Harness servers the project currently has: recorded in the manifest, or for manifests written by
 * 0.2.0 and earlier (which always installed the catalog), the catalog entries present in .mcp.json.
 */
export function installedCatalog(cwd, manifest) {
  if (manifest?.mcp?.servers) return Object.keys(manifest.mcp.servers);
  const servers = readMcpJson(cwd)?.mcpServers ?? {};
  return catalog().filter((c) => isObj(servers[c.name]) && olderHarnessEntry(servers[c.name], c.config)).map((c) => c.name);
}

/** Selection used without a prompt or flags: what the project has, or the catalog defaults on a first install. */
export function defaultSelection(cwd, manifest) {
  const names = manifest ? installedCatalog(cwd, manifest) : catalog().filter((c) => c.default).map((c) => c.name);
  return { catalog: names, servers: [], plugins: [], explicit: false };
}

/** Items to offer: harness servers, plus connected servers and plugins the project does not have yet. */
export function candidates(cwd, { manifest, home, env } = {}) {
  const inProject = readMcpJson(cwd)?.mcpServers ?? {};
  const projectPlugins = readProjectSettings(cwd)?.enabledPlugins ?? {};
  const catalogNames = new Set(catalog().map((c) => c.name));
  const preselected = new Set(defaultSelection(cwd, manifest).catalog);
  const connected = detectConnected(cwd, { home, env });
  const items = catalog().map((c) => ({
    kind: 'catalog',
    name: c.name,
    selected: preselected.has(c.name),
    detail: `${c.description} (${summary(c.config)})`,
  }));
  const skipped = [];
  for (const s of connected.servers) {
    if (catalogNames.has(s.name) || s.name in inProject) continue;
    const portable = portableServer(s.name, s.config, { home });
    if (portable.error) skipped.push(`${s.name}: ${portable.error}`);
    else items.push({ kind: 'server', name: s.name, scope: s.scope, selected: true, ...portable, detail: `MCP server (${s.scope}): ${summary(portable.config)}` });
  }
  for (const p of connected.plugins) {
    if (projectPlugins[p.id] === true) continue;
    if (p.error) skipped.push(`${p.id}: ${p.error}`);
    else items.push({ kind: 'plugin', name: p.id, scope: p.scope, marketplace: p.marketplace, source: p.source, selected: true, detail: `plugin (${p.scope})` });
  }
  return { items, skipped };
}

function summary(config) {
  const text = config.url ?? [config.command, ...(config.args ?? [])].filter(Boolean).join(' ');
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
}

/** Applies a prompt answer ("1 3", "2,4", "all", "none") to the items. Returns an error message or null. */
export function toggle(items, answer) {
  const a = answer.trim().toLowerCase();
  if (a === 'all' || a === 'none') {
    for (const i of items) i.selected = a === 'all';
    return null;
  }
  const nums = a.split(/[\s,]+/).filter(Boolean);
  const bad = nums.filter((n) => !/^\d+$/.test(n) || Number(n) < 1 || Number(n) > items.length);
  if (bad.length) return `not on the list: ${bad.join(', ')}`;
  for (const n of nums) items[Number(n) - 1].selected = !items[Number(n) - 1].selected;
  return null;
}

export function renderItems(items) {
  const groups = [
    ['catalog', 'Harness MCP servers'],
    ['server', 'MCP servers connected in your Claude Code'],
    ['plugin', 'Plugins enabled in your Claude Code'],
  ];
  const lines = [];
  for (const [kind, title] of groups) {
    const group = items.filter((i) => i.kind === kind);
    if (!group.length) continue;
    const width = Math.max(...group.map((i) => i.name.length));
    lines.push(`  ${title}`);
    items.forEach((i, n) => {
      if (i.kind === kind) lines.push(`  ${String(n + 1).padStart(3)}. [${i.selected ? 'x' : ' '}] ${i.name.padEnd(width)}  ${i.detail}`);
    });
  }
  return lines.join('\n');
}

async function prompt(items, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  try {
    output.write('Chosen items go to .mcp.json and .claude/settings.json and are shared through git.\n');
    for (;;) {
      output.write(`${renderItems(items)}\n`);
      const answer = await rl.question('Numbers to toggle (e.g. "1 3"), "all" or "none"; Enter to confirm: ');
      if (!answer.trim()) return;
      const error = toggle(items, answer);
      if (error) output.write(`  ${error}\n`);
    }
  } finally {
    rl.close();
  }
}

function pick(items, kinds, value, flag) {
  const pool = items.filter((i) => kinds.includes(i.kind));
  if (value === true || value === '') throw new Error(`--${flag} needs a value: comma-separated names, "all" or "none"`);
  if (value === 'none') return [];
  if (value === 'all') return pool;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      const hit = pool.find((i) => i.name === name) ?? (flag === 'plugins' ? onlyOne(pool.filter((i) => i.name.split('@')[0] === name)) : null);
      if (!hit) throw new Error(`--${flag}: "${name}" is not available. Available: ${pool.map((i) => i.name).join(', ') || 'none'}`);
      return hit;
    });
}
const onlyOne = (list) => (list.length === 1 ? list[0] : null);

function toSelection(chosen, explicit) {
  return {
    catalog: chosen.filter((i) => i.kind === 'catalog').map((i) => i.name),
    servers: chosen.filter((i) => i.kind === 'server').map(({ name, scope, config, vars, notes }) => ({ name, scope, config, vars, notes })),
    plugins: chosen.filter((i) => i.kind === 'plugin').map(({ name, scope, marketplace, source }) => ({ id: name, scope, marketplace, source })),
    explicit,
  };
}

/**
 * Decide which MCP servers and plugins the project gets: --mcp/--plugins flags > previous choice
 * on update > prompt (init, TTY) > harness defaults.
 */
export async function chooseMcp(cwd, { flags = {}, manifest = null, isUpdate = false, interactive = process.stdin.isTTY && process.stdout.isTTY, home, env, input, output } = {}) {
  const hasFlags = flags.mcp !== undefined || flags.plugins !== undefined;
  if (isUpdate && !hasFlags) return defaultSelection(cwd, manifest);

  const { items, skipped } = candidates(cwd, { manifest, home, env });
  if (hasFlags) {
    const base = defaultSelection(cwd, manifest).catalog;
    const servers = flags.mcp !== undefined ? pick(items, ['catalog', 'server'], flags.mcp, 'mcp') : items.filter((i) => i.kind === 'catalog' && base.includes(i.name));
    const plugins = flags.plugins !== undefined ? pick(items, ['plugin'], flags.plugins, 'plugins') : [];
    return toSelection([...servers, ...plugins], true);
  }
  for (const s of skipped) log.info(`  - not offered: ${s}`);
  if (!interactive) {
    const extra = items.filter((i) => i.kind !== 'catalog').map((i) => i.name);
    if (extra.length) log.info(`  - also connected in your Claude Code: ${extra.join(', ')}. Add them with --mcp / --plugins.`);
    return defaultSelection(cwd, manifest);
  }
  await prompt(items, { input, output });
  return toSelection(items.filter((i) => i.selected), true);
}

// --- apply ---------------------------------------------------------------------------------
/**
 * Writes the selection into .mcp.json and .claude/settings.json. Returns the manifest state
 * ({servers: {name: hash of the harness config}}) and what changed, for the report.
 */
export async function applyMcp(cwd, selection, { previous = null, isExcluded = () => false } = {}) {
  const prevHashes = previous?.servers ?? {};
  const state = { servers: {} };
  const changes = { added: [], updated: [], removed: [], kept: [], plugins: [], vars: [], local: [], invalid: [] };

  const file = path.join(cwd, '.mcp.json');
  const before = readMcpJson(cwd);
  if (existsSync(file) && !isObj(before)) changes.invalid.push('.mcp.json');
  if (changes.invalid.length || isExcluded('.mcp.json')) state.servers = { ...prevHashes }; // left untouched: keep tracking
  else {
    const doc = isObj(before) ? structuredClone(before) : {};
    const servers = isObj(doc.mcpServers) ? doc.mcpServers : (doc.mcpServers = {});

    for (const c of catalog()) {
      const entry = servers[c.name];
      const known = prevHashes[c.name];
      const harnessOwned = isObj(entry) && (known ? entryHash(entry) === known : olderHarnessEntry(entry, c.config));
      if (selection.catalog.includes(c.name)) {
        if (!entry && known && !selection.explicit) continue; // deleted locally: stays out, like managed files
        if (!entry || harnessOwned) {
          if (!entry) changes.added.push(c.name);
          else if (!sameEntry(entry, c.config)) changes.updated.push(c.name);
          servers[c.name] = c.config;
          state.servers[c.name] = entryHash(c.config);
        } else if (known) {
          // Edited locally: keep it, say so once per harness change.
          if (known !== entryHash(c.config)) changes.kept.push(c.name);
          state.servers[c.name] = entryHash(c.config);
        }
        // An entry the harness never wrote (project's own) is left alone and not tracked.
      } else if (harnessOwned && (known || selection.explicit)) {
        delete servers[c.name];
        changes.removed.push(c.name);
      }
    }
    for (const s of selection.servers) {
      if (s.name in servers) continue;
      servers[s.name] = s.config;
      changes.added.push(s.name);
      if (s.vars.length) changes.vars.push({ name: s.name, scope: s.scope, vars: s.vars });
      if (s.notes.includes('home')) changes.local.push(s.name);
    }
    if ((before || Object.keys(servers).length) && !sameEntry(before ?? {}, doc)) {
      await writeFile(file, JSON.stringify(doc, null, 2) + '\n');
      changes.mcpJson = true;
    }
  }

  if (selection.plugins.length && !isExcluded('.claude/settings.json')) {
    const settingsFile = path.join(cwd, '.claude', 'settings.json');
    const current = readJsonSafe(settingsFile) ?? {};
    const doc = structuredClone(current);
    for (const p of selection.plugins) {
      doc.enabledPlugins = { ...doc.enabledPlugins, [p.id]: true };
      if (p.source && !doc.extraKnownMarketplaces?.[p.marketplace]) {
        doc.extraKnownMarketplaces = { ...doc.extraKnownMarketplaces, [p.marketplace]: { source: p.source } };
      }
      if (current.enabledPlugins?.[p.id] !== true) changes.plugins.push(p.id);
    }
    if (!sameEntry(current, doc)) {
      await writeFile(settingsFile, JSON.stringify(doc, null, 2) + '\n');
      changes.settings = true;
    }
  }
  return { state, changes };
}

export function printMcpChanges(changes, env = process.env) {
  if (changes.added.length) log.ok(`MCP servers added to .mcp.json: ${changes.added.join(', ')}`);
  if (changes.updated.length) log.ok(`MCP servers updated to the pinned version: ${changes.updated.join(', ')}`);
  if (changes.removed.length) log.ok(`MCP servers removed from .mcp.json: ${changes.removed.join(', ')}`);
  for (const f of changes.invalid) log.warn(`${f} is not valid JSON; left it unchanged. Fix it and rerun to add MCP servers.`);
  for (const name of changes.kept) log.warn(`.mcp.json: "${name}" was edited locally; kept it. The harness pins a newer config for it.`);
  for (const { name, scope, vars } of changes.vars) {
    const unset = vars.filter((v) => env[v] === undefined);
    log.warn(`"${name}" reads ${vars.join(', ')} from the environment (secrets stay out of git)${unset.length ? `; not set in this shell: ${unset.join(', ')}` : ''}`);
    if (scope === 'user') log.info(`    The project entry now takes precedence over your user-scope "${name}": export those variables, e.g. in your shell profile.`);
  }
  for (const name of changes.local) log.warn(`"${name}" runs from your home directory (\${HOME}/...); teammates need the same local install.`);
  if (changes.plugins.length) {
    log.ok(`plugins enabled in .claude/settings.json: ${changes.plugins.join(', ')}`);
    log.info(`    Teammates install them with: claude plugin install <name@marketplace> --scope project`);
  }
}
