// Managed by sdd-harness. Minimal helpers for Claude Code hook scripts.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export async function readHookInput() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
}

/** Block the tool call: exit 2 sends `reason` back to the agent as feedback. */
export function block(reason) {
  process.stderr.write(`[sdd-harness] Blocked: ${reason}\n`);
  process.exit(2);
}

export function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

export function harnessConfig(cwd) {
  const file = path.join(cwd, '.sdd', 'harness.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
