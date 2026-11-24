import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyFiles } from '../src/lib/install.mjs';
import { catalog, chooseMcp, detectConnected, entryHash, portableServer, renderItems, toggle } from '../src/lib/mcp.mjs';

// Fake secrets, assembled at runtime so the repository never contains a token-shaped literal.
const GH_TOKEN = ['ghp', 'A'.repeat(36)].join('_');
const CTX_KEY = 'ctx7sk-0123456789abcdef0123456789abcdef0';

const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));
const readJson = (dir, f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
const writeJson = (file, data) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
};
const playwright = () => catalog().find((c) => c.name === 'playwright');
const quiet = { interactive: false, env: {} };

/** A fake home with Claude Code config: user- and local-scope servers, plugins, marketplaces. */
function fakeHome(project) {
  const home = tmp('sdd-home-');
  writeJson(path.join(home, '.claude.json'), {
    mcpServers: {
      context7: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp', '--api-key', CTX_KEY], env: {} },
      docker: { command: 'docker', args: ['mcp', 'gateway', 'run'] },
      github: { type: 'http', url: 'https://api.example.com/mcp/', headers: { Authorization: `Bearer ${GH_TOKEN}` } },
      notes: { command: `${home}/tools/notes-mcp`, args: [], env: { NOTES_DB: `${home}/notes.db` } },
    },
    projects: { [project]: { mcpServers: { docker: { command: 'docker', args: ['mcp', 'gateway', 'run', '--local'] } } } },
  });
  writeJson(path.join(home, '.claude', 'settings.json'), {
    enabledPlugins: { 'skills@claude-plugins-official': true, 'tdd@team-market': true, 'old@claude-plugins-official': false, 'mine@local-market': true, 'muted@team-market': true },
  });
  writeJson(path.join(project, '.claude', 'settings.local.json'), { enabledPlugins: { 'muted@team-market': false } });
  writeJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json'), {
    'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } },
    'team-market': { source: { source: 'github', repo: 'acme/claude-plugins' }, installLocation: '/x', lastUpdated: 'now' },
    'local-market': { source: { source: 'directory', path: '/Users/me/market' } },
  });
  return home;
}

test('portableServer moves secrets to ${VAR} references and the home directory to ${HOME}', () => {
  const home = '/Users/dev';
  const ctx = portableServer('context7', { command: 'npx', args: ['-y', '@upstash/context7-mcp', '--api-key', CTX_KEY] }, { home });
  assert.deepEqual(ctx.config.args, ['-y', '@upstash/context7-mcp', '--api-key', '${CONTEXT7_API_KEY}']);
  assert.deepEqual(ctx.vars, ['CONTEXT7_API_KEY']);

  const eq = portableServer('svc', { command: 'svc', args: ['--token=abc123', '--verbose', GH_TOKEN] }, { home });
  assert.deepEqual(eq.config.args, ['--token=${SVC_TOKEN}', '--verbose', '${SVC_ARG2}']);

  const env = portableServer('db', { command: `${home}/bin/db-mcp`, args: [`${home}/data`], env: { DB_PASSWORD: 'hunter2', REGION: 'eu', KEEP: '${ALREADY}' } }, { home });
  assert.equal(env.config.command, '${HOME}/bin/db-mcp');
  assert.deepEqual(env.config.args, ['${HOME}/data']);
  assert.deepEqual(env.config.env, { DB_PASSWORD: '${DB_PASSWORD}', REGION: '${REGION}', KEEP: '${ALREADY}' });
  assert.deepEqual(env.notes, ['home']);

  const remote = portableServer('github', {
    type: 'http',
    url: 'https://user:s3cretpass@api.example.com/mcp?apiKey=abc&page=2',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, X_API_KEY: 'k' },
    oauth: { clientId: 'public-id', clientSecret: 'shh' },
  }, { home });
  assert.equal(remote.config.url, 'https://user:${GITHUB_PASSWORD}@api.example.com/mcp?apiKey=${GITHUB_APIKEY}&page=2');
  assert.deepEqual(remote.config.headers, { Authorization: 'Bearer ${GITHUB_TOKEN}', X_API_KEY: '${X_API_KEY}' });
  assert.deepEqual(remote.config.oauth, { clientId: 'public-id', clientSecret: '${GITHUB_OAUTH_CLIENTSECRET}' });

  const plain = portableServer('docker', { command: 'docker', args: ['mcp', 'gateway', 'run'] }, { home });
  assert.deepEqual(plain, { config: { command: 'docker', args: ['mcp', 'gateway', 'run'] }, vars: [], notes: [] });

  for (const r of [ctx, eq, env, remote]) {
    const text = JSON.stringify(r.config);
    for (const secret of [CTX_KEY, GH_TOKEN, 'abc123', 'hunter2', 's3cretpass', 'shh', '/Users/dev']) assert.ok(!text.includes(secret), secret);
  }
});

