# Groundwork

A simple starting point for new software projects. It doesn't pick a language, framework or hosting setup for you, and it gives each project only the documents and checks its kind of system needs.

## How it's organised

- **Groundwork Core** — what every project gets: the project definition, agent instructions, product and system requirements with traceable IDs, the architecture starting point, decisions, plans, and the documentation checker.
- **Agent workflow** — `GROUNDWORK.md` tells AI coding agents how to help you document the project progressively, and holds your preferences for how they do it. Each profile's `onboarding.json` says what each document needs.
- **Profiles** — what a kind of system adds on top: extra documents, engineering standards, agent instructions and checks. There are four to start with, and you can combine them:

| Profile | For |
|---|---|
| Web | Landing pages, marketing, corporate and content sites |
| Application | Interactive web, mobile and desktop apps |
| Backend/API | Services, APIs, workers and integrations |
| AI Systems | LLM features, retrieval, agents and model-driven workflows (always alongside one of the others) |

A company landing page uses Web. An online shop uses Application and Backend/API. An AI-powered SaaS product uses all three of Application, Backend/API and AI Systems. A library or command-line tool may need no profile at all. See `profiles/README.md` for how to choose and how profiles combine, and `docs/examples/PROFILES.md` for worked examples.

## Start here

**With an AI coding agent:** open the project with it. `AGENTS.md` sends the agent to `GROUNDWORK.md`, and the agent works out what the project needs, asks you about it a little at a time, and writes the documents with you. You make the decisions; set how much it may do on its own in `GROUNDWORK.md`. Run `groundwork status` at any time to see where things stand.

**On your own:**
1. Fill in `PROJECT.md`.
2. Write down what you're building and why in `docs/product/PRD.md`.
3. Choose profiles by what the system does, following the initialization steps in `profiles/README.md`. Then run `groundwork init <profiles>` (or `init none`) to create the documents they need. If you started with `npx create-groundwork`, this is already done.
4. Turn the PRD into testable requirements in `docs/product/SPEC.md`.
5. Design the system in `docs/architecture/SYSTEM_DESIGN.md` and the design documents your profiles added.
6. Adapt `AGENTS.md`, including its code standards, and fill in the tools for the checks your profiles added to its tooling table.
7. Run `python3 scripts/check_docs.py`. Add more documents only when the work needs them: `python3 scripts/groundwork.py add <path>`. `python3 scripts/groundwork.py docs` lists every document with what it's for.

Upgrading a project from Groundwork 2.x? See `MIGRATION.md` in the Groundwork package (`create-groundwork` on npm).

Every command is available two ways: through the `groundwork` command-line tool (`npm install -g create-groundwork`), or with Python alone (`python3 scripts/groundwork.py` and `python3 scripts/check_docs.py`). Both run the same scripts in this project, so they always agree.

## Principles
- Write things down when the work demands it, not all up front.
- Each fact lives in one place — link to it, don't copy it. Each document has one owner: core, or one profile.
- Classify a project by what it must do, not by the technology it uses.
- Keep tech choices separate from the project docs: pick the stack and repo layout on their own.
- Keep the trail: every capability, requirement, design and test should connect (see `docs/examples/EXAMPLE.md` for a small worked example — fictional, and safe to delete).
- Let tools check the code rules wherever possible (linters, tests, CI — the automated checks that run on every change).

This scaffold starts you in a single-repository layout for convenience — it's not a rule. Delete anything you don't use.
