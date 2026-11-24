# Updating

## Two levels

1. **Harness maintainers** bump upstreams in this repo. `.github/workflows/upstream-bump.yml`
   does it weekly and opens a PR:
   - `npm run vendor:check` / `vendor:update`: each skill is pinned to the last commit that
     touched its folder upstream (`harness.lock.json`). Update re-downloads into `vendor/skills/`
     and prints a compare link per skill.
   - `npm run openspec:check` / `openspec:bump [version]`: moves the OpenSpec pin and prints the
     diff of upstream's `spec-driven` schema, so changes can be ported into our `sdd` fork.
   - Review, merge, tag a release.
2. **Projects** upgrade the package (`pnpm up reins` or a new tag) and run
   `npx reins update`. Nothing changes in a project until someone does this.

`update` never clobbers local edits. Each file has an owner (tracked by hash in `.sdd/manifest.json`):

| Mode | Files | On update |
|------|-------|-----------|
| managed | hooks, skills, rules, schema, scripts, workflows | overwritten if untouched; if edited locally, the new version is written to `<file>.sdd-new` |
| block | `AGENTS.md`, `CLAUDE.md` | only the text between `<!-- reins:begin -->` and `<!-- reins:end -->` |
| merge | `.claude/settings.json`, `.mcp.json` | deep merge: project values win, arrays are unioned, harness hook entries replaced |
| seed | `openspec/config.yaml`, `.sdd/harness.json` | written once, project-owned afterwards |

## Moving from sdd-harness

The package was called `sdd-harness` up to 0.1.1. To switch a project to `reins`:

```bash
npm rm sdd-harness && npm i -D -E reins    # or: pnpm remove sdd-harness && pnpm add -D -E reins
npx reins update
```

`update` replaces the old `<!-- sdd-harness:begin/end -->` markers in `AGENTS.md` and `CLAUDE.md`
with `reins` ones and keeps your text around them. Managed files you edited locally get a
`<file>.sdd-new` as usual, because their headers changed. `.sdd/`, the `sdd-*` hooks and
workflows and the `sdd` schema keep their names.

## OpenSpec ownership: `install` or `existing`

Choose who owns OpenSpec with `--openspec`:

| Mode | What the harness does with OpenSpec |
|------|-------------------------------------|
| `install` | Pins `@fission-ai/openspec` (exact devDependency), runs `openspec init`/`update`, bumps the pin on every `reins update`. CI uses the pinned version. Default for projects without OpenSpec. |
| `existing` | Never installs, bumps or re-inits OpenSpec. Adds the `sdd` schema, skills, hooks and CI next to the project's setup; keeps `openspec/config.yaml` and its default schema. CI runs the project's own OpenSpec version. |

When OpenSpec is already present (an `openspec/` folder, a dependency, or a global `openspec`
binary), `init` asks which mode to use; without a terminal it keeps the project's OpenSpec.
The choice is stored in `.sdd/manifest.json`, and `update` uses it again. Switch later with
`npx reins update --openspec install` (or `existing`).

In `existing` mode, use the harness workflow per change (`openspec new change <id> --schema sdd`)
or set `schema: sdd` in `openspec/config.yaml` to make it the default. `init` validates that the
project's OpenSpec can load the `sdd` schema and warns when its major version is older than the
schema's base.
