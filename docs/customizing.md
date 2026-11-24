# Customizing

The harness is meant to be adapted per project without forking it. Everything below survives
`specjig update`.

## `.sdd/harness.json`

Created once by `init`, owned by the project afterwards. Read by hooks and CI scripts.

| Key | Used by | Meaning |
|-----|---------|---------|
| `exclude` | `init`, `update` | Globs of harness files to leave out, e.g. `".github/workflows/sdd-confluence-sync.yml"`, `".claude/skills/spec-compaction/**"` |
| `layers` | agents (`impact`, `tasks`) | Layer name → path globs. Tasks are grouped and applied per layer |
| `domainPaths` | drift check | Code whose behavior specs describe |
| `ignoreForDrift` | drift check | Paths inside `domainPaths` that never count as drift (tests, docs, snapshots) |
| `fixMode.frozenPaths` | fix-mode hook, fix-PR guard | What the CI triage agent may never touch (`openspec/` is always frozen) |
| `guard.extraSecretPaths` | secrets hook | Extra globs to block, e.g. `"config/credentials/**"`, `"*.tfstate"` |
| `confluence.*` | Confluence sync | `spaceKey`, `parentPageId`, `titlePrefix` |

## Leaving things out

- Delete any managed file (a workflow, a skill, a rule). `update` treats the deletion as a decision
  and does not restore it.
- Or list it in `exclude` before running `init`.
- `AGENTS.md`/`CLAUDE.md` text outside the `specjig` markers is yours.

## Adding your own

| What | Where | Notes |
|------|-------|-------|
| Project facts, commands, client restrictions | `AGENTS.md`, outside the markers | Loaded by Claude Code through `@AGENTS.md` in `CLAUDE.md` and read by other agents directly |
| Rules | `.claude/rules/<name>.md` | Use `paths:` frontmatter to scope a rule to part of the codebase |
| Skills | `.claude/skills/<name>/SKILL.md` | Don't use the names of harness skills |
| Permissions, hooks | `.claude/settings.json` | Merged on update: your entries stay, harness `sdd-*` hook entries are refreshed |
| OpenSpec rules per artifact | `openspec/config.yaml` | `context`, `rules.<artifact>`, `operations.apply/archive.guidance` |
| MCP servers | `.mcp.json` | Merged like settings |

## Changing a harness file

Edit it in place. On the next `update` the harness sees the local edit, keeps your version and
writes its own next to it as `<file>.sdd-new`. Merge what you need and delete the `.sdd-new` file.
If you find yourself carrying the same edit across projects, open an issue: it probably belongs
upstream or behind a config key.

## Git hooks with husky or lefthook

`init` sets `core.hooksPath=.githooks` only when no other hooks path is configured. With husky,
call the checker from your own `commit-msg` hook:

```sh
node .sdd/scripts/check-commit-msg.mjs "$1"
```

## Other agents

`AGENTS.md` carries the full workflow and governance, so Codex, Cursor and others that read it
follow the same process. The guardrail hooks and skills in `.claude/` are Claude Code specific;
OpenSpec can generate its commands for other tools with `openspec init --tools <tool>`.
