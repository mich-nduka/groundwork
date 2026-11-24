# Profiles

Groundwork Core gives every project the same base: the project definition, agent instructions, product and system requirements with traceable IDs, the architecture starting point, decisions and the documentation checks. **Profiles** add what a particular kind of system needs on top: extra documents, engineering standards, agent instructions and checks. A project uses as many profiles as it has kinds of responsibility, and no more.

| Profile | For | Adds |
|---|---|---|
| [Content site](content-site/README.md) | Landing pages, marketing, corporate and documentation sites: content people read. Was `web`; that ID still works | Content architecture, search and sharing, design, accessibility and performance checks |
| [Application](application/README.md) | Interactive web, mobile and desktop apps | Feature-level specs, the interaction model, application architecture |
| [Backend/API](backend-api/README.md) | Services, APIs, workers, integrations | Domain model, contracts, data architecture, resilience, operations |
| [AI Systems](ai-systems/README.md) | LLM features, retrieval, agents, model-driven workflows | Model integration and context, evaluation and observability, AI safety and data governance |

Some examples: a company landing page uses Content site. An online shop uses Application and Backend/API. An AI-powered SaaS product uses Application, Backend/API and AI Systems. A marketing site with a visitor-facing AI assistant uses Content site and AI Systems. More worked combinations are in `../examples/PROFILES.md`.

## Initialization

Do this once discovery shows what the system does (not before: a new project starts with no profiles chosen), and again whenever the system takes on a new kind of responsibility. An agent can run every step; a person confirms the choice in step 4.

1. **Inspect the requirements.** Read `PROJECT.md`, `docs/product/PRD.md` if it exists, and whatever brief the developer has. If there's nothing yet, ask what the system must do, for whom, and what it must keep running.
2. **Recommend profiles.** Run `groundwork profiles` and compare each profile's "use when" and "not when" with what the system actually does. Answer these questions:
   - Is the main job publishing content people read? → Content site. (A web app, where people sign in and work with their own data, is an Application.)
   - Do people do work in it — sign in, create and change their own data? → Application.
   - Does it own server-side logic or data that other software depends on, with failures and operations to design for? → Backend/API.
   - Does the system's behaviour depend on a model at run time? → AI Systems (with at least one of the others).
   - None of these, such as a library or a command-line tool? → `none`: core alone is enough.
3. **Explain the choice briefly.** One sentence per profile, naming the responsibility that justifies it, plus any profile you considered and left out, and why.
4. **Confirm.** Ask the person to confirm or change the selection. Don't go ahead on a guess.
5. **Record the choice.** Run `groundwork init <profile> [<profile> ...]`, or `node .groundwork/scripts/groundwork.mjs init ...` without the command (add `--dry-run` first to preview). It records the profiles in `PROJECT.md` and adds the profiles' checks to the tooling table in `AGENTS.md`. It creates no documents: the profiles' documents now appear in `groundwork status`, and each is created from its template (`groundwork add <path>`) once there is something to write in it. It never overwrites or deletes anything. Then write the explanation from step 3 under "Why:" in `PROJECT.md`.
6. **Apply the profile.** Read each active profile's README: its standards and agent instructions now apply. `groundwork validate` now checks the profile rules too.

**Classify by responsibility, not technology.** A React front end doesn't make a project an Application, and an installed AI SDK doesn't make it an AI System. What counts is what the system must do and keep doing. When a case is borderline, choose the smaller set: adding a profile later is one command, and nothing has to move.

## How composition works

Several profiles can be active at once. These rules keep that simple and predictable:

