# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-24

### Added

- `init` lets you choose MCP servers and plugins: the harness's Playwright MCP plus the MCP servers
  (user and local scope) and plugins already connected in your Claude Code. Chosen servers go to
  `.mcp.json`, plugins to `.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`).
  Secrets in copied servers become `${VAR}` references. New flags `--mcp` and `--plugins` for
  `init` and `update`; `update` keeps the choice.

### Changed

- The drift check, spec-aware review and CI triage workflows authenticate to the Claude API with
  workload identity federation (repository variables `ANTHROPIC_FEDERATION_RULE_ID`,
  `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, optional `ANTHROPIC_WORKSPACE_ID`)
  instead of a stored API key. The `ANTHROPIC_API_KEY` secret keeps working as a fallback while
  the federation variables are unset, so existing setups need no change. The security review
  still needs the secret and now skips with a notice without it. `github-setup` reports which
  credentials are configured. See [docs/ci.md](docs/ci.md#claude-api-access).

### Fixed

- `update` duplicated arguments in `.mcp.json` when a pinned MCP server version changed (the
  array merge kept the old `@playwright/mcp@…` argument). Harness servers are now replaced as a
  whole while untouched.

## [0.2.0] - 2026-11-24

### Changed

- The npm package, the CLI command (`npx specjig …`) and the GitHub repository are now named
  `specjig`.

## [0.1.1] - 2026-11-24

### Changed

- Releases publish to npm through Trusted Publishing (OIDC) with automatic provenance.

### Fixed

- `--version` printed the help text instead of the version (`-v` worked).

## [0.1.0] - 2026-11-23

### Added

- CLI: `init`, `update`, `check`, `audit-secrets`, `github-setup`.
- OpenSpec integration with two modes: `install` (harness pins and bumps `@fission-ai/openspec`,
  2.1.1) and `existing` (keeps the project's own OpenSpec; CI uses its version).
- `sdd` schema, a fork of `spec-driven`: risk levels, `impact` and `tests` artifacts,
  layer-split tasks, mandatory Open questions, TDD in apply.
- `AGENTS.md` / `CLAUDE.md` with the change lifecycle, traceability and governance.
- Claude Code settings: `permissions.deny` for secrets and real data, hooks
  `sdd-protect-secrets`, `sdd-prompt-guard`, `sdd-fix-mode-guard`, `sdd-commit-guard`.
- Rules: security (PII/PHI, auth, tenant isolation), test data, openspec.
- Pinned skills: `grilling`, `two-axis-review` (mattpocock/skills); `test-driven-development`,
  `systematic-debugging`, `receiving-code-review` (obra/superpowers).
- Own skills: `spec-challenge`, `change-pr`, `trace-why`, `spec-compaction`.
- Playwright MCP, pinned.
- `Change-Id` commit trailer enforced by Claude hook, git `commit-msg` hook and CI.
- Workflows: spec gate, drift check, spec-aware review, security review, CI triage with fix PRs,
  fix-PR guard with auto-merge, release notes, Confluence sync.
- Update model with file ownership (managed / block / merge / seed), `.sdd-new` on conflicts, and opt-outs (deleted files or `exclude` in `.sdd/harness.json` stay out).

[Unreleased]: https://github.com/Vlad-Movchan/specjig/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Vlad-Movchan/specjig/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Vlad-Movchan/specjig/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Vlad-Movchan/specjig/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Vlad-Movchan/specjig/releases/tag/v0.1.0
