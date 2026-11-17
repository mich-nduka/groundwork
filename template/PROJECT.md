# Project Definition

The cover page: what the project is called, where it stands, what limits the work, and where everything lives. Product substance — the problem, users, outcomes, scope and success measures — lives in `docs/product/PRD.md`; record it there, not here.

## The basics
- Name: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION}}
- Status: Discovery / Design / Development / Production / Maintenance
- Owner:
- Last updated: {{PROJECT_DATE}}

## Project constraints
Limits that shape the work but not the product itself: budget, timeline, team size, regulatory and platform commitments.

## Profiles
Profiles add the documents, standards and checks a kind of system needs on top of Groundwork Core. Choose them by what the system does, not by the technology it uses — see `profiles/README.md`, then run `groundwork init <profiles>` (or `python3 scripts/groundwork.py init <profiles>`), which fills in the line below. Use `none` for core only.

- Profiles: [not chosen yet]
- Why:

## Links
- Profiles and how to choose them: `profiles/README.md`
- Product requirements: `docs/product/PRD.md`
- System requirements: `docs/product/SPEC.md`
- System design: `docs/architecture/SYSTEM_DESIGN.md`
- Build and run: `BUILD.md`
