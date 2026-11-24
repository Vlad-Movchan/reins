# {{PROJECT_NAME}}

<!-- Project-owned: reins never edits text outside the reins markers below. -->

## Project

- **What it is:** TODO one paragraph: product, users, domain.
- **Stack:** TODO (also fill `context:` in `openspec/config.yaml`).
- **Layers:** TODO e.g. `backend` (src/server), `frontend` (src/web). Keep in sync with `.sdd/harness.json`.

## Commands

| Purpose   | Command |
| --------- | ------- |
| Install   | TODO    |
| Unit      | TODO    |
| Integration | TODO  |
| E2E       | TODO    |
| Lint      | TODO    |
| Types     | TODO    |

## Client restrictions

TODO what the client allows and forbids (data residency, allowed models/providers, systems the
agent may not touch, approval requirements). Write "none beyond the harness defaults" if none.

<!-- reins:begin -->
## How we work: spec-driven development (OpenSpec)

`openspec/specs/` is how the system behaves **now**. `openspec/changes/<id>/` is how it
**will** behave after a change (delta specs) plus why and how. Both states live in the repo at
the same time; archive merges a change's deltas into `specs/`.

Every behavior change goes through a change (schema `sdd`). Pure refactors, dependency bumps
and formatting need no change and are committed with `Change-Id: none`.

| # | Step | How | Output |
|---|------|-----|--------|
| 1 | Explore (optional) | `/openspec-explore` | shared understanding, no files |
| 2 | Propose | `/openspec-propose`; set **Risk: low / high** | `proposal.md` |
| 3 | Delta specs | requirements + `#### Scenario:` WHEN/THEN | `specs/**/spec.md` |
| 4 | Spec challenge (**high risk only**) | `spec-challenge` skill, clean context | `challenge.md`, specs updated |
| 5 | Impact, tests, design | continue the change | `impact.md`, `tests.md`, `design.md` |
| 6 | Tasks | grouped by layer `[backend]` / `[frontend]` | `tasks.md` |
| 7 | Validate | `npx openspec validate <id> --strict` | green |
| 8 | Apply, one layer per run | `/openspec-apply-change <id>` + "layer: backend"; TDD always | code + tests |
| 9 | Review | `two-axis-review` (standards + spec); `/security-review` when high risk | findings fixed |
| 10 | PR | `change-pr` skill | PR with Change-Id and links |
| 11 | Review comments | `receiving-code-review` skill | every comment accepted or rejected with a reason |
| 12 | Archive (after merge) | `/openspec-archive-change <id>` | deltas merged into `specs/` |

Risk is **high** when the change touches auth, permissions, tenant isolation, PII/PHI, payments,
data migrations, public API contracts, or more than one layer at once. Otherwise **low**. When unsure, high.

Rules that always apply:

- **Tests first.** No production code without a failing test (`test-driven-development` skill).
  Test levels come from `tests.md`: every scenario maps to unit, integration or e2e.
- **Bugs:** `systematic-debugging` skill: hypothesis, verification, fix, regression test.
- **Never edit `openspec/specs/` directly**; change behavior through a change and archive it.
- **Open questions** that would change specs, approach or tasks are resolved with the human
  before tasks are written. Do not bake guesses into tasks.

## Traceability: from a line of code to its meaning

Every commit carries a `Change-Id: <change-name>` trailer (`none` for non-behavioral work);
hooks reject commits without it. To understand an unclear line, follow the chain instead of
guessing (the `trace-why` skill does this):

`git blame -L <n>,<n> <file>` → commit → `Change-Id` → `openspec/changes/<id>/` or
`openspec/changes/archive/*-<id>/` → `proposal.md` (why), `design.md` (how and alternatives),
specs (the contract). Search specs and changes locally before asking or querying a tracker.

## Governance

- **Secrets:** never read, print or request `.env*` (except `.env.example`), keys, credentials,
  tokens or the process environment. Hooks and `permissions.deny` block it; do not try to work
  around a block. Ask the human for variable *names*, not values.
- **Data:** only synthetic data. Fixtures are generated (seeded faker/factories), never copied
  from real records. No PII/PHI in tests, fixtures, logs, URLs, commit messages or specs.
  Folders `data/real`, `data/prod`, dumps and backups are off limits.
- **Fix mode** (`SDD_MODE=fix`, CI triage): only lint, format, types and dependencies; never
  tests or `openspec/`. If the real fix needs a test or spec change, stop and report.
- **Pushes, merges and publishing** need explicit human approval.
- **Cost:** CI agents run only on labels, with `--max-turns`; do not loop on a failing step,
  stop and report after two failed attempts at the same fix.
<!-- reins:end -->
