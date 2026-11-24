# Migration to Groundwork 4.0: a lean start

Groundwork 3.x generated a whole documentation set the moment a project was created: about 70 files, most of them templates waiting to be filled in. 4.0 starts a project with five files and writes everything else only once the developer has said what goes in it. It also cuts what made Groundwork heavier than it needed to be: the Python runtime, the seven-file system design, three progress states and the assumption that every test names a requirement.

## What a new project gets

| 3.2 | 4.0 |
|---|---|
| `scripts/`, `profiles/`, `scaffold-manifest.json` at the top level | Moved into `.groundwork/` (`.groundwork/scripts/`, `.groundwork/profiles/`, `.groundwork/manifest.json`) |
| `docs/product/PRD.md`, `SPEC.md`, `docs/architecture/SYSTEM_DESIGN.md`, `BUILD.md`, `SECURITY.md`, `TEST_STRATEGY.md`, `REPOSITORY_STRUCTURE.md` shipped in place | Templates in `.groundwork/profiles/core/templates/`, created with `groundwork add PATH` when there is something to write |
| Profile documents created by `init` | `init` records the profiles and adds their checks; documents are created one at a time with `add` |
| Profiles chosen in the setup wizard | Chosen after discovery, with the agent (`--profiles` still works for scripts) |
| ADR, plan and feature-spec templates in `docs/` | `.groundwork/blueprints/` |
| `docs/README.md`, `scripts/README.md` | One reference page: `.groundwork/README.md` |
| `docs/examples/` | `.groundwork/examples/` |
| `.github/workflows/docs-check.yml`, `.github/pull_request_template.md` | Optional core documents: `groundwork add .github/workflows/docs-check.yml` |
| `LICENSE.md`, `config/`, `infrastructure/`, `src/`, `tests/` placeholders | Removed: create them when you need them |
| Python scripts: `groundwork.py`, `onboarding.py`, `check_docs.py` (Python 3.9+) | JavaScript: `groundwork.mjs`, `onboarding.mjs`, `checks.mjs` (Node.js 18+, no dependencies) |
| Seven documents in `docs/architecture/system-design/` | Parts of `docs/architecture/SYSTEM_DESIGN.md`, present only when a profile needs them or the project adds them |
| States `skipped`, `unknown`, `blocked` | `deferred`, with a note saying why |
| The `web` profile, `docs/web/` | The `content-site` profile, `docs/content-site/` (`web` still works as an ID) |
| Requirement IDs looked for in `src/` and `tests/` | Looked for in code wherever it lives; naming them in tests is the project's choice |

## Decisions

1. **No document before its content.** A template nobody has filled in is noise. Every document except `PROJECT.md` and `AGENTS.md` now has a template and is created when the agent (or developer) is about to write answers into it.
2. **Missing is not wrong.** A required document that isn't written yet is `pending`: `groundwork status` still asks its questions in order and says to create it. Validation never fails on it (but see decision 11). Only `PROJECT.md` and `AGENTS.md`, which every project starts with, must exist.
3. **Profiles after discovery.** Choosing a profile is a judgement about what the system does, which is exactly what discovery finds out. The wizard asks only for a name, a description, a folder and agent files; "Choose profiles now" is still offered at the review step.
4. **Groundwork's machinery is out of sight.** Scripts, profiles, templates and blueprints are framework files, not the project's. They live in `.groundwork/`, which the ID and link checks skip.
5. **The manifest lists Groundwork's files only.** Documents belong to the project, so new documents, ADRs and specs no longer need listing anywhere. The check is that Groundwork's own files under `.groundwork/` are intact.
6. **One runtime.** Groundwork needed Node for the CLI and Python for the checks. Both did the same work, twice. The engine is now one set of JavaScript files that every project carries, so a project needs only Node, and CI needs no package install.
7. **One system design document.** Seven files for one system's design was ceremony for most projects: a small system's design fits on a page or two. The parts are now sections of `SYSTEM_DESIGN.md`, present when a profile needs them, and a part that outgrows the page can still move to its own file with a summary and a link left behind.
8. **States that mean different things.** Skipped, unknown, blocked and deferred all meant "not settled yet, come back to it". One state with a note says the same, and an agent no longer has to choose between near-synonyms.
9. **Profiles named for what they're for.** "Web" read as "anything in a browser", but the profile is for content sites; a web app is an Application.
10. **Traceability where it pays.** Naming requirement IDs in tests suits regulated or audited work, and is busywork elsewhere. The project decides, in `AGENTS.md`; the checks find IDs wherever the code lives.
11. **Required means something.** A required document that is never written used to be invisible to `validate`. Once `PROJECT.md` says the project is in Development, it is a warning, unless it was deliberately deferred.

## Upgrading a 3.x project

