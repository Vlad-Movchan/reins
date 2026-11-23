#!/usr/bin/env node
// Managed by sdd-harness. UserPromptSubmit guard: a prompt that contains something shaped like a
// secret is rejected before it reaches the model, the transcript or the session history.
import { findSecrets } from './sdd-lib/patterns.mjs';
import { readHookInput } from './sdd-lib/io.mjs';

const input = await readHookInput();
const hits = findSecrets(input.prompt ?? '');
if (hits.length) {
  const kinds = [...new Set(hits.map((h) => h.name))].join(', ');
  process.stderr.write(
    `[sdd-harness] Prompt rejected: it looks like it contains a secret (${kinds}). ` +
      'Remove it and reference the variable name instead (e.g. $STRIPE_KEY). Rotate the secret if it was real.\n',
  );
  process.exit(2);
}
process.exit(0);
