# Documentation Guide

## The main documents

Every project has these (Groundwork Core):

- `../PROJECT.md`: what the project is called, where it stands, which profiles it uses, and where everything lives.
- `product/PRD.md`: the problem, the users and the outcomes we want.
- `product/SPEC.md`: testable requirements for the whole system, with feature specs in `product/specs/`.
- `architecture/SYSTEM_DESIGN.md`: the architecture starting point and index of the seven-part design.
- `../BUILD.md`: how to build, run and test the project locally.
- `engineering/SECURITY.md` and `engineering/TEST_STRATEGY.md`: security requirements and how the project is tested.
- `architecture/adr/`: why the big decisions were made (ADR = Architecture Decision Record).
- `plans/`: one short plan per non-trivial change (template inside).
- `examples/`: small, fictional worked examples — delete them when you don't need them.
- `../AGENTS.md`: how to work on this project, for humans and AI agents.

The active profiles add more (see `../profiles/README.md`):

- `architecture/system-design/`: the parts of the seven-part system design the project needs.
- `design/DESIGN.md`: how the product looks, feels and is structured for users.
- `architecture/contracts/`: detailed API and event contracts, when an interface needs one.
- One folder per profile for what only that profile covers, such as `web/` or `ai-systems/`.

Write each fact in one place and link to it from everywhere else. Give every requirement a stable ID (for example, `AUTH-FR-001`) and every PRD capability a `CAP-NNN` ID. Keep documents as short as the work needs. Write down assumptions and open questions.

The traceability chain: `product/PRD.md` states the problem and gives each capability a `CAP-NNN` ID → `product/SPEC.md` and `product/specs/` turn capabilities into testable requirement IDs and name, in each requirement's **Serves** column, the capability it covers → the architecture and profile documents reference the IDs they serve → implementation plans and tests name the IDs they satisfy.

When documents disagree, the more specific one wins for its area — a feature spec over `SPEC.md` for that feature, an accepted ADR over the design summary, a project requirement or ADR over a profile's default standard — and the conflict is recorded rather than silently resolved.

## Status values

Use exactly these values, so tools can check them:

- Project status (`PROJECT.md`): Discovery, Design, Development, Production, Maintenance — where the project stands overall.
- Document and spec status (`SYSTEM_DESIGN.md`, feature specs, the feature index): Draft (being written), In Review (being checked), Approved (agreed — treat as a fixed constraint), Superseded (replaced by a newer version).
- ADR status (`architecture/adr/`): Proposed (suggested, not yet agreed), Accepted (agreed — treat as fixed), Rejected (considered and turned down), Superseded (replaced by a newer ADR).
- Requirement priority: Must (required), Should (strongly wanted — defer only with a reason), Could (nice to have).

## Tools

- `scripts/groundwork.py`: chooses profiles (`init`), creates optional documents from their templates (`add`), shows what each profile offers (`list`) and the project's Groundwork configuration (`config`). It never overwrites or deletes a file. The `groundwork` command-line tool runs the same script: `groundwork init`, `groundwork add`, `groundwork profiles`, `groundwork config`, `groundwork validate`.
- `scripts/check_docs.py`: run it after adding, renaming or removing documents, feature specs, requirement IDs, links or profiles. It verifies the manifest, the feature index, internal links, requirement traceability and the profile rules, and prints errors and warnings.

The warnings come in two groups: hygiene (invalid status values, unserved capabilities, documents from inactive profiles, missing profile checks) and coverage (a requirement no design doc, plan or test references). Each group fails only under its flag:

- Default: only errors fail.
- `--strict`: hygiene warnings fail too.
- `--strict-coverage`: coverage warnings fail too.

`--strict-coverage` does not include `--strict`. Use both flags together to fail on everything.

Files you add under `src/`, `tests/`, `config/`, `infrastructure/` or `scripts/` don't need to be in `scaffold-manifest.json`, but template files must stay listed there. `groundwork.py` lists the documents it creates for you.
