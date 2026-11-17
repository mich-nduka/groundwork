# Changelog

Notable changes to the Groundwork template itself, not to your project. The format follows Keep a Changelog, and versions follow SemVer (major.minor.patch).

## [Unreleased]

## [3.2.0] - 2026-11-17

Groundwork is now agent-first. An AI coding agent that opens a Groundwork project finds instructions for helping the developer document it, a little at a time, and a record of how far that has got. The developer makes the decisions and sets how much the agent may do alone. Everything still works without an agent. See `MIGRATION.md` for the decisions behind this release.

### Added
- `GROUNDWORK.md` in every project: the developer's preferences, including the agent's autonomy level (`guided`, `balanced` or `autonomous`), and the canonical agent workflow for first sessions, returning sessions, recording progress, writing documents, optional documents and profiles, work during development, and safety.
- `profiles/<id>/onboarding.json` for core and the four profiles. Every one of the 26 documents gets a purpose, a stage (`discovery`, `design` or `as-needed`), dependencies, what skipping it means, and sections anchored to its template headings, each with plain-language questions and a `done_when`. 111 questions in all, each asked in exactly one place. Profiles add questions to core documents they use (`extends`), for example Application's offline question.
- `.groundwork/state.json`: onboarding progress only, never answers. Questions and sections take nine distinct states: unasked, answered, confirmed, assumed, skipped, not_applicable, deferred, unknown and blocked.
- `scripts/onboarding.py`, the onboarding engine shared by both scripts.
- New commands in `groundwork.py` and the `groundwork` CLI:
  - `status`: discovery progress, document progress, what needs confirming or reviewing, open items, and the next questions. `--brief` gives a few lines for a session-start hook.
  - `docs [path]`: every document in use, or one document's sections and questions.
  - `mark`: records progress. It refuses to turn a confirmed item into an assumption without `--reopen`, requires a note for assumptions and blocked items, refuses to mark a required document not applicable, and `--repair` rebuilds a damaged state file.
  - `connect`: adds thin agent adapters. For Claude Code, a `CLAUDE.md` that imports `AGENTS.md`, plus a `SessionStart` hook that runs `status --brief`. For Gemini CLI, `.gemini/settings.json` so it reads `AGENTS.md`. Existing files are never changed.
- `create-groundwork --agents claude,gemini`, and a wizard step offering the adapters. The completion message counts core, profile and optional documents, and says to open the project with an AI coding agent.
- `new` records what the developer already said (the description, the chosen profiles), so the agent doesn't ask again.
- `check_docs.py` validates the onboarding definitions and the state file, and prints a one-line onboarding summary. Unfinished, skipped or deferred documentation never fails validation.
- Tests for the definitions, the state model, recovery from damaged state, every developer scenario in the specification, and the new commands.

### Changed
- `AGENTS.md` starts with a short Groundwork section pointing agents to `groundwork status` and `GROUNDWORK.md`. Its workflow asks agents to recommend a new profile and add it only once the developer agrees.
- `.groundwork/config.json` also records a fingerprint of each document section as generated (`sections`), so a section of template text can be told apart from the project's own writing.
- `check_docs.py` no longer requires agent and editor settings (`.claude/`, `.gemini/`, `.cursor/`, `.codex/`, `.vscode/`, `.idea/`) or agent instruction files (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) to be listed in `scaffold-manifest.json`.

## [3.1.0] - 2026-11-17

Groundwork is now an installable command-line tool: `npx create-groundwork`. Nothing changes in the profile model, the documents or the validation rules.

### Added
- The npm package `create-groundwork`, with two executables. `create-groundwork` creates a project, with a guided setup or entirely from options. `groundwork` runs `create`, `profiles`, `init`, `add`, `validate` and `config`.
- Guided profile selection. Its questions come from each profile's `use_when` and `not_when` lists; it never guesses from technology. A review step shows the dependencies, the documents to create, the checks and the optional documents before anything is written.
- `scripts/groundwork.py new`: creates a project from a copy of Groundwork. It builds in a staging folder and moves it into place only when every step succeeded. The CLI uses it, and it works without Node.
- `scripts/groundwork.py config`, and `--json` output for every `groundwork.py` command.
- `.groundwork/config.json` in new projects: the Groundwork version, the generation date, and a SHA-256 checksum of each generated file, so a future update can tell framework files from customised ones. `init` and `add` keep it current. Active profiles stay only in `PROJECT.md`.
- Placeholders in `PROJECT.md` (`{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{PROJECT_DATE}}`), filled in by `new`, and a Description line.
- Tests for profile resolution, generation, file safety, the CLI and the wizard, validation parity with `check_docs.py` in every mode, and the packed npm artifact.
- Groundwork itself is released under the MIT Licence (`LICENSE`).
- CI (`.github/workflows/ci.yml`) and a tag-triggered npm release workflow (`.github/workflows/release.yml`).

### Changed
- The repository is now the package. The Groundwork template lives in `template/`; this changelog and `MIGRATION.md` moved out of it, because they describe Groundwork rather than your project.
- `init` records and applies profiles in sorted order, so the order you give them in never changes the result. Before, `init web application` and `init application web` wrote `PROJECT.md` and `AGENTS.md` differently.
- The scripts run on Python 3.9+ (previously 3.10+, through type annotations).
- `check_docs.py` no longer requires `.groundwork/` to be listed in `scaffold-manifest.json`, and treats `scripts/groundwork.py` as a template file.

