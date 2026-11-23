#!/usr/bin/env node
// Managed by sdd-harness. PreToolUse guard on Bash: `git commit` made by the agent must carry a
// valid `Change-Id:` trailer, so `git blame` -> commit -> openspec change always resolves.
// The .githooks/commit-msg hook enforces the same rule for humans; this hook gives the agent
// the feedback before git runs.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { activeChanges, changeExists, NONE } from './sdd-lib/change-id.mjs';
import { block, projectDir, readHookInput } from './sdd-lib/io.mjs';

const input = await readHookInput();
const cmd = input.tool_input?.command ?? '';
if (!/\bgit\s+(-c\s+\S+\s+)*commit\b/.test(cmd)) process.exit(0);
if (/--amend\b.*--no-edit|--no-edit\b.*--amend/.test(cmd)) process.exit(0);

const cwd = projectDir(input);
let id = null;
const inline = cmd.match(/Change-Id[:=]\s*([a-z0-9][a-z0-9-]*)/i);
if (inline) id = inline[1].toLowerCase();
const fileArg = cmd.match(/(?:-F|--file)[=\s]+("[^"]+"|'[^']+'|\S+)/);
if (!id && fileArg) {
  const f = path.resolve(cwd, fileArg[1].replace(/^["']|["']$/g, ''));
  if (existsSync(f)) id = readFileSync(f, 'utf8').match(/^Change-Id:\s*([a-z0-9-]+)/im)?.[1] ?? null;
}

const hint = () => {
  const active = activeChanges(cwd);
  return active.length
    ? `Active changes: ${active.join(', ')}.`
    : 'No active change found; use "none" only for work without a behavior change.';
};

if (!id) {
  block(`git commit without a Change-Id trailer. Add it with --trailer "Change-Id: <change-name>" (or "Change-Id: ${NONE}" for deps/format/CI-only work). ${hint()}`);
}
if (!changeExists(id, cwd)) {
  block(`Change-Id "${id}" does not exist in openspec/changes/. ${hint()}`);
}
process.exit(0);
