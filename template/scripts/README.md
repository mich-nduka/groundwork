# Scripts

Repeatable development, maintenance, migration and release scripts live here. Document any destructive operations and required environment variables.

Both Groundwork scripts use the Python 3 standard library only.

- `groundwork.py`: sets up and grows the project's documents from its profiles (see `profiles/README.md`). It never overwrites or deletes a file, and `--dry-run` shows what would change.

  - `list`: shows every profile — its purpose, when to use it and when not to, its documents and its checks.
  - `init <profile> [<profile> ...]` (or `init none`): records the profiles in `PROJECT.md`, creates each missing required document from its template, adds the profiles' checks to the tooling table in `AGENTS.md`, and lists new files in `scaffold-manifest.json`. Run it again with a new list to add or drop a profile.
  - `add <path>`: creates one optional document from its template, such as `docs/ai-systems/RETRIEVAL.md`.
  - `new <folder> [--name ...] [--description ...] [--profiles ...]`: creates a new project from this copy of Groundwork. It copies the files listed in `scaffold-manifest.json`, fills in the name, description and date in `PROJECT.md`, writes `.groundwork/config.json`, and runs `init` there. It builds everything in a temporary folder and moves it into place only if every step worked.
  - `config`: shows the project name and profiles (from `PROJECT.md`), the Groundwork version, and which files Groundwork generated that the project has since changed or deleted (from `.groundwork/config.json`).

  Add `--json` to any command for machine-readable output. The `groundwork` command-line tool (npm package `create-groundwork`) runs these same scripts, so the two ways of working always agree. Profiles are always recorded in sorted order, so the order you give them in doesn't matter.

  `.groundwork/config.json` records which Groundwork version generated the project, and a SHA-256 checksum of every file Groundwork generated. A recorded file whose checksum still matches is managed by Groundwork; one that differs has been changed by the project; an unrecorded file belongs to the project. Future upgrades use this to avoid overwriting your edits. Don't edit the config by hand. Active profiles are recorded only in `PROJECT.md`.

- `check_docs.py`: read-only consistency check. Validates `scaffold-manifest.json` against the repository, keeps the Feature Specification Index in `docs/product/SPEC.md` in sync with `docs/product/specs/`, checks requirement and capability ID grammar, uniqueness and traceability (including IDs referenced in `tests/` and `src/`), verifies internal markdown links, and validates profiles: manifests, single ownership of each document, the profiles chosen in `PROJECT.md`, their dependencies and conflicts, and their required documents. It ignores `docs/examples/` and the templates under `profiles/<id>/templates/`. Run it after adding, renaming or removing documents, feature specs, requirement IDs, links or profiles.

  Errors always exit 1. Warnings come in two groups: hygiene (invalid status values, unserved capabilities, documents from inactive profiles, profile checks missing from the tooling table) and coverage (a requirement nothing references). Each group fails only under its flag:

  - Default: only errors fail.
  - `--strict`: hygiene warnings fail too.
  - `--strict-coverage`: coverage warnings fail too.

  `--strict-coverage` does not include `--strict`. Use both flags together to fail on everything.

  The manifest rule: files you add under `src/`, `tests/`, `config/`, `infrastructure/` or `scripts/` don't need to be listed, but template files must stay listed and a deleted template file must also be removed from `scaffold-manifest.json`. Projects without a `profiles/` folder (such as projects started on Groundwork 2.x) get exactly the checks they had before.