test('detectConnected reads user and local servers and enabled plugins without changing anything', () => {
  const project = tmp('sdd-mcp-');
  const home = fakeHome(project);
  const { servers, plugins } = detectConnected(project, { home, env: {} });

  assert.deepEqual(servers.map((s) => `${s.name}:${s.scope}`), ['docker:local', 'context7:user', 'github:user', 'notes:user']);
  assert.ok(servers[0].config.args.includes('--local'), 'local scope wins over user scope');

  const byId = Object.fromEntries(plugins.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(byId).sort(), ['mine@local-market', 'skills@claude-plugins-official', 'tdd@team-market']);
  assert.equal(byId['skills@claude-plugins-official'].source, null);
  assert.deepEqual(byId['tdd@team-market'].source, { source: 'github', repo: 'acme/claude-plugins' });
  assert.match(byId['mine@local-market'].error, /local directory/);
});

test('without a terminal init installs the harness defaults only; flags pick the rest', async () => {
  const project = tmp('sdd-mcp-');
  const home = fakeHome(project);

  const plain = await chooseMcp(project, { ...quiet, home });
  assert.deepEqual(plain, { catalog: ['playwright'], servers: [], plugins: [], explicit: false });

  const picked = await chooseMcp(project, { ...quiet, home, flags: { mcp: 'context7,docker', plugins: 'tdd' } });
  assert.deepEqual(picked.catalog, []);
  assert.deepEqual(picked.servers.map((s) => s.name), ['context7', 'docker']);
  assert.deepEqual(picked.plugins.map((p) => p.id), ['tdd@team-market']);

  const none = await chooseMcp(project, { ...quiet, home, flags: { mcp: 'none' } });
  assert.deepEqual([none.catalog, none.servers, none.plugins], [[], [], []]);

  const all = await chooseMcp(project, { ...quiet, home, flags: { plugins: 'all' } });
  assert.deepEqual(all.catalog, ['playwright'], '--plugins alone keeps the default servers');
  assert.deepEqual(all.plugins.map((p) => p.id), ['skills@claude-plugins-official', 'tdd@team-market']);

  await assert.rejects(chooseMcp(project, { ...quiet, home, flags: { mcp: 'nope' } }), /"nope" is not available/);
  await assert.rejects(chooseMcp(project, { ...quiet, home, flags: { mcp: true } }), /needs a value/);
  await assert.rejects(chooseMcp(project, { ...quiet, home, flags: { plugins: 'mine' } }), /not available/, 'local marketplaces are not offered');
});

test('prompt answers toggle items', () => {
  const items = [
    { kind: 'catalog', name: 'playwright', selected: true, detail: 'd' },
    { kind: 'server', name: 'context7', selected: true, detail: 'd' },
    { kind: 'plugin', name: 'tdd@team-market', selected: false, detail: 'd' },
  ];
  assert.equal(toggle(items, '1, 3'), null);
  assert.deepEqual(items.map((i) => i.selected), [false, true, true]);
  assert.match(toggle(items, '4 x'), /not on the list: 4, x/);
  assert.equal(toggle(items, 'none'), null);
  assert.ok(items.every((i) => !i.selected));
  toggle(items, 'all');
  assert.match(renderItems(items), /Harness MCP servers\n\s+1\. \[x\] playwright[\s\S]*connected in your Claude Code\n\s+2\. \[x\] context7[\s\S]*Plugins[\s\S]*3\. \[x\] tdd@team-market/);
});