## [3.0.0] - 2026-11-17

Groundwork now adapts to the kind of system being built. See `MIGRATION.md` for the decisions behind this release and how to upgrade.

### Added
- Profiles: `profiles/` with four initial profiles — Web, Application, Backend/API and AI Systems. Each is a `profile.json` manifest (purpose, when to use it, dependencies, documents, checks), a README (where each concern lives, engineering standards, agent instructions) and templates for the documents it owns. Profiles combine; the composition rules are in `profiles/README.md`.
- Profile documents: `docs/web/CONTENT.md` and `docs/web/SEO.md`; `docs/ai-systems/MODEL_INTEGRATION.md`, `EVALUATION.md`, `SAFETY.md` and the optional `RETRIEVAL.md`; the optional `docs/backend-api/DATA.md` and `docs/application/RELEASES.md`.
- `scripts/groundwork.py`: `list`, `init` and `add` commands that record the chosen profiles, create missing documents from templates, add profile checks to the `AGENTS.md` tooling table and keep `scaffold-manifest.json` up to date. It never overwrites or deletes a file.
- An initialization workflow in `profiles/README.md`: inspect, recommend, explain, confirm, generate, apply.
- `docs/examples/PROFILES.md`: worked profile combinations, including borderline cases.
- `PROJECT.md`: a Profiles section with the `- Profiles:` line the scripts read.
- `MIGRATION.md`: the migration summary and upgrade steps.

### Changed
- **Breaking for new projects:** the seven system-design parts, `docs/design/DESIGN.md` and `docs/architecture/contracts/README.md` are now core optional modules with templates in `profiles/core/templates/`. They are created at their usual paths when a profile needs them. Existing projects keep them where they are.
- `check_docs.py` validates profiles: manifest schema, single ownership of each document, the selection in `PROJECT.md`, dependencies, incompatibilities and required documents (errors), and documents from inactive profiles or profile checks missing from the tooling table (hygiene warnings). Templates under `profiles/<id>/templates/` are skipped by the ID and link checks. Without a `profiles/` folder, it behaves exactly as in 2.1.3.
- `SYSTEM_DESIGN.md` refers to `system-design/README.md` for the index of parts, instead of linking to parts that may not exist.
- `AGENTS.md`: read the active profiles' READMEs; profile standards are defaults that a project requirement or ADR overrides; conflicts between profiles are settled in an ADR; profile checks have rows in the tooling table.
- `README.md`, `docs/README.md`, `BUILD.md`, `scripts/README.md`, `.github/README.md`, the CI workflow comment and `docs/examples/EXAMPLE.md` describe profiles.

## [2.1.3] - 2026-11-17

### Changed
- The `check_docs.py` description in `docs/README.md` and `scripts/README.md` is now a short list of the three modes instead of one long paragraph. The same treatment was applied to the modes paragraph in `.github/README.md`.

## [2.1.2] - 2026-11-16

### Fixed
- Capability ID spelling is now checked in code files too. A `CAP-` token with the wrong number of digits (such as `CAP-9999` or `CAP-12`) in a file under `tests/` or `src/` is now an error.
- Several error messages were hard to read at first glance. They now start with the file path, keep to one short sentence, and say what to do where it is not obvious.

### Changed
- `--strict-coverage` does not include `--strict`. The CI workflow comment and the docs now say to use both flags together to fail on everything.

## [2.1.1] - 2026-11-16

### Fixed
- The manifest check no longer fails when you add your own files under `src/`, `tests/`, `config/`, `infrastructure/` or `scripts/`. Template files must still stay listed: if you delete one you don't need, remove it from `scaffold-manifest.json` too.
- `.gitignore`: example environment files (`.env.example`, `.env.sample`) can be committed.

### Changed
- `check_docs.py` warnings are split into two groups. Hygiene warnings (invalid status values, unserved capabilities) fail under `--strict`; coverage warnings (a requirement no design doc, plan or test references) print always and fail only under the new `--strict-coverage`. ADR status values are now checked too, and `CAP-NNN` IDs in `tests/` and `src/` are validated against the PRD.
- CI workflow: adds `permissions: contents: read`.

## [2.1.0] - 2026-11-16

### Added
- Capability IDs: PRD capabilities get `CAP-NNN` IDs, and requirements name the capability they serve in a **Serves** column.
- `docs/examples/EXAMPLE.md`: a short worked example of the traceability chain.
- `docs/plans/`: a home for implementation plans, with a template.
- Repository basics: `.gitignore`, `LICENSE.md` note, this changelog, a GitHub pull request template and a docs-check CI workflow.

### Changed
- `check_docs.py`: added `--strict`, warnings for unreferenced requirements, unserved capabilities and invalid status values; ID checks now cover `tests/` and `src/`; example text is skipped only inside inline code on illustrative lines.
- `AGENTS.md`: plan fields moved to `docs/plans/`, plain-language rules moved to "Project style (change freely)".
- `DESIGN.md`: skip notice and a "start here" checklist added.

## [2.0.0]

First versioned release of the template.
