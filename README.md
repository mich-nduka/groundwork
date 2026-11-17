# Groundwork

Start a software project with the minimum sufficient engineering documentation — project definition, requirements with traceable IDs, architecture, decisions and checks — adapted to what you're building through composable **profiles**.

```bash
npx create-groundwork
```

A short guided setup asks for the project name, a one-line description, the folder, and which profiles fit. Then it generates the project and checks it.

## Requirements

- Node.js 22 or newer, to run the CLI.
- Python 3.9 or newer. Groundwork's checks are plain Python scripts that ship inside every project, so any project — in any language — can be checked in CI without Node. If Python isn't on your `PATH` as `python3` or `python`, set `GROUNDWORK_PYTHON` to its path.

## Profiles

Groundwork Core is always included. Profiles add the documents, standards and checks a kind of system needs:

| Profile | For |
|---|---|
| `web` | Landing pages, marketing, corporate and content sites |
| `application` | Interactive web, mobile and desktop apps |
| `backend-api` | Services, APIs, workers and integrations |
| `ai-systems` | LLM features, retrieval, agents and model-driven workflows (always alongside one of the others) |

Choose them by what the system must do, not by the technology it uses. Profiles combine freely, and you can add one later without moving anything. Run `groundwork profiles` for the selection guidance.

## Commands

```text
npx create-groundwork [folder]       Create a project (guided)
groundwork create [folder]           Same, once installed (npm install -g create-groundwork)
groundwork profiles [id]             List profiles, or show one in detail
groundwork init <id...> | none       Choose this project's profiles and create their documents
groundwork add <path>                Create an optional document when you need it
groundwork validate [--strict] [--strict-coverage]
                                     Check the documentation
groundwork config                    Show the project's Groundwork configuration
```

Non-interactive creation, for scripts and AI agents:

```bash
npx create-groundwork parkmate --profiles application,backend-api --description "Parking management platform" --yes
npx create-groundwork tool --profiles none --yes        # Groundwork Core only
npx create-groundwork site --profiles web --dry-run     # show the plan, write nothing
```

`init`, `add` and `--dry-run` work inside any Groundwork project, including ones created before the CLI existed. Every command has `--help`.

## Safety

- Groundwork never overwrites or deletes a file. A new project needs a new or empty folder. `init` and `add` only create what's missing.
- A new project is built in a temporary folder and moved into place only when every step has succeeded.
- `.groundwork/config.json` records the checksum of every file Groundwork generated, so a future update can tell its own files from the ones you've edited.

## How it fits together

```text
create-groundwork (npm package)
├── dist/          the CLI: prompts, commands, output
└── template/      Groundwork itself — what every project gets
    ├── profiles/  core and the four profiles: manifests, READMEs, document templates
    └── scripts/   groundwork.py (profiles and generation) and check_docs.py (validation)
```

The CLI holds no profile rules of its own. It runs the Python scripts — the bundled ones to create a project, and the project's own copies after that — so `groundwork validate` and `python3 scripts/check_docs.py` always give the same result. Profile manifests in `profiles/*/profile.json` are the single source of truth. `template/README.md` and `template/profiles/README.md` explain the documentation model.

## Development

```bash
bun install
bun run test        # builds, then runs every test (the pack test needs network access)
npm pack            # builds the package exactly as it would be published
```

Tests create projects in temporary folders and drive the real commands. `test/pack.test.ts` installs the packed tarball and runs it from there. See `CHANGELOG.md` for releases and `MIGRATION.md` for upgrading projects.

## Licence

Groundwork is released under the [MIT Licence](LICENSE). Projects you create with it are yours: `LICENSE.md` in a new project is a placeholder for the licence you choose for your own work.
