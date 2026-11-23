---
name: change-pr
description: Open a GitHub pull request for an OpenSpec change with Change-Id trailers on every commit and links to the change, its specs and tests in the description. Use when the user asks to open, create or prepare a PR for a change.
---

# PR for a change

Thin wrapper over `gh pr create` that makes the PR traceable to its OpenSpec change.

## 1. Identify the change

The change id is the folder name under `openspec/changes/`. Take it from the user, from the
`Change-Id` trailers on the branch, or from the only active change. If several are possible, ask.

## 2. Check the commits

```bash
git log --format='%h %s%n%(trailers:key=Change-Id,valueonly)' origin/HEAD..HEAD
```

Every commit needs `Change-Id: <id>` (or `none` for non-behavioral commits). If one is
missing, tell the human and propose `git rebase -x` / an amend; do not rewrite pushed history
without approval.

## 3. Check readiness

- `npx openspec validate <id> --strict` passes.
- All tasks in the layer(s) this PR covers are checked in `tasks.md`.
- Tests listed in `tests.md` for those tasks exist and pass.
- High risk: `challenge.md` exists and `/security-review` was run.

Report anything missing instead of opening the PR.

## 4. Create the PR

Title: `<type>(<capability>): <summary>`. Labels: `low-risk` when the proposal says
`Risk: low`; otherwise none (high risk is the default). Body:

```markdown
## Change
[`<id>`](openspec/changes/<id>/proposal.md) · Risk: <low|high> · Layer: <backend|frontend|all>

<Why, 1–3 sentences from proposal.md>

## Specs
- [`<capability>`](openspec/changes/<id>/specs/<capability>/spec.md): ADDED/MODIFIED requirements …

## Tests
<Scenario → test file mapping from tests.md for what this PR implements>

## Design
[design.md](openspec/changes/<id>/design.md) · [challenge.md](openspec/changes/<id>/challenge.md) (if present)

## Checklist
- [ ] `openspec validate --strict` green
- [ ] Every commit has `Change-Id: <id>`
- [ ] No PII/PHI or secrets in code, tests, logs, fixtures
```

Use relative links: GitHub resolves them against the PR branch. Push and `gh pr create`
need the human's approval.
