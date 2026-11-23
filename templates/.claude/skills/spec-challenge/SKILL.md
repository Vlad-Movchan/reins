---
name: spec-challenge
description: Challenge an OpenSpec change's proposal and delta specs in a clean context until ambiguities are closed (hidden assumptions, contradictions, edge cases, error behavior). Use for high-risk changes after the delta specs are written and before impact/design/tasks, or when the user says "challenge the spec" or "grill the change".
---

# Spec challenge

Step 4 of the change lifecycle. Skip for **low-risk** changes (proposal says `Risk: low`) unless
the user asks for it.

The challenger must not share the author's context: assumptions the author made silently are
exactly what this step exists to surface.

## 1. Run the challenge in a fresh subagent

Spawn a subagent with a **fresh context** (not a fork). Give it only:

- the paths `openspec/changes/<id>/proposal.md` and `openspec/changes/<id>/specs/**`,
- the paths of the main specs those deltas modify (`openspec/specs/<capability>/spec.md`),
- this brief:

> Use the `grilling` skill on this change. You are reviewing the proposal and delta specs, not
> the code. Build the design tree from what the specs leave undecided. Look specifically for:
> hidden assumptions; contradictions between requirements, or with the main specs; missing
> edge cases (empty, max size, concurrency, retries, time zones, partial failure); undefined
> error behavior; scenarios without a clear WHEN or THEN; requirements that cannot be tested;
> security and privacy gaps (PII/PHI, authz, tenant boundary).
> Look facts up in the repository yourself; ask only about decisions. Return every question with
> your recommended answer and the requirement/scenario it concerns.

## 2. Put the questions to the human

Relay the subagent's rounds to the human in the `grilling` format (numbered, each with a
recommended answer). Decisions are the human's. Keep going until the frontier is empty.

## 3. Resolve every finding

Each finding gets exactly one resolution:

| Resolution | When | Action |
|------------|------|--------|
| **Spec fix** | Requirement wrong, vague or contradictory | Edit the delta requirement |
| **New scenario** | Edge case or error behavior was missing | Add `#### Scenario:` (WHEN/THEN) |
| **Proposal fix** | Scope, motivation or risk level was wrong | Edit `proposal.md` (re-evaluate risk) |
| **Open question** | Answer is genuinely deferrable and changes neither specs, approach nor tasks | Add to `## Open questions` in `proposal.md` with an owner |
| **Out of scope** | Valid but belongs to another change | Note under Non-goals; create a follow-up change if needed |
| **Accepted risk** | Known gap the human accepts | Record in `challenge.md` with who accepted and why |

## 4. Record

Write `openspec/changes/<id>/challenge.md`:

```markdown
# Spec challenge: <id>

Date: YYYY-MM-DD · Rounds: N

| # | Finding | Concerns | Resolution | Outcome |
|---|---------|----------|------------|---------|
| 1 | Behavior on duplicate submit undefined | Req "Create order" | New scenario | "Duplicate submit returns existing order" |
```

Then run `npx openspec validate <id> --strict` and continue with impact, tests and design.
