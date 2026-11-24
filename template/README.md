# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

## Documentation

This project uses [Groundwork](https://github.com/mich-nduka/groundwork) to write its documentation as the work needs it, not all up front. It starts with only:

- `PROJECT.md`: what the project is, where it stands, and the profiles it uses.
- `AGENTS.md`: how people and AI agents work in this repository.
- `GROUNDWORK.md`: how an AI agent helps you document the project, and your preferences for how it does that.

Open the project with your AI coding agent. It asks about the project a little at a time, and creates each document (requirements, architecture, design) only once you've given it something to put there. Run `groundwork status` at any time to see where things stand.

Groundwork's own files (its scripts, profiles and templates) live in `.groundwork/`. You don't need to open them. Without the `groundwork` command, run `node .groundwork/scripts/groundwork.mjs` instead (Node.js 18 or newer).
