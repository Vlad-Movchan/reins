@AGENTS.md

<!-- Project-owned: add Claude-specific notes above or below the specjig block. -->

<!-- specjig:begin -->
## Claude Code specifics

Skills installed by the harness (in `.claude/skills/`):

| Need | Skill |
|------|-------|
| Stress-test a plan or a change proposal | `grilling`, `spec-challenge` (proposal + delta specs, high risk) |
| Write code | `test-driven-development` (always) |
| Fix a bug or failing test | `systematic-debugging` |
| Review a diff against standards and the change's specs | `two-axis-review` (spec source: `openspec/changes/<id>/specs/`; no issue-tracker setup needed) |
| Security pass (PII/PHI, auth, tenant isolation) | built-in `/security-review`; rules in `.claude/rules/security.md` |
| Open a PR | `change-pr` |
| Answer review comments | `receiving-code-review` |
| Explain why a line exists | `trace-why` |
| Prune `openspec/specs/` | `spec-compaction` |
| Check UI / run e2e flows in a browser | Playwright MCP (`.mcp.json`) |
| OpenSpec workflow | `/openspec-propose`, `/openspec-explore`, `/openspec-apply-change`, `/openspec-archive-change` |

Hooks in `.claude/settings.json` block secret access, enforce the `Change-Id` trailer on
`git commit`, and freeze tests and `openspec/` when `SDD_MODE=fix`. A hook block is a policy
decision: adjust the action, do not retry it in another form.

Run the spec challenge and code reviews in a **subagent with a fresh context** so the author's
assumptions do not leak into the review.
<!-- specjig:end -->
