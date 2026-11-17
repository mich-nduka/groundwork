# Agent Instructions

## Read before changing

Read in this order — each step narrows the last:

1. `PROJECT.md` — what the project is called, where it stands, where things live, and which profiles it uses. Then read `profiles/<id>/README.md` for each profile it lists: they add documents, standards and instructions for that kind of system. If no profiles are chosen yet, follow the initialization steps in `profiles/README.md` first.
2. `docs/product/PRD.md` — the problem, users, outcomes and capabilities (each capability has a `CAP-NNN` ID); needed when the change touches product intent.
3. `docs/product/SPEC.md` — the testable requirements. Check its feature index (§9) for a feature spec covering the area you're changing, and read that too.
4. `docs/architecture/SYSTEM_DESIGN.md` and the design docs for the parts you touch (in `docs/architecture/system-design/`) — `docs/design/DESIGN.md` for UI work — plus any profile documents for the area (for example `docs/ai-systems/`).
5. `BUILD.md` — how to build, run and test locally.
6. Any local instructions, plus the code and tests you're about to change.

If documents disagree, the more specific one wins for its area: a feature spec over `SPEC.md` for that feature's behaviour, an accepted ADR over the design summary. Profile standards are defaults: a project requirement or an accepted ADR overrides them. If two active profiles' standards disagree, no profile outranks another — record the resolution in an ADR. Record the conflict in the completion report instead of silently choosing.

## Rules
- Treat approved requirements, domain invariants (rules that must always hold) and ADRs (short records of important decisions, in `docs/architecture/adr/`) as fixed constraints.
- Read the existing code and tests before changing them.
- Make the smallest change that does the job. Don't add code, structure or libraries "just in case".
- Never quietly change public interfaces, stored data, permissions or security boundaries.
- Never weaken, skip or delete tests to make a change pass. If a test must change, say why in the completion report.
- If requirements are unclear, ask — or write down the assumption you're making.
- Keep the code, its tests and its docs telling the same story.
- Never commit secrets or sensitive data.

## Project style (change freely)

These are the template's defaults for how writing should read. Change or replace them to suit the project.

- Write documentation in plain language: short sentences, everyday words, and a plain-language explanation alongside any technical term the first time it appears.
- Keep the same plain tone in replies and reports: short, direct sentences, everyday words, and no jargon without an explanation.

## Code standards

> These are placeholders — adapt them to the project. Rules a machine can check belong in formatters, linters and CI (the automated checks that run on every change) — not in this file.

### Principles
- Write code that's easy to read and leaves nothing to guess.
- Keep each module focused on one job, and add dependencies on purpose, not by accident.
- Make it obvious who owns each piece of data, and what code reaches outside itself.
- Check input at the edges of the system, before it gets in.
- Decide what happens when things go wrong — don't let errors slip past unnoticed.

### Naming and layout
Agree on names for files, folders, types, functions, variables, database objects and public APIs. Say which modules may depend on which, and in which direction.

### Types, data and errors
Decide how strictly types are checked, how input is validated, how missing values are handled, and how errors are grouped and passed along.

### Testing and documentation
Say where tests live, how they're named, what fixtures are, and how much coverage you expect. Name tests so they mention the requirement IDs they verify — a test covering `AUTH-FR-001` says so — making requirement coverage searchable. Document public interfaces, surprising behaviour, and anything someone on call would need to know.

### Tooling
Active profiles add rows for the checks they need (`scripts/groundwork.py init` adds them). Fill in the tool, or write why a check doesn't apply — don't delete the row.

| Concern | Tool / command | Must pass in CI? |
|---|---|---|
| Format | | |
| Lint | | |
| Type check | | |
| Tests | | |
| Security checks | | |

## Workflow
1. Find the requirement IDs — and the `CAP-` capabilities they serve — plus the acceptance criteria the change must satisfy.
2. Trace what state, behaviour, interfaces and components it touches.
3. Plan the smallest safe change. For a non-trivial change, write the plan down first: copy `docs/plans/_template/PLAN.md` into `docs/plans/` and fill it in. Name the requirement IDs the plan covers.
4. Build it and test it.
5. Run the relevant checks and read the full diff before calling it done.
6. Update any docs and ADRs the change affects. If the change gives the system a new kind of responsibility (for example its first AI feature), check whether a profile should be added, and add it with `scripts/groundwork.py init`.

## Definition of done

A change is done when all of this holds:

- [ ] It meets the requirements and acceptance criteria it links to.
- [ ] Domain rules and invariants (rules that must always hold) still hold.
- [ ] Tests cover the expected behaviour and the important failure cases, and the required checks pass.
- [ ] Security, privacy, accessibility and performance impacts are considered.
- [ ] Interfaces and data migrations stay compatible, or there's a migration plan.
- [ ] Logs and metrics are useful and expose no sensitive data.
- [ ] Deployment, rollback and operational effects are understood.
- [ ] Documentation and ADRs are updated where needed (step 6).

Mark anything that doesn't apply with a reason. This checklist supports judgement; it doesn't replace it.

## Completion report
Report: what changed, which requirements it satisfies, which checks ran and their results, and anything unfinished or worth flagging. Local `AGENTS.md` files in subfolders may add stricter rules — follow those where present.
