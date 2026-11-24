# reins

[![ci](https://github.com/Vlad-Movchan/reins/actions/workflows/ci.yml/badge.svg)](https://github.com/Vlad-Movchan/reins/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/reins)](https://www.npmjs.com/package/reins)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A reusable agent harness for spec-driven development with Claude Code.** One command adds a
complete, opinionated setup to any repository:

> Formerly `sdd-harness`.

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) with an `sdd` schema: risk levels, impact
  map, test plan from spec scenarios, tasks split by layer.
- `AGENTS.md` / `CLAUDE.md` with the change lifecycle, traceability and governance.
- Guardrails: secrets and real data never reach the agent (permission rules and fail-closed
  hooks), a `Change-Id` trailer on every commit, tests and specs frozen for CI fix agents.
- Pinned skills: TDD, systematic debugging, grilling, code review in both directions, plus
  spec challenge, PR, trace and compaction skills.
- GitHub workflows: spec gate, drift check, spec-aware review, security review, CI triage with
  fix PRs, release notes, Confluence export.

Every upstream piece is pinned and moves only through a reviewed bump. Projects get it with
`reins update`, which never overwrites local edits.

## Why OpenSpec

OpenSpec keeps two states of the product at once. `openspec/specs/` is how the system behaves
now; `openspec/changes/<id>/` is how it will behave, plus why and how. Archiving a change merges
it into `specs/`, so decisions stay next to the code. With the `Change-Id` trailer,
`git blame` → commit → change folder explains any line.

## Quick start

```bash
npm i -D -E reins        # or: pnpm add -D -E reins
npx reins init
```

Then:

1. Fill the TODOs in `AGENTS.md`, `openspec/config.yaml` and `.sdd/harness.json`.
2. In GitHub, add the `ANTHROPIC_API_KEY` secret and run `npx reins github-setup` to create the labels.
3. In Claude Code, start a change with `/openspec-propose`.

The harness needs Node 20+ and works in any repository. A non-JS project gets a tooling-only
`package.json`. Already using OpenSpec? `init` asks whether to keep your installation
(`--openspec existing`) or let the harness manage it (`--openspec install`); see
[updating](docs/updating.md#openspec-ownership-install-or-existing).

## Commands

| Command | What it does |
|---------|--------------|
| `reins init [--openspec install\|existing]` | Sets up OpenSpec, installs harness files, enables the `commit-msg` hook, updates `.gitignore` |
| `reins update [--openspec …]` | Re-applies files after upgrading the package; keeps local edits (`<file>.sdd-new` on conflict) |
| `reins check` | Shows the project, pinned and latest versions of the harness, OpenSpec and skills |
| `reins audit-secrets [paths…]` | Scans this project's Claude transcripts and the given logs for leaked secrets |
| `reins github-setup` | Creates the PR labels the workflows use |

## Documentation

| Topic | |
|-------|-|
| [Workflow](docs/workflow.md) | Change lifecycle, the `sdd` schema, risk levels, traceability |
| [Skills](docs/skills.md) | What is bundled and why (e.g. superpowers TDD over mattpocock `tdd`) |
| [CI workflows](docs/ci.md) | What runs where, which checks block, setup and cost controls |
| [Governance](docs/governance.md) | Secrets, data, hooks, policy, cost and how each is checked |
| [Updating](docs/updating.md) | Pins, how upstream bumps reach projects, file ownership, OpenSpec modes |
| [Customizing](docs/customizing.md) | `.sdd/harness.json`, opting out, adding your own rules and skills |

## What gets installed

```
AGENTS.md, CLAUDE.md           your project facts + managed workflow/governance block
.claude/settings.json          deny rules for secrets, ask for push/merge/publish, hooks
.claude/hooks/                 protect-secrets, prompt-guard, fix-mode-guard, commit-guard
.claude/rules/                 security (PII/PHI, auth, tenant isolation), test data, openspec
.claude/skills/                pinned third-party skills, harness skills, OpenSpec skills
.mcp.json                      Playwright MCP (pinned)
.githooks/commit-msg           Change-Id trailer for human commits
openspec/schemas/sdd/          the sdd schema
openspec/config.yaml           project context and per-artifact rules
.sdd/harness.json              layers, domain paths, frozen paths, opt-outs
.sdd/scripts/                  CI helpers
.github/workflows/sdd-*.yml    CI workflows
```

## Limits

- Hooks are guardrails, not a sandbox. For OS-level enforcement, also enable Claude Code's sandbox.
- The guardrail hooks and skills target Claude Code. Other agents get the workflow and rules
  through `AGENTS.md`.
- Tested on Linux and macOS. Windows is untested.

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md); report security issues
privately as described in [SECURITY.md](SECURITY.md).

## Credits

Built on [OpenSpec](https://github.com/Fission-AI/OpenSpec) and skills from
[mattpocock/skills](https://github.com/mattpocock/skills) and
[obra/superpowers](https://github.com/obra/superpowers), all MIT licensed and vendored at pinned
commits (see `vendor/skills/*/.upstream.json`).

## License

[MIT](LICENSE)
