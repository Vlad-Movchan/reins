# Contributing to sdd-harness

Thanks for helping. This document covers the development setup, the rules that keep the harness
safe to reuse, and how releases work.

## Ground rules

- **The harness installs into other people's repositories.** Every change to `templates/` lands in
  their projects on the next `sdd-harness update`. Prefer small, explained changes, and call out
  anything that changes behavior for existing installs in the PR and in `CHANGELOG.md`.
- **Never edit `vendor/` by hand.** Vendored skills are byte-for-byte copies of upstream at the SHA
  in `harness.lock.json`. Change the pin instead (see below).
- **Guardrails fail closed.** A hook that errors must block, not allow. New secret patterns need a
  test in `test/hooks.test.mjs` for both a blocked and an allowed case.
- **Zero runtime dependencies.** The CLI, hooks and CI scripts use only Node's standard library, so
  they run in any project without an install step. Keep it that way.

## Setup

```bash
git clone https://github.com/Vlad-Movchan/sdd-harness.git
cd sdd-harness
npm test            # unit tests: hooks, install/update, OpenSpec modes
npm run lint        # syntax-checks every .mjs file
npm run test:e2e    # installs into a temp git repo with real OpenSpec (needs network)
```

Node 20 or newer. Try your change on a scratch repository:

```bash
node bin/sdd-harness.mjs init --dir /path/to/scratch-repo
node bin/sdd-harness.mjs update --dir /path/to/scratch-repo
```

## Repository layout

| Path | What it is |
|------|------------|
| `bin/`, `src/` | The CLI (`init`, `update`, `check`, `audit-secrets`, `github-setup`) |
| `templates/` | Files copied into projects. `{{VARS}}` are filled at install time |
| `vendor/skills/` | Pinned third-party skills (generated, do not edit) |
| `harness.lock.json` | Pins: OpenSpec version, skill repos and SHAs, MCP and action versions |
| `scripts/` | Maintainer scripts: `vendor.mjs`, `openspec-bump.mjs`, `lint.mjs` |
| `test/` | `node:test` unit tests; `test/e2e/` smoke test |
| `docs/` | User documentation |

How files are owned in a project (managed / block / merge / seed) is described in
[docs/updating.md](docs/updating.md). New template files are `managed` unless you add them to the
sets at the top of `src/lib/install.mjs`.

## Common changes

**Add or change a hook.** Hooks live in `templates/.claude/hooks/`, shared code in `sdd-lib/`.
Register it in `templates/.claude/settings.json` with a `sdd-` file prefix (the merge logic
replaces harness hook entries by that prefix). Add tests.

**Add a third-party skill.** Add an entry to `harness.lock.json` (`dest`, `repo`, `path`,
`branch`, `sha`, optional `exclude` and `rename`), run `npm run vendor:sync`, mention it in
`templates/CLAUDE.md` and `docs/skills.md` with the reason it was chosen. Only MIT/Apache-2.0/BSD
licensed sources.

**Bump upstreams.** `npm run vendor:update` and `npm run openspec:bump`. The weekly
`upstream-bump` workflow does this and opens a PR. Review the compare links it prints. When
OpenSpec's `spec-driven` schema changed, port the relevant parts into
`templates/openspec/schemas/sdd/` and run `npm run test:e2e`.

**Change the `sdd` schema.** Keep it a fork of `spec-driven`: change only what the harness needs,
so upstream changes stay easy to port. Validate with `npm run test:e2e`.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/) for titles: `feat:`, `fix:`,
  `docs:`, `chore:`, `refactor:`, `test:`. Breaking changes: `feat!:` plus a `BREAKING CHANGE:` note.
- Update `CHANGELOG.md` under **Unreleased** for anything users notice.
- CI must be green: unit tests on Linux and macOS, lint, vendor integrity, e2e smoke test.

## Branch rules

`main` is protected by two repository rulesets.

**main: PR + owner approval**

- Every change reaches `main` through a pull request. Work on a branch (or a fork) and open a PR.
- A PR needs an approving review from the code owner, @Vlad-Movchan (see `.github/CODEOWNERS`).
  Pushing new commits to the PR dismisses an earlier approval, so the approved diff is what lands.
- Nobody pushes to `main` directly, admins included. Force pushes to `main` and deleting it are
  blocked too.
- GitHub does not let anyone approve their own PR, so the maintainer merges their own PRs with the
  ruleset's merge-time bypass. The bypass works only when merging a PR, never for a direct push.

**main: CI green** (no bypass, admins included)

- A PR merges only when every `ci` job passes: `test (ubuntu-latest, 20)`,
  `test (ubuntu-latest, 22)`, `test (macos-latest, 20)`, `test (macos-latest, 22)`, `integrity`
  and `e2e`.
- The checks are matched by job name. If you rename a job or change the `ci.yml` matrix, update
  the ruleset in the same PR, or PRs wait forever for a check that no longer runs.
- PRs opened by the `upstream-bump` workflow don't trigger `pull_request` runs (GitHub ignores
  events made with `GITHUB_TOKEN`), so the workflow starts `ci` on its branch itself with
  `workflow_dispatch`. If those checks are missing, run `gh workflow run ci.yml --ref <branch>`.

## Releases (maintainers)

1. On a branch, move **Unreleased** in `CHANGELOG.md` to the new version and bump `version` in
   `package.json`. Commit as `chore(release): 0.2.0` and open a PR.
2. After the PR is merged, tag the merge result on `main` and push only the tag:
   `git switch main && git pull && git tag v0.2.0 && git push origin v0.2.0`.
3. The `release` workflow runs the tests, publishes to npm with provenance and creates the GitHub
   release from the changelog section. npm auth is Trusted Publishing (OIDC), so there is no token
   secret; the npm package settings name `Vlad-Movchan/sdd-harness` and `release.yml` as the trusted
   publisher.

Semver: a template change that requires users to act (new required config, removed file, changed
hook behavior) is a minor bump before 1.0 and a major bump after.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
