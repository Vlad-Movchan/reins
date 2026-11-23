---
name: spec-compaction
description: Compact openspec/specs by removing requirements and scenarios that are outdated or fully expressed by tests, through a regular OpenSpec change. Use when specs have grown noisy, before a release, or when the user asks to compact, prune or clean up specs.
---

# Spec compaction

Specs are a contract for humans and agents, not a second copy of the test suite. Compaction keeps
what explains **behavior and intent** and drops what only restates detail already pinned by tests.

Compaction is itself a change: never edit `openspec/specs/` directly.

## Keep

- Requirements that state **observable behavior or intent** (why the system does it), even if tested.
- Security, privacy, compliance and tenant-isolation requirements, always.
- Error behavior and edge cases that were decided deliberately (look for them in archived
  `challenge.md` / `design.md`).
- Anything a stakeholder reads in the Confluence export.

## Remove or merge

- **Outdated:** the requirement no longer matches the code and no active change restores it.
  Confirm with `trace-why` and the tests; if behavior silently drifted, that is a bug or a missing
  change, so report it, do not compact it away.
- **Duplicated:** the same behavior stated in two capabilities → keep it in the owning one.
- **Test-restating scenarios:** a scenario that only enumerates input/output values already
  covered one-to-one by a named test → replace the enumeration with one representative scenario
  plus a reference to the test file.
- **Implementation detail:** class names, libraries, internal steps → remove (belongs in design or code).

## Process

1. Pick the capability(ies). Check no active change modifies them (`npx openspec list`); if one
   does, compact after it is archived.
2. For each requirement, collect evidence: tests that cover its scenarios (grep for scenario
   names / behaviors), the change that introduced it (`trace-why`), current code behavior.
3. Draft a table for the human: requirement → keep / remove / merge / shorten, with evidence.
   Wait for approval; removal of a requirement is a product decision.
4. Create change `compact-<capability>` (`skip_specs` is **not** set): use `## REMOVED Requirements`
   with **Reason** and **Migration** ("covered by `<test path>`" or "obsolete since `<change>`"),
   and `## MODIFIED Requirements` for shortened ones (full block, per OpenSpec rules).
   Risk: low unless a security requirement is touched.
5. `npx openspec validate compact-<capability> --strict`, PR via `change-pr`, archive after merge.

Prior art checked: `sdd-spec-gc` (fearovex/claude-config) and `spec-compact` (kevinlin) cover
staleness and duplication but not test coverage; this skill adds the test-evidence rule.
