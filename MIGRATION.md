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