test('init writes chosen servers to .mcp.json and plugins to settings, never the secrets', async () => {
  const project = tmp('sdd-mcp-');
  const home = fakeHome(project);
  const mcp = await chooseMcp(project, { ...quiet, home, flags: { mcp: 'playwright,context7,github,notes', plugins: 'skills,tdd' } });
  const report = await applyFiles(project, { mcp });

  const servers = readJson(project, '.mcp.json').mcpServers;
  assert.deepEqual(Object.keys(servers), ['playwright', 'context7', 'github', 'notes']);
  assert.deepEqual(servers.playwright, playwright().config);
  assert.equal(servers.context7.args.at(-1), '${CONTEXT7_API_KEY}');
  assert.equal(servers.github.headers.Authorization, 'Bearer ${GITHUB_TOKEN}');
  assert.equal(servers.notes.command, '${HOME}/tools/notes-mcp');
  const text = readFileSync(path.join(project, '.mcp.json'), 'utf8');
  for (const secret of [CTX_KEY, GH_TOKEN, home]) assert.ok(!text.includes(secret));

  const settings = readJson(project, '.claude/settings.json');
  assert.deepEqual(settings.enabledPlugins, { 'skills@claude-plugins-official': true, 'tdd@team-market': true });
  assert.deepEqual(settings.extraKnownMarketplaces, { 'team-market': { source: { source: 'github', repo: 'acme/claude-plugins' } } });
  assert.ok(settings.hooks.PreToolUse.length > 0, 'template settings are still merged in');

  assert.deepEqual(readJson(project, '.sdd/manifest.json').mcp, { servers: { playwright: entryHash(playwright().config) } });
  assert.deepEqual(report.mcp.added, ['playwright', 'context7', 'github', 'notes']);
  assert.deepEqual(report.mcp.vars.map((v) => v.name), ['context7', 'github', 'notes']);
});

test('update refreshes an untouched harness server, keeps edits and imported servers', async () => {
  const project = tmp('sdd-mcp-');
  await applyFiles(project);
  const mcpFile = path.join(project, '.mcp.json');
  const manifestFile = path.join(project, '.sdd/manifest.json');

  // Simulate an install made with an older pin, plus a server the project added itself.
  const old = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.1', '--isolated'] };
  writeJson(mcpFile, { mcpServers: { playwright: old, own: { command: 'own-mcp' } } });
  const manifest = readJson(project, '.sdd/manifest.json');
  manifest.mcp.servers.playwright = entryHash(old);
  writeJson(manifestFile, manifest);

  let report = await applyFiles(project, { isUpdate: true });
  assert.deepEqual(readJson(project, '.mcp.json').mcpServers, { playwright: playwright().config, own: { command: 'own-mcp' } });
  assert.deepEqual(report.mcp.updated, ['playwright']);

  // A local edit survives the update.
  const edited = { ...playwright().config, args: [...playwright().config.args, '--headless'] };
  writeJson(mcpFile, { mcpServers: { playwright: edited } });
  report = await applyFiles(project, { isUpdate: true });
  assert.deepEqual(readJson(project, '.mcp.json').mcpServers.playwright, edited);
  assert.deepEqual(report.mcp.kept, [], 'no warning while the harness config is unchanged');

  // Deleting the entry is an opt-out that update respects.
  writeJson(mcpFile, { mcpServers: {} });
  await applyFiles(project, { isUpdate: true });
  assert.deepEqual(readJson(project, '.mcp.json').mcpServers, {});
  assert.deepEqual(readJson(project, '.sdd/manifest.json').mcp.servers, {});
});

test('an explicit choice removes an untouched harness server; manifests from 0.2.0 and earlier are migrated', async () => {
  const project = tmp('sdd-mcp-');
  // An install from 0.2.0 or earlier: the template wrote playwright and the manifest has no "mcp" key.
  writeJson(path.join(project, '.mcp.json'), { mcpServers: { playwright: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.2', '--isolated'] } } });
  writeJson(path.join(project, '.sdd/manifest.json'), { harnessVersion: '0.2.0', openspec: { mode: 'install' }, files: {} });

  const remembered = await chooseMcp(project, { ...quiet, isUpdate: true, manifest: readJson(project, '.sdd/manifest.json') });
  assert.deepEqual(remembered.catalog, ['playwright']);
  await applyFiles(project, { isUpdate: true, mcp: remembered });
  assert.deepEqual(readJson(project, '.mcp.json').mcpServers.playwright, playwright().config, 'old pin replaced, args not duplicated');

  const none = await chooseMcp(project, { ...quiet, isUpdate: true, flags: { mcp: 'none' }, manifest: readJson(project, '.sdd/manifest.json'), home: tmp('sdd-home-') });
  await applyFiles(project, { isUpdate: true, mcp: none });
  assert.deepEqual(readJson(project, '.mcp.json').mcpServers, {});
});

test('a project .mcp.json that is not valid JSON is left alone', async () => {
  const project = tmp('sdd-mcp-');
  writeFileSync(path.join(project, '.mcp.json'), '{ broken');
  const report = await applyFiles(project);
  assert.equal(readFileSync(path.join(project, '.mcp.json'), 'utf8'), '{ broken');
  assert.deepEqual(report.mcp.invalid, ['.mcp.json']);
});
