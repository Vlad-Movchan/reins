# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Vlad-Movchan/specjig/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Vlad-Movchan/specjig/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Vlad-Movchan/specjig/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Vlad-Movchan/specjig/releases/tag/v0.1.0
