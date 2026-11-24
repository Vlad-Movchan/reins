#!/usr/bin/env node
// Managed by reins. PreToolUse guard: the agent never reads, greps, globs, edits or
// shell-accesses secret-bearing files (.env, keys, credentials, DB dumps, real-data folders),
// and never dumps the environment. Complements permissions.deny in .claude/settings.json:
// deny rules cover exact paths, this hook covers variants (nested paths, globs, `git show :.env`).
import { protectedCommand, protectedPath } from './sdd-lib/patterns.mjs';
import { block, projectDir, readHookInput } from './sdd-lib/io.mjs';

const input = await readHookInput();
const cwd = projectDir(input);
const t = input.tool_input ?? {};

const pathFields = [t.file_path, t.path, t.notebook_path].filter(Boolean);
for (const p of pathFields) {
  const reason = protectedPath(p, cwd);
  if (reason) block(`${reason}. Secrets stay out of the agent context. Ask the human for the *names* of the variables you need, or read .env.example.`);
}

// Glob / Grep patterns that target secret files, e.g. "**/.env*" or glob: "*.pem".
for (const pattern of [t.pattern, t.glob].filter(Boolean)) {
  if (input.tool_name === 'Grep' && pattern === t.pattern) continue; // Grep's pattern is a regex over content
  if (/\.env(?![\w.-]*\.(example|sample|template))/i.test(pattern) || /\.(pem|key|p12|pfx)\b/i.test(pattern)) {
    block(`the pattern "${pattern}" targets secret-bearing files.`);
  }
}

if (input.tool_name === 'Bash') {
  const reason = protectedCommand(t.command, cwd);
  if (reason) block(`${reason}. If a command genuinely needs secrets, the human runs it outside the agent session.`);
}

process.exit(0);