Nothing has to change: a 3.x project keeps its own Python scripts and keeps working with them (`python3 scripts/groundwork.py <command>`, `python3 scripts/check_docs.py`). The 4.0 `groundwork` command doesn't run them; it says how to. To move to 4.0:

1. Create a new 4.0 project with the same profiles somewhere else (`npx create-groundwork tmp --profiles <yours> --yes`). Copy its `.groundwork/scripts/`, `profiles/`, `blueprints/`, `examples/`, `README.md` and `manifest.json` into your project's `.groundwork/` folder. Keep your own `.groundwork/config.json` and `state.json`.
2. Delete what moved into `.groundwork/`: `scripts/`, `profiles/`, `scaffold-manifest.json` and `docs/examples/` (its sample IDs fail the 4.0 checks). `docs/README.md`, the `_template` folders, `docs/architecture/adr/0000-template.md` and the placeholder READMEs (`config/`, `infrastructure/`, `src/`, `tests/`, `.github/`) can go too.
3. Replace the Python commands: in `.github/workflows/docs-check.yml`, use the 4.0 one from `.groundwork/profiles/core/templates/.github/workflows/`; in `.claude/settings.json`, change the hook to `node "$CLAUDE_PROJECT_DIR/.groundwork/scripts/groundwork.mjs" status --brief`; in `AGENTS.md`, the `python3 …` command at the top becomes `node .groundwork/scripts/groundwork.mjs status`. Take `GROUNDWORK.md` from the new project and copy your preferences back into it. The 3.x `README.md` explains Groundwork with Python commands: replace those parts with the short Groundwork section from the new project's README.
4. If you used the Web profile, change `web` to `content-site` on the Profiles line in `PROJECT.md`, move `docs/web/` to `docs/content-site/`, and change links to `docs/web/` to match.
5. Fold the system design into one document. In `docs/architecture/SYSTEM_DESIGN.md`, rename "Context and high-level view" to "Context" and delete the "Seven-part system design" index. Run `groundwork add docs/architecture/SYSTEM_DESIGN.md`, which adds the parts your profiles need. Then, for each file in `docs/architecture/system-design/`, move its content into its part, or keep the file and leave a short summary and a link in the part.
6. Run `groundwork mark --repair`. Your progress is kept: `skipped`, `unknown` and `blocked` become `deferred`, with the old name in the note, and entries for the old system-design paths are dropped. `groundwork status` then asks you to review the parts you moved content into.
7. Run `groundwork validate`.

# Migration to Groundwork 3.0: Profiles

This file explains how Groundwork 2.1.3 became a profile-based scaffold, the decisions behind it, and how to upgrade an existing project. It is about the template, not your project — delete it once you have upgraded.

## What changed, in one paragraph

Groundwork 2.1.3 gave every project the same full document set and told people to delete what they didn't need. 3.0 starts every project with a small core and lets it choose **profiles** — Web, Application, Backend/API and AI Systems — that add the documents, standards and checks its kind of system needs. Profiles combine, can be added later without moving anything, and are described by JSON manifests, so a new profile needs no code change.

## How 2.1.3 was mapped

| 2.1.3 item | 3.0 home | Why |
|---|---|---|
| `PROJECT.md`, `AGENTS.md`, `BUILD.md`, `PRD.md`, `SPEC.md`, feature specs, `SYSTEM_DESIGN.md`, ADRs, plans | Core, in place, unchanged in role | Every kind of project needs governance, requirements and traceability |
| `SECURITY.md`, `TEST_STRATEGY.md`, `REPOSITORY_STRUCTURE.md` | Core, in place, optional | Short and widely useful; profiles that depend on them require them |
| The seven system-design parts, `DESIGN.md`, `contracts/README.md` | Core optional modules, with templates in `profiles/core/templates/` and the **same paths** in projects | Several profiles need each of them; one owner means one copy |
| `check_docs.py` | Same file, plus profile checks | Existing checks are untouched |
| — | `profiles/` (four profiles), `scripts/groundwork.py`, `docs/examples/PROFILES.md` | New |

## Decisions

