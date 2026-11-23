---
name: trace-why
description: Explain why a line, function or behavior exists by following git blame → commit → Change-Id trailer → OpenSpec change (proposal, design, specs). Use when code is unclear, looks wrong or redundant, before deleting or "simplifying" something, or when the user asks "why is this here".
---

# Trace why

Do not guess intent from code. Follow the chain and quote what was decided.

1. **Blame the line(s).** Ignore pure formatting and move commits:
   ```bash
   git blame -w -C -C -L <start>,<end> --porcelain <file>
   ```
   If the last commit is a refactor/format commit (`Change-Id: none`), blame its parent:
   `git blame <sha>^ -L … <file>` and repeat until you reach a commit with a real Change-Id.
2. **Read the trailer.**
   ```bash
   git log -1 --format='%H%n%s%n%(trailers:key=Change-Id,valueonly)' <sha>
   ```
3. **Open the change.** `openspec/changes/<id>/` if still active, else
   `openspec/changes/archive/*-<id>/`. Read `proposal.md` (why), `design.md` (how,
   alternatives rejected), `challenge.md` (edge cases decided), `tests.md` and the delta specs.
4. **Check the current contract.** `npx openspec show <capability> --type spec` shows the
   requirement as it stands today (later changes may have modified it).
5. **Answer** with: the requirement or decision that explains the line, links to the files,
   and whether the current code still matches it. If the trail breaks (no trailer, change
   missing), say so explicitly and only then fall back to reading surrounding code and tests.

Search locally before asking a human or a tracker:
`grep -rn "<term>" openspec/specs openspec/changes`.