1. **Core is always active.** Profiles add to core; they never remove or change a core document.
2. **Requirements add up.** A project needs core's required documents plus every active profile's required documents, each written when the work reaches it. If any active profile requires a document, it is required. Nothing outranks anything else, so the order of profiles in `PROJECT.md` doesn't matter.
3. **Every document has one owner.** Core owns the documents it lists. Any other profile owns exactly the documents it has templates for, and it may list only its own documents and core's. If two profiles need the same document, that document belongs in core — which is why `SYSTEM_DESIGN.md` and `DESIGN.md` are core documents that profiles switch on. There is one template per document, and the checker rejects a second owner.
4. **Shared documents describe every side once.** `SYSTEM_DESIGN.md` holds only the parts the active profiles need (`needs` in their `onboarding.json`). When Application and Backend/API both need its Architecture and interfaces part, there is one copy, and it describes client and services as separate components. Profiles add *where to put things*, never a second copy.
5. **Dependencies are declared.** A profile can require another profile, or one of several (`requires`). AI Systems requires one of Application, Backend/API or Content site, because AI is a capability of a product, not a product on its own.
6. **Real conflicts are declared, not ranked.** If two profiles truly can't be combined, their manifests say so (`incompatible_with`), and the checker stops the combination. None of the four current profiles conflict.
7. **Conflicting guidance is resolved explicitly.** Each profile's standards apply to the part of the system that has that responsibility (Content site to the public pages, Application to the signed-in product). Where two standards still disagree about the same part, no profile wins by default: decide, and record the decision in an ADR. A project requirement or an accepted ADR always overrides a profile default.
8. **Optional documents start when their condition is true.** Each optional document has a `when` condition. Create it then with `groundwork add <path>`, not before.
9. **Checks are merged by name.** If two profiles need an "Accessibility" check, one tooling-table row covers both.
10. **Dropping a profile deletes nothing.** Re-run `init` without it. Its documents stay, and the checker warns about them until you delete them or bring the profile back.

## What the checker enforces

`groundwork validate` validates profiles whenever this folder exists:

- **Errors:** an invalid manifest, a document with two owners, a profile listing another profile's document, an unknown or duplicated profile in `PROJECT.md`, a missing dependency, or an incompatible pair. A required document that isn't written yet is not an error; `groundwork status` lists it.
- **Hygiene warnings** (fail under `--strict`): a document from a profile that isn't active, and a profile check with no row in the `AGENTS.md` tooling table.
- **Onboarding errors:** an invalid `onboarding.json` (see below) or an unreadable `.groundwork/state.json`. Unfinished onboarding is never an error.

Templates under `.groundwork/profiles/<id>/templates/` aren't checked for IDs or links where they sit; they are checked once copied into place.

## Manifest reference

Each profile is a folder: `profile.json` (what machines read), `README.md` (standards and instructions people and agents read), and `templates/` (one template per owned document, at the path it will have in the project).

```json
{
  "schema": 1,
  "id": "example",
  "name": "Example",
  "purpose": "One or two sentences: what kind of system this is for, and what it adds.",
  "use_when": ["A responsibility that justifies this profile."],
  "not_when": ["A look-alike case that does not, and what to do instead."],
  "requires": ["other-profile", ["either-this", "or-this"]],
  "incompatible_with": [],
  "documents": [
    { "path": "docs/example/THING.md", "required": true },
    { "path": "docs/example/EXTRA.md", "required": false, "when": "The condition that makes it worth writing." }
  ],
  "checks": [
    { "name": "Example check", "what": "What must be verified, in tool-neutral words." }
  ]
}
```

- `id` matches the folder name: lowercase letters, digits and hyphens.
- `requires`: each entry is a profile ID that must be active, or a list of IDs of which at least one must be active.
- `documents`: `path` is where the document lives in the project. A path with a template in this profile's `templates/` is owned by this profile; any other path must be a core document. Optional documents need `when`; required ones must not have it.
- `checks`: concerns the project must verify. `init` adds a row named after each check to the tooling table in `AGENTS.md`; the project fills in the tool. Name the concern, not a product, to keep Groundwork technology-neutral.
- Core (`core/profile.json`) has only `schema`, `id`, `name`, `purpose` and `documents`. `PROJECT.md` and `AGENTS.md` ship in place, since every project starts with them; every other core document has a template in `core/templates/`.