1. **Profiles select from core rather than copying it.** The seven-part design already splits architecture into good views. Application, Backend/API and AI Systems each need different subsets of the same views, so profiles *require* core parts instead of owning their own versions. As a result, the Application profile owns almost no documents — that's intended, not a gap.
2. **One owner per document.** Core owns the documents it lists; any other profile owns exactly the documents it has templates for. A document that two profiles need moves into core. This rule prevents duplicates by construction, and the checker enforces it. There is no merge or override logic for documents, because nothing can be defined twice.
3. **Composition is a union, with no precedence order.** The documents a project needs are the union of what core and each active profile require. Because profiles only ever add, profile order never matters. Real incompatibilities are declared (`incompatible_with`) and blocked. Disagreements between standards are resolved explicitly in an ADR, never by a hidden ranking.
4. **Profiles add only what the core has no home for.** Web adds content architecture and SEO. Measurable performance and accessibility targets are requirements, so they go in `SPEC.md`, not in a new document. AI Systems adds model integration, evaluation and safety, which no core document covers. Backend/API and Application each add one optional document for a real gap (data architecture; installed-client releases).
5. **Optional documents have a condition.** Each optional document states `when` it becomes worth writing, and it is created only then (`groundwork.py add`). That keeps documentation progressive.
6. **Validation requirements are named concerns, not tools.** A profile declares checks such as "Accessibility" or "AI evaluation". `init` adds them as rows to the existing tooling table in `AGENTS.md`, and the project fills in the tool. Groundwork stays technology-neutral, and the table stays the single list of checks.
7. **Selection is a judgement, recorded in `PROJECT.md`.** Nothing detects profiles from the code: technology doesn't decide responsibility. The scripts do the mechanical work; a person or agent picks the profiles using the "use when" and "not when" lists, and writes down why.
8. **AI Systems requires another profile.** AI is a capability of a product, so it is always paired with the profile that describes that product. It is the one dependency among the initial profiles, and it shows how the dependency mechanism works.
9. **The scripts never overwrite or delete.** `init` and `add` only create missing files and append. Dropping a profile leaves its documents in place, with a warning. This makes every run safe to repeat.
10. **JSON, standard library only.** The manifests are JSON so the scripts stay dependency-free, matching `check_docs.py`. `groundwork.py` imports its rules from `check_docs.py`, so the two scripts can't disagree.
11. **`SYSTEM_DESIGN.md` no longer links to all seven parts.** A project may not have them all, and broken links fail the check. The index of parts now lives in `system-design/README.md`.

## Compatibility

- **No document moved** within a project. Every 2.1.3 path is still valid, and a 2.1.3 project's design documents count toward its profiles' requirements as they are.
- **Without a `profiles/` folder, `check_docs.py` behaves exactly as in 2.1.3.** Same checks, same messages.
- **New projects start smaller.** A fresh clone no longer contains the seven system-design parts, `DESIGN.md` or `contracts/README.md` in `docs/`. `init` creates the ones your profiles need. This is the breaking change, hence version 3.0.0.
- **New checks apply only once you opt in.** Required core documents are checked once `profiles/` exists. Profile requirements are checked once `PROJECT.md` names profiles.

## Upgrading a 2.1.x project

1. Copy `profiles/`, `scripts/groundwork.py` and the new `scripts/check_docs.py` into your project.
2. Run `python3 scripts/check_docs.py`. It lists each new file as "on disk but not in the manifest". Add those files to `scaffold-manifest.json` (keep the list sorted and update `file_count`).
3. Choose profiles as described in `profiles/README.md`, then run `python3 scripts/groundwork.py init <profiles>`. It adds the Profiles section to `PROJECT.md`, keeps every document you already have, creates only what's missing, and adds the profile checks to your tooling table.
4. Optionally copy the new wording in `README.md`, `AGENTS.md` (the read order and the conflict rule), `docs/README.md` and `docs/architecture/SYSTEM_DESIGN.md`.
5. Run `python3 scripts/check_docs.py --strict`. Fill in the new tooling rows, and delete any design documents your profiles don't need.

## Groundwork 3.1: the command-line tool

3.1 packages Groundwork as `npx create-groundwork` and adds the `groundwork` command. The profile model, the documents and the checks are the same as in 3.0.

**Your 3.0 projects work with the CLI as they are.** `groundwork init`, `add`, `config` and `validate` run the project's own copies of `scripts/groundwork.py` and `scripts/check_docs.py`. A 2.x project (no `groundwork.py`) can still be validated.

To get the 3.1 additions in a 3.0 project, copy `scripts/groundwork.py` and `scripts/check_docs.py` from the package's `template/scripts/`. A 3.0 project has no `.groundwork/config.json`, and nothing creates one for it: Groundwork can't know which of its files you have changed since they were generated, so it records nothing rather than guess.

### Decisions

