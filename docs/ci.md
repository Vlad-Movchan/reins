# CI workflows

| Workflow | Trigger | Blocking | Notes |
|----------|---------|----------|-------|
| `sdd-spec-gate` | every PR | yes | `openspec validate --all --strict` + Change-Id trailer on every commit |
| `sdd-drift-check` | every PR | no (comment) | Path filter first (domain code changed, no delta spec, no `low-risk`); only then an agent judges meaning, ignoring refactors/renames |
| `sdd-spec-review` | label `ai-review` | no | Reads changes from trailers, checks code against scenarios, inline comments link requirements |
| `sdd-security-review` | label `security-review` | no | `claude-code-security-review` with `.claude/rules/security.md` as custom instructions |
| `sdd-ci-triage` | CI failure on a PR labelled `ai-triage` | no | Classifies; lint/format/types/deps → fix PR (`ai-fix`, `low-risk`) with `SDD_MODE=fix`; `--max-turns 25` |
| `sdd-fix-pr-guard` | PRs labelled `ai-fix` | yes | Fails if tests/specs/harness touched; enables auto-merge for `low-risk` (merges after green CI) |
| `sdd-release-notes` | manual / release published | – | Built from `openspec/changes/archive/YYYY-MM-DD-*` for the period |
| `sdd-confluence-sync` | push to main touching `openspec/specs/` | – | Read-only page per capability; edits only via a new change |

Setup: Claude API access (below); for Confluence `vars.CONFLUENCE_BASE_URL`, optional
`vars.CONFLUENCE_USER` (Cloud), `secrets.CONFLUENCE_TOKEN`, and `confluence.*` in `.sdd/harness.json`.
Set the CI workflow names in `sdd-ci-triage.yml`. Enable "Allow auto-merge" and branch protection.
`npx specjig github-setup` creates the labels and reports what is missing.

## Claude API access

The drift check, spec-aware review and CI triage use workload identity federation: the job
exchanges its GitHub OIDC token for a short-lived Claude API token, so no API key is stored.
One-time setup by an admin of the Anthropic organization, in the Claude Console under
**Settings → Workload identity**:

1. Register an issuer for GitHub Actions: `https://token.actions.githubusercontent.com`
   (JWKS source: discovery).
2. Create a service account and add it to the workspace that should pay for CI (`svac_…`).
3. Create a federation rule for that service account that matches your repository, e.g. subject
   prefix `repo:<owner>/<repo>:`, audience `https://api.anthropic.com` (`fdrl_…`).
4. Set the repository variables (identifiers, not secrets):

   ```bash
   gh variable set ANTHROPIC_FEDERATION_RULE_ID --body fdrl_...
   gh variable set ANTHROPIC_ORGANIZATION_ID --body <organization-uuid>
   gh variable set ANTHROPIC_SERVICE_ACCOUNT_ID --body svac_...
   gh variable set ANTHROPIC_WORKSPACE_ID --body wrkspc_...   # only if the rule covers several workspaces
   ```

Details: [Workload Identity Federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation).

The `ANTHROPIC_API_KEY` secret still works as a fallback: these workflows pass it only while
`ANTHROPIC_FEDERATION_RULE_ID` is unset. `sdd-security-review` is the exception:
`claude-code-security-review` accepts only an API key, so it needs the secret and skips with a
notice without it.

## Notes

- **Fork PRs** get no repository secrets and no OIDC token, so the agent-backed workflows cannot
  reach the Claude API on them. The spec gate and the fix-PR guard need no secrets and always run.
- **Fix PRs must trigger CI.** Events created with the default `GITHUB_TOKEN` don't start other
  workflows. `claude-code-action` pushes with the Claude GitHub App token, which does; if you swap
  in your own token, use a GitHub App or a fine-grained PAT, not `GITHUB_TOKEN`.
- **Pin actions.** The templates pin `claude-code-security-review` by SHA and `claude-code-action`
  by major tag (`harness.lock.json`). Pin to SHAs if your policy requires it.
- **Cost.** Agents run only on labels or after a cheap path filter, each with `--max-turns`.
- **Disable a workflow** by deleting its file or listing it in `exclude` in `.sdd/harness.json`;
  `specjig update` will not bring it back. See [customizing.md](customizing.md).
