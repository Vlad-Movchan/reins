#!/usr/bin/env node
// Managed by specjig. CI: a fix PR from the triage agent may not touch tests or specs.
// Second line of defence after the SDD_MODE=fix hook (the hook can be bypassed; the diff can't).
// Usage: node .sdd/scripts/fix-pr-guard.mjs <base-sha> [head-sha]
import { changedFiles, config, matcher } from './lib.mjs';

const [base, head = 'HEAD'] = process.argv.slice(2);
const cfg = config();
const frozen = matcher([...(cfg.fixMode?.frozenPaths ?? []), 'openspec/**', '.claude/**', '.github/**', '.sdd/**']);
const violations = changedFiles(base, head).filter(frozen);

if (violations.length) {
  console.error('::error::Fix PR touches frozen paths (tests, specs, harness or workflows):');
  for (const f of violations) console.error(`  ${f}`);
  process.exit(1);
}
console.log('Fix PR touches no tests, specs or harness files.');
