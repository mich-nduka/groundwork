# Agent Instructions

## Start here: Groundwork

This project uses Groundwork to build its documentation with the developer, a little at a time. At the start of every session, run `groundwork status` (or `node .groundwork/scripts/groundwork.mjs status`) and follow `GROUNDWORK.md`. It covers how to help the developer document the project, how to record progress, and how much you may do without asking. If discovery hasn't started and the developer hasn't declined it, offer it, but never let it block what they asked for.

## Read before changing

Read what exists, in this order. Documents are created only as the project needs them, so some may not exist yet. `groundwork docs` lists the ones in use.

1. `PROJECT.md`: what the project is, where it stands, and which profiles it uses. For each profile, read `.groundwork/profiles/<id>/README.md`.
2. `docs/product/PRD.md` and `docs/product/SPEC.md`: the problem, the capabilities (`CAP-NNN`) and the testable requirements, plus any feature spec in `docs/product/specs/` for the area you're changing.
3. `docs/architecture/SYSTEM_DESIGN.md` and the design documents for the parts you touch.
4. `BUILD.md`: how to build, run and test locally.
5. The code and tests you're about to change.

If documents disagree, the more specific one wins for its area: a feature spec over `SPEC.md`, an accepted ADR over the design summary, a project requirement over a profile's default standard. Record the conflict in your completion report instead of silently choosing.

## Rules
- Treat approved requirements, domain invariants (rules that must always hold) and accepted ADRs (records of important decisions, in `docs/architecture/adr/`) as fixed constraints.
- Make the smallest change that does the job. Don't add code, structure, documents or libraries "just in case".
- Never quietly change public interfaces, stored data, permissions or security boundaries.
- Never weaken, skip or delete tests to make a change pass.
- If requirements are unclear, ask, or write down the assumption you're making.
- Keep the code, its tests and its docs telling the same story.
- Never commit secrets or sensitive data.
- Write in plain language: short sentences, everyday words, and a plain explanation of any technical term the first time it appears.

## Code standards

Not decided yet. Record the project's conventions here as they're agreed: naming, layout, error handling, how tests are named. Decide here whether tests name the requirement IDs they verify (such as `AUTH-FR-001`): worth it when someone must show that every requirement is tested, optional otherwise. Rules a machine can check belong in formatters, linters and CI, not here.

## Tooling

Active profiles add rows for the checks they need. Fill in the tool, or write why a check doesn't apply. Don't delete the row.

| Concern | Tool / command | Must pass in CI? |
|---|---|---|
| Format | | |
| Lint | | |
| Tests | | |

## Workflow
1. Find the requirements (and the `CAP-` capabilities they serve) the change must satisfy, if they're written down yet.
2. For a non-trivial change, write a short plan first: copy `.groundwork/blueprints/plan.md` into `docs/plans/`.
3. Build it, test it, run the checks and read the full diff.
4. Update the documents the change affects, and record documentation progress as `GROUNDWORK.md` describes. If the system takes on a new kind of responsibility (for example its first AI feature), recommend a profile and add it with `groundwork init` once the developer agrees.

## Definition of done
- It meets the requirements and acceptance criteria it links to, and the required checks pass.
- Security, privacy, data compatibility and operational effects are considered.
- Affected documentation and ADRs are updated.

Report what changed, which requirements it satisfies, which checks ran and their results, and anything unfinished.
