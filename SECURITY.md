# Security policy

reins ships guardrails (hooks, permission rules, CI checks) that other projects rely on to
keep secrets and real data away from AI agents. A bypass of those guardrails is a security issue.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub Security Advisories](https://github.com/Vlad-Movchan/reins/security/advisories/new).

Include the harness version, the hook or workflow involved, and a reproduction (for a hook: the
tool name and `tool_input` JSON that gets through). You will get an acknowledgement within 7 days.
Fixes are released as a patch version and announced in the changelog and the advisory.

## In scope

- A secret-bearing path or command that `sdd-protect-secrets` or `permissions.deny` should block
  but allows.
- A way for an agent in fix mode (`SDD_MODE=fix`) to change tests or specs without
  `sdd-fix-pr-guard` failing.
- Workflow templates that expose secrets to untrusted pull requests, or grant more permissions
  than they need.
- `audit-secrets` or the prompt guard missing a common credential format.

## Out of scope

- Hooks are guardrails, not a sandbox. Determined obfuscation of shell commands (encoding,
  indirection through scripts) is a known limit; use Claude Code's sandbox for OS-level
  enforcement. Reports that improve detection are still welcome as regular issues.
- Vulnerabilities in upstream projects (OpenSpec, vendored skills, GitHub Actions): report them
  upstream. We will bump the pin once fixed.

## Supported versions

Only the latest minor release receives fixes before 1.0.
