#!/usr/bin/env node
// Managed by reins. CI pre-filter for the drift check (cheap, no LLM):
// did domain code change in this PR without any delta spec and without the low-risk label?
// If yes, the workflow asks an agent whether behavior actually changed (refactors and renames
// are not drift) and posts a warning. The check never blocks the PR.
//
// Usage: node .sdd/scripts/drift-check.mjs <base-sha> [head-sha]   (env PR_LABELS="a,b")
import { changedFiles, config, matcher, setOutput } from './lib.mjs';

const [base, head = 'HEAD'] = process.argv.slice(2);
const cfg = config();
const labels = (process.env.PR_LABELS ?? '').split(',').map((s) => s.trim());

const files = changedFiles(base, head);
const isDomain = matcher(cfg.domainPaths ?? ['src/**']);
const isIgnored = matcher(cfg.ignoreForDrift ?? []);
const domain = files.filter((f) => isDomain(f) && !isIgnored(f));
const deltaSpecs = files.filter((f) => /^openspec\/changes\/(?!archive\/)[^/]+\/specs\/.+\.md$/.test(f));
const skipSpecs = files.some((f) => /^openspec\/changes\/[^/]+\/\.openspec\.yaml$/.test(f));

let verdict = 'ok';
if (labels.includes('low-risk')) verdict = 'skip:low-risk';
else if (!domain.length) verdict = 'skip:no-domain-changes';
else if (deltaSpecs.length) verdict = 'ok:delta-specs-present';
else verdict = 'needs-review';

setOutput('verdict', verdict);
setOutput('needs_review', verdict === 'needs-review');
setOutput('domain_files', domain.join('\n'));
console.log(`domain files: ${domain.length}, delta specs: ${deltaSpecs.length}, change metadata touched: ${skipSpecs}`);
