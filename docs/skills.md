# Skills

| Skill | Source | Why this one |
|-------|--------|--------------|
| `grilling` | mattpocock/skills, pinned | Turns a plan into a design tree of decisions; the engine of `spec-challenge` |
| `test-driven-development` | obra/superpowers, pinned | Chosen over mattpocock `tdd`, see below |
| `systematic-debugging` | obra/superpowers, pinned | Hypothesis → verification → fix + regression test |
| `two-axis-review` | mattpocock `code-review`, pinned, renamed | Reviewing: standards axis + spec axis in separate subagents. Renamed so it doesn't shadow Claude Code's built-in `/code-review` |
| `receiving-code-review` | obra/superpowers, pinned | Handling comments: verify, accept or push back with a reason |
| `spec-challenge` | ours | Step 4: runs `grilling` on proposal + delta specs in a fresh subagent; resolution table; writes `challenge.md` |
| `change-pr` | ours | Thin `gh pr create` wrapper: Change-Id check, links to change/specs/tests |
| `trace-why` | ours | git blame → commit → Change-Id → change folder |
| `spec-compaction` | ours | Prune `specs/` via a REMOVED/MODIFIED change with test evidence. Checked `sdd-spec-gc` and `spec-compact` first; neither uses test coverage |

**TDD: superpowers over mattpocock.** Matt's `tdd` requires confirming test seams with the user
before every test, which blocks autonomous `apply`; in this harness the seams are already decided
in `tests.md`. Superpowers' skill is built for an agent working alone: an iron law (no production
code without a failing test), a mandatory "watch it fail" step, a rationalization table and a
verification checklist. Matt's anti-pattern notes (implementation-coupled, tautological tests) are
covered by the `tests` artifact rules and `.claude/rules/test-data.md`.

**Code review: both, they're different jobs.** mattpocock `code-review` *performs* a review
(standards + spec, and its spec axis reads `specs/`), superpowers `receiving-code-review` *answers*
one. They are complementary, not alternatives.
