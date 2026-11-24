#!/usr/bin/env node
// Managed by reins. Publishes a read-only, human-readable slice of openspec/specs/ to
// Confluence: one page per capability under a parent page. Pages carry a banner saying edits
// happen through an OpenSpec change; Confluence comments are input for the next change.
//
// Env: CONFLUENCE_BASE_URL (e.g. https://acme.atlassian.net/wiki or https://wiki.acme.com)
//      CONFLUENCE_TOKEN    API token (Cloud, with CONFLUENCE_USER) or personal access token (Server/DC)
//      CONFLUENCE_USER     optional; when set, basic auth user:token (Cloud)
// Config: .sdd/harness.json -> confluence.spaceKey, confluence.parentPageId, confluence.titlePrefix
// Flags:  --dry-run  print what would be published
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config, git } from './lib.mjs';

const dryRun = process.argv.includes('--dry-run');
const cfg = config().confluence ?? {};
const { CONFLUENCE_BASE_URL: base, CONFLUENCE_TOKEN: token, CONFLUENCE_USER: user, GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;
if (!dryRun && (!base || !token || !cfg.spaceKey || !cfg.parentPageId)) {
  console.error('Missing CONFLUENCE_BASE_URL / CONFLUENCE_TOKEN or confluence.spaceKey / parentPageId in .sdd/harness.json');
  process.exit(1);
}
const auth = user ? `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` : `Bearer ${token}`;

async function api(method, p, body) {
  const res = await fetch(`${base.replace(/\/$/, '')}/rest/api${p}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- minimal Markdown → Confluence storage format -----------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function toStorage(md) {
  const out = [];
  let list = false;
  let code = null;
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    if (code !== null) {
      if (line.startsWith('```')) {
        out.push(`<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${code.join('\n')}]]></ac:plain-text-body></ac:structured-macro>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      code = [];
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (!li && list) {
      out.push('</ul>');
      list = false;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (li) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(li[1])}</li>`);
    } else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

function capabilities(dir = path.join('openspec', 'specs'), baseDir = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? capabilities(path.join(dir, e.name), baseDir)
      : e.name === 'spec.md'
        ? [{ id: path.relative(baseDir, dir).split(path.sep).join('/'), file: path.join(dir, e.name) }]
        : [],
  );
}

const sha = git('rev-parse', '--short', 'HEAD');
const repoUrl = GITHUB_SERVER_URL && GITHUB_REPOSITORY ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}` : null;
const banner = (cap) =>
  `<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Read-only export of <code>openspec/specs/${esc(cap.id)}</code> at <code>${sha}</code>.` +
  `${repoUrl ? ` <a href="${repoUrl}/blob/${sha}/${cap.file}">Source</a>.` : ''} Changes happen through an OpenSpec change; comment here and the team turns comments into the next change.</p></ac:rich-text-body></ac:structured-macro>`;

for (const cap of capabilities()) {
  const title = `${cfg.titlePrefix ?? ''}${cap.id}`;
  const body = banner(cap) + '\n' + toStorage(readFileSync(cap.file, 'utf8'));
  if (dryRun) {
    console.log(`would publish "${title}" (${body.length} chars)`);
    continue;
  }
  const found = await api('GET', `/content?spaceKey=${encodeURIComponent(cfg.spaceKey)}&title=${encodeURIComponent(title)}&expand=version`);
  const page = found.results?.[0];
  const payload = { type: 'page', title, space: { key: cfg.spaceKey }, ancestors: [{ id: String(cfg.parentPageId) }], body: { storage: { value: body, representation: 'storage' } } };
  if (page) {
    await api('PUT', `/content/${page.id}`, { ...payload, id: page.id, version: { number: page.version.number + 1, message: `openspec ${sha}` } });
    console.log(`updated ${title}`);
  } else {
    await api('POST', '/content', payload);
    console.log(`created ${title}`);
  }
}