Engineering standards are prose, so they live in the profile's README, not in the manifest.

## Onboarding reference

`onboarding.json`, next to `profile.json`, tells an AI agent how to help the developer fill in each document the profile owns: what the document is for, which sections can be completed on their own, the questions to ask for each, and when a section is done. `GROUNDWORK.md` describes how the agent uses it; `groundwork status` and `groundwork docs` show it. It is optional: a profile without one still works, and its documents show as having no onboarding definition.

```json
{
  "schema": 1,
  "questions": {
    "example_goal": {
      "ask": "The question, in plain language.",
      "why": "Optional: why it matters, in a sentence.",
      "explain": "Optional: a technical term explained before it is asked about.",
      "examples": ["Optional", "example answers"],
      "applies_when": "Optional: when the question is relevant at all.",
      "confirm": true
    }
  },
  "documents": {
    "docs/example/THING.md": {
      "purpose": "What the document is responsible for.",
      "stage": "design",
      "priority": 40,
      "depends_on": ["docs/product/PRD.md"],
      "skip": "What happens if the developer skips it.",
      "sections": [
        {
          "id": "goal",
          "heading": "Goal",
          "required": true,
          "questions": ["example_goal"],
          "uses": ["problem"],
          "done_when": "When the section is useful enough to call complete."
        }
      ]
    }
  },
  "needs": {
    "docs/architecture/SYSTEM_DESIGN.md": ["architecture"]
  },
  "extends": {
    "docs/architecture/SYSTEM_DESIGN.md": { "architecture": ["example_goal_2"] }
  }
}
```

- `documents` covers only documents this profile owns. Ownership, required or optional, and the `when` condition stay in `profile.json`; nothing is repeated here.
- `stage` sets when the agent raises a document: `discovery` (the first conversation: `PROJECT.md` and the PRD), `design` (before building the parts it covers), or `as-needed` (when the work reaches it). Within a stage, lower `priority` comes first, and a document waits for the documents it `depends_on`.
- `heading` anchors a section to a heading in the template (numbering and case are ignored), so progress survives edits elsewhere in the document. Sections are tracked separately: one can be complete while another is deferred or not applicable.
- Each question is asked in exactly one section, so every answer has one home. `uses` names questions asked elsewhere whose answers a section builds on; the agent refers to them instead of asking again. Question IDs are unique across all profiles.
- `confirm: true` marks questions whose answers must be confirmed by the developer before they count as settled: scope, security, privacy, money, permissions, architecture and integrations.
- `needs` names parts of core documents that only some projects have (sections marked `only_when_needed`). While the profile is active, those parts are required, and `groundwork add` includes them; other projects can add one when it applies (`groundwork add PATH#ID`).
- `extends` adds this profile's questions to sections of core documents the profile lists, while the profile is active. Application, for example, adds its offline question to the Architecture and interfaces part of `SYSTEM_DESIGN.md`. A part that appears only when needed can be extended only by a profile that needs it.

The checker verifies all of this: owned documents only, headings present in the template, each question asked once, `done_when` on every required section, `needs` and `extends` naming real sections, and no dependency cycles.

## Adding a profile

1. Ask whether the new kind of system needs *different documents or checks*, or just different content in existing ones. Only the first justifies a profile; the second belongs in your project's docs.
2. Copy an existing profile folder and rename it. Set `id` to the folder name.
3. Keep only the templates for concerns no core document covers. Use core documents by listing them; never copy them.
4. Write the README: purpose, where each concern lives, engineering standards, agent instructions, and how it composes with the other profiles.
5. Optionally, write `onboarding.json` so agents can guide the developer through the new documents (see the onboarding reference above).
6. List the new files in `.groundwork/manifest.json` and run `groundwork validate --strict`.

No change to core or to the scripts is needed. Delete the folder of any profile you are sure you won't use, and remove its files from `.groundwork/manifest.json`; keep `core/`.
