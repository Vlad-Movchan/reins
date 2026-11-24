# Governance

| Requirement | Implementation | Check |
|-------------|----------------|-------|
| Agent file access | `permissions.deny` + `sdd-protect-secrets` hook (Read/Edit/Grep/Glob/Bash, incl. `cat .env`, `git show :.env`, `.env*` globs, `printenv`) fail-closed | `npm test` (hook tests); try `cat .env` in a session |
| Secrets | `sdd-prompt-guard` rejects prompts containing secrets; hooks keep files out of context | `specjig audit-secrets` finds nothing |
| Data | `.claude/rules/test-data.md`, `data/real|prod|pii|phi`, dumps and backups blocked | review fixtures are generated |
| Project policy | `AGENTS.md` → Client restrictions + Governance | section exists |
| Hooks as guardrails | fix mode freezes tests/specs; Change-Id on commits (Claude hook + git hook + CI) | hook fires, agent corrects |
| Cost | label-triggered CI agents, `--max-turns`, path pre-filter before any LLM call | workflow settings |

Per-participant budgets are not a `settings.json` feature: set them as workspace spend limits in
the Anthropic Console (or your provider) and use one API key per workspace.

Hooks are guardrails, not a sandbox. For OS-level enforcement on Bash, enable Claude Code's
sandbox (`/sandbox`); `Read(...)` deny rules are applied to sandboxed commands too.
