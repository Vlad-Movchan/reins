// Managed by specjig. Change-Id trailer rules shared by hooks, git hooks and CI.
//
// Every commit carries `Change-Id: <openspec-change-name>` pointing at openspec/changes/<name>
// or openspec/changes/archive/<date>-<name>. `Change-Id: none` is allowed for work that has no
// behavior change (deps, formatting, CI, fix PRs from the triage bot).
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const TRAILER_RE = /^Change-Id:[ \t]*([a-z0-9][a-z0-9-]*)[ \t]*$/im;
export const NONE = 'none';

export function parseChangeId(message) {
  const m = message.match(TRAILER_RE);
  return m ? m[1] : null;
}

export function changeExists(id, cwd = process.cwd()) {
  if (id === NONE) return true;
  const changes = path.join(cwd, 'openspec', 'changes');
  if (existsSync(path.join(changes, id))) return true;
  const archive = path.join(changes, 'archive');
  if (!existsSync(archive)) return false;
  return readdirSync(archive).some((d) => d === id || d.replace(/^\d{4}-\d{2}-\d{2}-/, '') === id);
}

/** Returns an error string, or null when the message satisfies the policy. */
export function checkMessage(message, cwd = process.cwd()) {
  const subject = message.split('\n')[0];
  if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(subject)) return null;
  const id = parseChangeId(message);
  if (!id) {
    return 'missing "Change-Id: <change-name>" trailer (use "Change-Id: none" for work without a behavior change)';
  }
  if (!changeExists(id, cwd)) {
    return `Change-Id "${id}" does not match any folder in openspec/changes/ or openspec/changes/archive/`;
  }
  return null;
}

/** Active (non-archived) changes, newest first, to suggest an id. */
export function activeChanges(cwd = process.cwd()) {
  const changes = path.join(cwd, 'openspec', 'changes');
  if (!existsSync(changes)) return [];
  return readdirSync(changes, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'archive')
    .map((d) => d.name);
}
