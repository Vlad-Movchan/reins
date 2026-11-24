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
| MCP servers | `.mcp.json` | Your entries are never changed by `update`; see below |
| Plugins | `.claude/settings.json` → `enabledPlugins`, `extraKnownMarketplaces` | Merged like settings |

## MCP servers and plugins

`init` offers three groups and writes the ones you keep to the shared project config:

| Group | Source | Written to |
|-------|--------|------------|
| Harness MCP servers | pinned in the harness (`playwright`, on by default) | `.mcp.json` |
| MCP servers connected in your Claude Code | user and local scope in `~/.claude.json` (`claude mcp add`) | `.mcp.json` |
| Plugins enabled in your Claude Code | `enabledPlugins` in `~/.claude/settings.json` and `.claude/settings.local.json` | `.claude/settings.json`: `enabledPlugins`, plus `extraKnownMarketplaces` for marketplaces other than `claude-plugins-official` |

Everything already in the project is not offered again. In a terminal, `init` shows the list with
everything selected; type numbers to toggle, then Enter. Without a terminal it installs only the
harness defaults. Pick explicitly with flags:

```bash
npx specjig init --mcp playwright,context7 --plugins tdd@team-market
npx specjig init --mcp none --plugins none
```

`--mcp` takes server names; `--plugins` takes `name@marketplace` or just `name` when it is
unique; both accept `all` and `none`. To change the selection later, run `init` again (it asks
again) or `update` with the flags.

**Secrets stay out of git.** Both files are committed, so the copy of each connected server is
cleaned first:

- every `env` value becomes `${NAME}`, e.g. `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`;
- header values become references (`Authorization: Bearer ${GITHUB_TOKEN}`);
- values of secret-looking arguments (`--api-key <key>`, `--token=<value>`) and URL credentials
  become `${SERVER_FLAG}` references, e.g. `--api-key ${CONTEXT7_API_KEY}`;
- paths in your home directory become `${HOME}/...`;
- a server with a secret that cannot be moved out is not offered.

Claude Code expands these references from the environment when it starts the server. `init` lists
the variables each server needs and which are not set in your shell. A project server takes
precedence over a user-scope server with the same name, so export the variables (for example in
your shell profile) or your own copy loses its key. Plugins from a marketplace in a local
directory or file are not offered: teammates cannot reach it.

Teammates approve the project's MCP servers when Claude Code first opens the folder, and install
the plugins with `claude plugin install <name@marketplace> --scope project`.

On `update`, harness servers are refreshed to the new pin while you have not edited them; an
edited entry is kept, and a deleted one stays deleted. Servers you added or imported are yours:
the harness never changes or removes them.

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
