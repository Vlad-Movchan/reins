#!/usr/bin/env node
// Managed by reins. Builds release notes from openspec/changes/archive/ for a period.
// Archive folders are named YYYY-MM-DD-<change-id>, so the period filter needs no git history.
//
// Usage: node .sdd/scripts/release-notes.mjs --since 2026-11-01 [--until 2026-11-30] [--out notes.md]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const since = arg('since', '0000-00-00');
const until = arg('until', '9999-99-99');
const out = arg('out');

const archive = path.join('openspec', 'changes', 'archive');
const dirs = existsSync(archive)
  ? readdirSync(archive)
      .filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d))
      .filter((d) => d.slice(0, 10) >= since && d.slice(0, 10) <= until)
      .sort()
  : [];

function section(md, title) {
  const m = md.match(new RegExp(`^##\\s+${title}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm'));
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
}

function walkSpecs(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkSpecs(path.join(dir, e.name), base) : e.name === 'spec.md' ? [path.relative(base, dir)] : [],
  );
}

const groups = { high: [], low: [], unknown: [] };
for (const d of dirs) {
  const proposalFile = path.join(archive, d, 'proposal.md');
  const proposal = existsSync(proposalFile) ? readFileSync(proposalFile, 'utf8') : '';
  const risk = section(proposal, 'Risk').match(/Level:\s*(low|high)/i)?.[1]?.toLowerCase() ?? 'unknown';
  const why = section(proposal, 'Why').split('\n').join(' ');
  const what = section(proposal, 'What Changes');
  const caps = walkSpecs(path.join(archive, d, 'specs'));
  groups[risk].push({ id: d.slice(11), date: d.slice(0, 10), dir: d, why, what, caps });
}

const lines = [`# Release notes ${since === '0000-00-00' ? '' : `${since} → `}${until === '9999-99-99' ? 'today' : until}`, ''];
const total = dirs.length;
if (!total) lines.push('_No archived changes in this period._');
for (const [risk, title] of [['high', 'Significant changes'], ['low', 'Other changes'], ['unknown', 'Unclassified']]) {
  if (!groups[risk].length) continue;
  lines.push(`## ${title}`, '');
  for (const c of groups[risk]) {
    lines.push(`### ${c.id} (${c.date})`, '');
    if (c.why) lines.push(c.why, '');
    if (c.what) lines.push(c.what, '');
    if (c.caps.length) lines.push(`Specs: ${c.caps.map((s) => `\`${s}\``).join(', ')} · [change](openspec/changes/archive/${c.dir}/proposal.md)`, '');
  }
}
const md = lines.join('\n');
if (out) writeFileSync(out, md);
else console.log(md);
