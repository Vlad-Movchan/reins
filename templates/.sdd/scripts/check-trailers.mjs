#!/usr/bin/env node
// Managed by reins. CI: every commit in base..head carries a valid Change-Id trailer.
// Usage: node .sdd/scripts/check-trailers.mjs <base-sha> [head-sha]
import { checkMessage } from '../../.claude/hooks/sdd-lib/change-id.mjs';
import { git, setOutput } from './lib.mjs';

const [base, head = 'HEAD'] = process.argv.slice(2);
if (!base) throw new Error('usage: check-trailers.mjs <base> [head]');

const shas = git('rev-list', '--no-merges', `${base}..${head}`).split('\n').filter(Boolean);
const failures = [];
const ids = new Set();
for (const sha of shas) {
  const message = git('log', '-1', '--format=%B', sha);
  const error = checkMessage(message);
  if (error) failures.push(`${sha.slice(0, 8)} ${message.split('\n')[0]}\n    → ${error}`);
  const id = message.match(/^Change-Id:\s*([a-z0-9-]+)/im)?.[1];
  if (id && id !== 'none') ids.add(id);
}

setOutput('change_ids', [...ids].join(' '));
if (failures.length) {
  console.error(`::error::${failures.length} commit(s) without a valid Change-Id trailer`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`All ${shas.length} commit(s) carry a valid Change-Id. Changes: ${[...ids].join(', ') || 'none'}`);
