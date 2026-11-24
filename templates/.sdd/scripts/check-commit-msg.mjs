#!/usr/bin/env node
// Managed by specjig. Used by .githooks/commit-msg: validates the Change-Id trailer.
import { readFileSync } from 'node:fs';
import { checkMessage } from '../../.claude/hooks/sdd-lib/change-id.mjs';

const message = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n');
const error = checkMessage(message);
if (error) {
  console.error(`commit-msg: ${error}`);
  console.error('Add a trailer line at the end of the message, e.g.:\n\n  Change-Id: add-csv-export\n');
  process.exit(1);
}
