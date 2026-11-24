# Groundwork

Groundwork's own files. You don't need to edit anything here; the agent and the `groundwork` command use them. This page is the reference for how the documentation is organised.

## What's here

- `scripts/`: `groundwork.mjs` (commands), `onboarding.mjs` (the onboarding engine) and `checks.mjs` (validation). Node.js 18+, no dependencies. The `groundwork` command-line tool runs these same scripts, so the two always agree.
- `profiles/`: Groundwork Core and the profiles. Each has a manifest (`profile.json`), onboarding questions (`onboarding.json`), a README with its standards, and `templates/` for the documents it owns. See `profiles/README.md`.
- `blueprints/`: templates for documents a project writes many of: `adr.md`, `feature-spec.md`, `plan.md`.
- `examples/`: a small worked example of the traceability chain (`EXAMPLE.md`) and of profile choices (`PROFILES.md`).
- `manifest.json`: the Groundwork version and its files. `config.json` records what Groundwork generated; `state.json` records onboarding progress (never answers, which live in the documents).

## Documents grow with the project

A project starts with `PROJECT.md`, `AGENTS.md`, `GROUNDWORK.md` and a README. Every other document is created from its template (`groundwork add PATH`) once there is something to write in it. `groundwork status` shows what's next, and `groundwork docs` lists every document of core and the active profiles with its status.

| Document | Holds | Usually written |
|---|---|---|
| `docs/product/PRD.md` | The problem, users, outcomes and capabilities (`CAP-NNN`) | During discovery |
| `docs/product/SPEC.md` | Testable requirements (`SCOPE-FR-NNN`), and the index of feature specs in `docs/product/specs/` | After the PRD |
| `docs/architecture/SYSTEM_DESIGN.md` | The architecture in one document: the summary and context, plus the parts the active profiles need (domain, behaviour, interfaces, execution, operations, UI mapping) | When design starts |
| `BUILD.md` | How to build, run and test locally | When the first stack is chosen |
| `docs/architecture/adr/` | Records of important decisions (ADRs), from `blueprints/adr.md` | When a decision is costly to reverse |
| `docs/plans/` | One short plan per non-trivial change, from `blueprints/plan.md` | Before the change |

Profiles add their own documents (design, content, data, AI safety and so on), listed in each `profile.json`.

The traceability chain: the PRD gives each capability a `CAP-NNN` ID. `SPEC.md` and feature specs turn capabilities into requirement IDs such as `AUTH-FR-001`, naming the capability each one serves. Design documents and plans name the IDs they implement. Naming them in tests too is the project's choice, recorded in the code standards in `AGENTS.md`; `groundwork validate --strict-coverage` then reports requirements nothing references.

When documents disagree, the more specific one wins for its area: a feature spec over `SPEC.md`, an accepted ADR over the design summary, a project requirement or ADR over a profile's default standard. The conflict is recorded, not silently resolved.

## Status values

Use exactly these values, so the checker can verify them:

- Project status (`PROJECT.md`): Discovery, Design, Development, Production, Maintenance.
- Document and spec status (`SYSTEM_DESIGN.md`, feature specs, the feature index): Draft, In Review, Approved, Superseded.
- ADR status: Proposed, Accepted, Rejected, Superseded.
- Requirement priority: Must, Should, Could.

## Commands

| Command | Does |
|---|---|
| `groundwork status [--brief]` | Where onboarding stands, and the next questions to ask |
| `groundwork docs [PATH]` | Every document in use, or one document's sections and questions |
| `groundwork add PATH[#SECTION]` | Create a document from its template when there's something to write in it, or add a part the document doesn't have yet |
| `groundwork init <profiles> \| none` | Choose the profiles; records them in `PROJECT.md` and adds their checks to `AGENTS.md` |
| `groundwork profiles [id]` | What each profile is for, and what it adds |
| `groundwork mark TARGET... STATE` | Record onboarding progress (see `GROUNDWORK.md`) |
| `groundwork validate [--strict] [--strict-coverage]` | Check the documentation |
| `groundwork config` | The project's Groundwork configuration |
| `groundwork connect [claude\|gemini]` | Instruction files for agents that don't read `AGENTS.md` |

Without the `groundwork` command, run `node .groundwork/scripts/groundwork.mjs <command>`. Every command takes `--json`, and those that write take `--dry-run`. Groundwork never overwrites or deletes a file.

`groundwork validate` checks that Groundwork's files are intact, that the feature index matches `docs/product/specs/`, requirement and capability IDs (grammar, uniqueness and traceability, including references in code and tests wherever they live, outside dependency and build folders), internal links, the profile rules and the onboarding definitions. A document that isn't written yet is never an error. Warnings come in two groups, each failing only under its flag: hygiene (`--strict`: status values, unserved capabilities, documents from inactive profiles, profile checks missing from `AGENTS.md`, renamed profile IDs, and required documents nobody has written or deferred once `PROJECT.md` says Development or later) and coverage (`--strict-coverage`: requirements nothing references). To run it in CI on GitHub, `groundwork add .github/workflows/docs-check.yml`.