1. **Python stays the single engine.** All profile resolution, generation and validation stay in the two standard-library Python scripts that ship inside every project. The TypeScript CLI handles prompts, command parsing and output, and calls those scripts. A TypeScript port would have meant either two implementations of the same rules, or generated projects that need Node to check their documents, which would break Groundwork's technology neutrality. The cost is that the CLI needs Python 3.9+; it finds Python, checks the version, and explains how to install it when it's missing.
2. **One npm package.** The CLI and the template ship and version together, so a separate template package would add release work without any benefit. `package.json` and the template's `scaffold-manifest.json` carry the same version, and a test checks they match.
3. **`new` lives in the engine.** Creating a project means copying exactly the files in `scaffold-manifest.json` and running the existing `init`, so the CLI and `python3 scripts/groundwork.py new` produce identical projects.
4. **Active profiles stay in `PROJECT.md` only.** `.groundwork/config.json` records what only a tool needs: the version, the generation date, and the checksums of generated files. Keeping the profiles in two places would let them drift apart. The project name stays in `PROJECT.md` for the same reason.
5. **No `update` command yet.** The checksums are what a future `update` needs to leave customised files alone. A merge engine would come too early.
6. **`.gitignore` ships as `_gitignore`.** npm never packs files named `.gitignore`, so packing adds a temporary `_gitignore` copy, and `new` restores the real name.

## Groundwork 3.2: agent-first documentation

3.2 lets an AI coding agent do the documentation work with the developer. The agent finds out what the project needs, asks a little at a time, writes the documents, and records progress so the next session carries on. The developer gives direction, makes the decisions, and controls the process through `GROUNDWORK.md`. Profiles, documents and the existing checks are unchanged. The CLI and the Python scripts still work without any agent.

**Existing projects keep working.** In a 3.0 or 3.1 project, `groundwork init`, `add`, `config` and `validate` behave as before. `status`, `docs`, `mark` and `connect` explain that the project predates 3.2. To upgrade a project:

1. Copy `scripts/groundwork.py`, `scripts/check_docs.py` and `scripts/onboarding.py` from the package's `template/scripts/`.
2. Copy `GROUNDWORK.md` and each `profiles/<id>/onboarding.json` from `template/`, and add the Groundwork section from the top of `template/AGENTS.md` to your `AGENTS.md`.
3. List the new files in `scaffold-manifest.json`, then run `python3 scripts/check_docs.py`.

`status` works at once. In a 3.1 project, running `groundwork init` with your current profiles also fingerprints every document you haven't changed since it was generated. In a 3.0 project there are no checksums, so for documents shipped in place (such as the PRD), `status` can't tell template text from your own writing. It relies on what `mark` records instead.

### Decisions

1. **One engine, extended.** Onboarding lives in a third standard-library script, `scripts/onboarding.py`, used by `groundwork.py` and `check_docs.py`. The TypeScript CLI passes the new commands through, as it does the others.
2. **Definitions sit beside the manifests, not inside them.** `profile.json` stays exactly as it was and remains the only source for ownership, required or optional, and `when` conditions. `onboarding.json` adds only what onboarding needs. A profile without one still validates, so projects' own profiles keep working.
3. **Sections are anchored to headings.** Sections are identified by their template heading (numbering and case ignored), not by line numbers, so progress survives edits elsewhere in the document.
4. **One home per answer.** Each question is asked in exactly one section, and the checker enforces it. Sections that build on answers from elsewhere name them under `uses`, and the agent refers to them instead of asking again.
5. **Progress, not facts.** `.groundwork/state.json` holds states and short notes, never answers. The section fingerprints that tell template text from real writing live in `config.json` with the file checksums, since both record what Groundwork generated. If the state file is lost or damaged, nothing about the documents is lost: `status` still sees what has been written, and `mark --repair` keeps every valid entry and a copy of the old file.
6. **Autonomy lives in `GROUNDWORK.md`.** The `- Autonomy:` line follows the same pattern as `- Profiles:` in `PROJECT.md`: one human-editable source the engine reads. `config.json` stays tool-owned.
7. **`AGENTS.md` is the entry point; adapters are optional and thin.** Codex, Cursor, GitHub Copilot, Windsurf, Amp and others read `AGENTS.md` directly. Claude Code reads `CLAUDE.md`, so its adapter imports `AGENTS.md` and adds a `SessionStart` hook that runs `status --brief`. That is the one integration that puts the documentation state in front of the agent at session start. Gemini CLI gets a setting so it reads `AGENTS.md`. No agent starts a conversation just because a repository exists, so Groundwork claims no such thing: the guarantee is that any agent reading the project instructions finds and follows the workflow.
8. **Progressive by stage.** Discovery covers only `PROJECT.md` and the PRD. Design-stage documents follow once discovery is complete or declined. Everything else waits until the work reaches it. A developer who declines discovery is never asked again; the agent raises gaps only when they affect the task.
9. **Validation stays structural.** Invalid definitions and unreadable state are errors. Incomplete, skipped or deferred documentation never is.
10. **No new profiles, and no fewer documents created.** The optional core documents that 3.x ships in place (`SECURITY.md`, `TEST_STRATEGY.md`, `REPOSITORY_STRUCTURE.md`) still ship in place, for compatibility. `mark PATH not_applicable` records that one doesn't apply.
