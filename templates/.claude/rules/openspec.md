---
paths:
  - "openspec/**"
---
<!-- Managed by sdd-harness. -->
# Working in openspec/

- `openspec/specs/` is the current truth. Never edit it by hand except a capability's `## Purpose`;
  everything else changes through a change and `openspec archive`.
- `openspec/changes/archive/` is history. Never edit archived changes.
- Use the `sdd` schema: proposal → specs → (challenge) → impact → tests → design → tasks.
- After editing a change, run `npx openspec validate <change-id> --strict` and fix every issue.
- Requirements use SHALL/MUST; each has at least one `#### Scenario:` with WHEN and THEN.
- No PII/PHI and no secrets in specs, examples or scenarios; use synthetic values.
