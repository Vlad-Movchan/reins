#!/usr/bin/env node
// Maintainer script: keeps vendor/skills/* in sync with the SHAs pinned in harness.lock.json.
//
//   node scripts/vendor.mjs            re-download every skill at its pinned SHA (idempotent)
//   node scripts/vendor.mjs --check    report skills whose upstream path has newer commits; exit 1 if any
//   node scripts/vendor.mjs --update   move pins to the latest commit that touched each skill path, then re-download
//   ... --only grilling                limit to one skill (by dest)
//
// Auth: GITHUB_TOKEN env, else `gh auth token`, else anonymous (60 req/h).
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'harness.lock.json');
const VENDOR = path.join(ROOT, 'vendor', 'skills');

const args = process.argv.slice(2);
const mode = args.includes('--check') ? 'check' : args.includes('--update') ? 'update' : 'sync';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const TOKEN = token();

async function gh(apiPath) {
  const res = await fetch(`https://api.github.com/${apiPath}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sdd-harness-vendor',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${apiPath}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function raw(repo, sha, file) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`);
  if (!res.ok) throw new Error(`raw ${repo}@${sha}/${file}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function latestShaFor(skill) {
  const q = `repos/${skill.repo}/commits?sha=${encodeURIComponent(skill.branch)}&path=${encodeURIComponent(skill.path)}&per_page=1`;
  const [commit] = await gh(q);
  if (!commit) throw new Error(`No commits for ${skill.repo}/${skill.path} on ${skill.branch}`);
  return { sha: commit.sha, date: commit.commit.committer.date, message: commit.commit.message.split('\n')[0] };
}

function renameFrontmatter(buf, rename) {
  let text = buf.toString('utf8');
  for (const [key, value] of Object.entries(rename)) {
    text = text.replace(new RegExp(`^(${key}:)\\s*.*$`, 'm'), `$1 ${value}`);
  }
  return Buffer.from(text);
}

async function download(skill) {
  const tree = await gh(`repos/${skill.repo}/git/trees/${skill.sha}?recursive=1`);
  const prefix = skill.path.replace(/\/?$/, '/');
  const files = tree.tree
    .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
    .map((e) => e.path.slice(prefix.length))
    .filter((rel) => !(skill.exclude ?? []).some((ex) => rel.startsWith(ex)));
  if (!files.includes('SKILL.md')) throw new Error(`${skill.repo}/${skill.path}@${skill.sha} has no SKILL.md`);

  const dest = path.join(VENDOR, skill.dest);
  await rm(dest, { recursive: true, force: true });
  for (const rel of files) {
    let content = await raw(skill.repo, skill.sha, prefix + rel);
    if (rel === 'SKILL.md' && skill.rename) content = renameFrontmatter(content, skill.rename);
    const out = path.join(dest, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, content);
  }
  const repoInfo = await gh(`repos/${skill.repo}`);
  await writeFile(
    path.join(dest, '.upstream.json'),
    JSON.stringify(
      {
        repo: skill.repo,
        path: skill.path,
        sha: skill.sha,
        license: repoInfo.license?.spdx_id ?? 'UNKNOWN',
        url: `https://github.com/${skill.repo}/tree/${skill.sha}/${skill.path}`,
        note: 'Vendored by sdd-harness. Do not edit; bump the pin in harness.lock.json instead.',
      },
      null,
      2,
    ) + '\n',
  );
  return files.length;
}

const lock = JSON.parse(await readFile(LOCK, 'utf8'));
const skills = lock.skills.filter((s) => !only || s.dest === only);
let outdated = 0;

for (const skill of skills) {
  if (mode === 'sync') {
    const n = await download(skill);
    console.log(`synced  ${skill.dest.padEnd(26)} ${skill.repo}@${skill.sha.slice(0, 7)} (${n} files)`);
    continue;
  }
  const latest = await latestShaFor(skill);
  if (latest.sha === skill.sha) {
    console.log(`current ${skill.dest.padEnd(26)} ${skill.sha.slice(0, 7)}`);
    continue;
  }
  outdated++;
  const compare = `https://github.com/${skill.repo}/compare/${skill.sha.slice(0, 12)}...${latest.sha.slice(0, 12)}`;
  console.log(`newer   ${skill.dest.padEnd(26)} ${skill.sha.slice(0, 7)} -> ${latest.sha.slice(0, 7)} (${latest.date}) "${latest.message}"`);
  console.log(`        review: ${compare}`);
  if (mode === 'update') {
    skill.sha = latest.sha;
    await download(skill);
  }
}

if (mode === 'update' && outdated) {
  await writeFile(LOCK, JSON.stringify(lock, null, 2) + '\n');
  console.log(`\nUpdated ${outdated} pin(s). Review the vendor/ diff, then release a new harness version.`);
}
if (mode === 'check' && outdated) process.exit(1);
