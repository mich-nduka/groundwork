# Groundwork

Start a software project with the minimum sufficient engineering documentation — project definition, requirements with traceable IDs, architecture, decisions and checks — adapted to what you're building through composable **profiles**.

```bash
npx create-groundwork
```

A short guided setup asks for the project name, a one-line description, the folder, and whether to add files for a particular AI coding agent. The project starts lean:

```text
my-project/
├── README.md       the project, and how its documentation works
├── PROJECT.md      name, description, status, profiles (chosen later)
├── AGENTS.md       how people and agents work in the repository
├── GROUNDWORK.md   how the agent documents the project, and your preferences
├── .gitignore
└── .groundwork/    Groundwork's scripts, profiles and templates (you don't need to open it)
```

Nothing else is generated up front. Requirements, architecture and design documents are written once you've said what goes in them.

## Working with an AI coding agent

Open the new project with your coding agent. `AGENTS.md`, which most agents read on their own, sends it to `GROUNDWORK.md`. That file is the workflow: find out what you're building, ask a few related questions at a time in plain language, create each document only when there are answers to write into it, and record progress so the next session continues where this one stopped. Discovery covers the project and the product first. Then the agent recommends profiles, and you confirm them. Architecture, security and the rest follow when the work reaches them.

You stay in control. Skip, defer or rule out any question, section or document. Set the agent's autonomy in `GROUNDWORK.md` (`guided`, `balanced` or `autonomous`). Important decisions always need your confirmation, and the agent never treats its own assumptions as approved. `groundwork status` shows where everything stands, with or without an agent.

For Claude Code, `--agents claude` (or `groundwork connect claude`) adds a `CLAUDE.md` and a session-start hook that shows the documentation status at the start of every session. `--agents gemini` makes Gemini CLI read `AGENTS.md`.

## Requirements

- Node.js 22 or newer, to run the CLI.
- Inside a project, nothing but Node.js 18 or newer. Every project carries its own engine in `.groundwork/scripts/` (plain JavaScript, no dependencies), so any project, in any language, can run its checks in CI without installing this package: `node .groundwork/scripts/groundwork.mjs validate`.

## Profiles

Groundwork Core is always included. Profiles add the documents, standards and checks a kind of system needs:

| Profile | For |
|---|---|
| `content-site` | Landing pages, marketing, corporate and documentation sites: content people read (called `web` before 4.0; that ID still works) |
| `application` | Interactive web, mobile and desktop apps: people sign in and work with their own data |
| `backend-api` | Services, APIs, workers and integrations |
| `ai-systems` | LLM features, retrieval, agents and model-driven workflows (always alongside one of the others) |

Choose them by what the system must do, not by the technology it uses, which is why they're chosen after discovery rather than in the setup wizard (pass `--profiles` if you already know). Profiles combine freely, and you can add one later without moving anything. Run `groundwork profiles` for the selection guidance.

## Commands

```text
npx create-groundwork [folder]       Create a project (guided)
groundwork create [folder]           Same, once installed (npm install -g create-groundwork)
groundwork profiles [id]             List profiles, or show one in detail
groundwork init <id...> | none       Choose this project's profiles (after discovery)
groundwork add <path>[#section]      Create a document once there is something to write in it,
                                     or add a part it doesn't have yet
groundwork validate [--strict] [--strict-coverage]
                                     Check the documentation
groundwork config                    Show the project's Groundwork configuration
groundwork status [--brief]          Where documentation onboarding stands, and what's next
groundwork docs [path]               Documents in use, or one document's sections and questions
groundwork mark <target...> <state>  Record onboarding progress (agents use this; see GROUNDWORK.md)
groundwork connect [claude|gemini]   Add instruction files for agents that don't read AGENTS.md
```

Non-interactive creation, for scripts and AI agents:

```bash
npx create-groundwork parkmate --description "Parking management platform" --yes   # profiles chosen later
npx create-groundwork shop --profiles application,backend-api --yes
npx create-groundwork tool --profiles none --yes        # Groundwork Core only
npx create-groundwork site --profiles content-site --dry-run   # show the plan, write nothing
npx create-groundwork app --profiles application --agents claude --yes
```

The commands work inside any project created with Groundwork 4. A project from before 4.0 keeps its own Python scripts; the CLI says how to run them, and `MIGRATION.md` explains the move. Every command has `--help`.

## Safety

- Groundwork never overwrites or deletes a file. A new project needs a new or empty folder. `add` only creates what's missing, and `init` only edits the Profiles line in `PROJECT.md` and the tooling table in `AGENTS.md`.
- A new project is built in a temporary folder and moved into place only when every step has succeeded.
- `.groundwork/config.json` records the checksum of every file Groundwork generated, so a future update can tell its own files from the ones you've edited.
- `.groundwork/state.json` records onboarding progress only; your answers live in the documents, which always win when the two disagree.

## How it fits together

```text
create-groundwork (npm package)
├── dist/          the CLI: prompts, commands, output
└── template/      Groundwork itself — what every project gets
    ├── README.md, PROJECT.md, AGENTS.md, GROUNDWORK.md, .gitignore   the entry files
    └── .groundwork/
        ├── profiles/    core and the four profiles: manifests, onboarding definitions, READMEs,
        │                and the templates every document is created from
        ├── blueprints/  ADR, feature spec and plan templates
        └── scripts/     groundwork.mjs (commands), onboarding.mjs (the onboarding engine)
                         and checks.mjs (validation), for Node.js 18+
```

The CLI holds no profile rules of its own. It runs the engine scripts — the bundled ones to create a project, and the project's own copies after that — so `groundwork validate` and `node .groundwork/scripts/groundwork.mjs validate` always give the same result. Profile manifests in `.groundwork/profiles/*/profile.json` are the single source of truth for documents and ownership; `.groundwork/profiles/*/onboarding.json` adds only how each document is onboarded. `template/.groundwork/README.md` and `template/.groundwork/profiles/README.md` explain the documentation model.

## Development

```bash
bun install
bun run test        # builds, then runs every test (the pack test needs network access)
npm pack            # builds the package exactly as it would be published
```

Tests create projects in temporary folders and drive the real commands. `test/pack.test.ts` installs the packed tarball and runs it from there. See `CHANGELOG.md` for releases and `MIGRATION.md` for upgrading projects.

## Licence

Groundwork is released under the [MIT Licence](LICENSE). Projects you create with it are yours: Groundwork doesn't choose a licence for them.
