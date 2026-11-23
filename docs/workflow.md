# Workflow

`openspec/specs/` describes how the system behaves **now**; `openspec/changes/<id>/` describes how
it **will** behave after a change, plus why and how. Every behavior change goes through a change;
refactors, dependency bumps and formatting don't need one and are committed with `Change-Id: none`.

## Change lifecycle

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

The same table is installed into each project's `AGENTS.md`, so agents follow it without extra prompting.

## The `sdd` schema

`proposal → specs → impact → tests → design → tasks`, apply tracks `tasks.md`.

- **proposal** adds `## Risk` (`Level: low|high`) and a mandatory `## Open questions`.
- **impact** maps layers/modules/data/interfaces/security touchpoints; high risk requires `challenge.md` first.
- **tests** maps every scenario to unit / integration / e2e (test pyramid), negative tests for security requirements.
- **design** is always present; full with a mandatory Security section for high risk, a few lines for low.
- **tasks** groups carry one layer tag (`## 2. [backend] …`), so apply runs per layer
  (`/openspec-apply-change <id>` + "layer: backend"). Apply instruction makes TDD mandatory.

OpenSpec has no optional artifacts, so "low risk" means short artifacts and no spec challenge,
not missing files.

## Traceability

Every commit carries `Change-Id: <change-name>` (`none` for non-behavioral work). The archive
keeps proposal and design next to the code, so `git blame` → commit → trailer →
`openspec/changes/archive/*-<id>/` answers "why is this line here". The `trace-why` skill
follows that chain; the spec gate makes sure the chain is never broken.
