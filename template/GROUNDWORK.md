# Groundwork

How AI coding agents help document this project. `AGENTS.md` sends every agent here. The developer controls this file: change the preferences to suit how you work. The agent does the documentation work; the developer gives direction, makes the decisions and stays in control.

Commands are written `groundwork <command>`. Where that isn't installed, run `node .groundwork/scripts/groundwork.mjs <command>` (Node.js 18 or newer); it behaves the same.

The project starts lean: `PROJECT.md`, `AGENTS.md`, this file and a README. Every other document is created from its template once the developer has given you something to put in it. Groundwork's own files live in `.groundwork/`; the developer never needs to open them.

## Preferences

- Autonomy: balanced

Autonomy is one of `guided`, `balanced` or `autonomous`:

| Level | The agent |
|---|---|
| guided | Asks before creating or changing any documentation, explains each proposal, and has every significant interpretation approved. |
| balanced | Drafts documentation from confirmed information, fills in straightforward details, asks before important decisions, and flags its assumptions. |
| autonomous | Keeps documentation current without being asked, makes low-risk improvements, fixes simple inconsistencies, and reports what it changed. |

At every level, the developer approves consequential decisions: product scope, security, privacy, data handling, money, permissions, architecture and outside integrations. No level permits deleting files, changing security settings or acting outside the repository without being asked.

- Keep documentation concise and practical. Don't document implementation details before they are decided.
- Ask one question, or a small group of related ones, at a time. Explain unfamiliar terms in plain language before asking about them. Don't ask for anything the repository or earlier answers already say.

### Project-specific instructions
Add your own here. They override the defaults in this file.

-

## How the agent works

### 1. At the start of a session

Run `groundwork status`. It reports where discovery stands, what needs confirming, and the next thing to ask.

- **Discovery not started:** offer it in a sentence, without blocking what the developer asked for, then begin with the questions `status` gives. If the project's description is already recorded, play it back and ask whether it's right. If they would rather get on with coding, run `groundwork mark discovery declined --note "<their words>"` and don't offer again.
- **Discovery in progress:** say briefly what's done and what's next, and ask whether to continue or work on something else.
- **Discovery complete or declined:** don't interrupt. Raise documentation only when the task touches it (see 5).

Never restart the interview, and never ask again what `status` shows as answered or confirmed.

### 2. Conducting discovery

- Talk about what they're building, not about Groundwork's files, sections or states.
- Follow `status`: it names the document, the section and the questions still to ask, in order, including for documents that don't exist yet. `groundwork docs` lists the documents; `groundwork docs PATH` shows one.
- Cover the project and the product first. Once you understand what the system does, recommend profiles (see 4). Architecture and design come after that.
- Ask in your own words. The question text is a starting point: use its *why*, *explain* and *examples* when they help, and leave room for a different answer.
- If the developer has a brief, notes or existing documents, read them first, record what they answer, and ask only what's left.
- Separate the problem from proposed solutions. Never invent features, requirements or technology choices, and don't push technical decisions before the requirements justify them. "Not decided yet" is a valid answer.
- Never ask for secrets, passwords, API keys or real personal data.

### 3. Recording progress and writing documents

Record each outcome with `groundwork mark` as soon as it happens, so the next session picks up where this one stopped. Several targets can share one command.

| What happened | Record |
|---|---|
| The developer answered | `groundwork mark <question> answered` |
| They reviewed and agreed to your summary or draft | `groundwork mark <question> confirmed` |
| You inferred something they didn't say | `groundwork mark <question> assumed --note "<the assumption>"` |
| "That doesn't apply to us" | `groundwork mark <question> not_applicable` |
| Anything not settled yet: "skip it", "I don't know yet", "later", "it depends on X" | `groundwork mark <question> deferred --note "<why, or what it waits for>"` |

The same states apply to a section (`PATH#section`). A whole document (`PATH`) can be `deferred` or `not_applicable`. Deferred is not done, and assumed is not approved. Questions flagged *needs explicit confirmation* stay open until the developer confirms them; a confirmed item is reopened only with `--reopen`, when the developer asks.

The state file records progress only. Answers belong in the documents:

- **Create a document only when you're about to write answers into it:** `groundwork add PATH` copies its template into place. A document holds only the parts the active profiles need; `groundwork add PATH#SECTION` adds another part from the template when it applies.
- Keep the document's headings and anything already written. Change only the sections you're working on, and delete template guidance once real content replaces it.
- Write each answer once, in the section that asks the question, and refer to it elsewhere. A section's *uses* list names answers from elsewhere to build on.
- Write documentation, not a transcript: concise statements, consistent names, testable requirements with stable IDs. Put unresolved points in the document's open questions rather than inventing detail.
- Before writing an important document (the PRD, the specification, architecture, security or AI safety), show a short summary of what you'll record and let the developer approve, edit or defer it.
- After writing a section, mark it `answered`, or `confirmed` once reviewed. `status` flags text that changed without being marked, so someone reviews it.

### 4. Profiles and optional documents

- Profiles are chosen once discovery shows what the system does. Explain which fit and why, one sentence each (`.groundwork/profiles/README.md` has the guidance), and after the developer agrees run `groundwork init <profiles> --why "<the reason, in a sentence>"` (or `init none`). It records the choice in `PROJECT.md` and adds the profiles' checks to `AGENTS.md`; it creates no documents.
- An optional document is created only when its condition holds (`groundwork status` lists each with its condition). Explain why it applies, then run `groundwork add PATH`. If it doesn't apply, `groundwork mark PATH not_applicable` stops it being raised.
- When the system takes on a new kind of responsibility, such as its first AI feature or an API other teams depend on, recommend the profile that fits. Technology alone, such as an SDK in a dependency list, never justifies a profile.

### 5. While building

- **New feature:** check the PRD and any feature spec, ask only what's needed, update the authoritative documents, and link each requirement to the capability it serves. Name requirement IDs in tests only if the code standards in `AGENTS.md` say so. A substantial feature gets a feature spec: copy `.groundwork/blueprints/feature-spec.md` to `docs/product/specs/<feature>/SPEC.md` and add it to the index in `SPEC.md`.
- **Architecture change:** name the design sections it affects, explain the impact, and propose an ADR when the decision is costly to reverse (copy `.groundwork/blueprints/adr.md` to `docs/architecture/adr/NNNN-short-title.md`). Get approval before treating it as decided.
- **During and after the work:** when it reveals a missing requirement, a wrong assumption, a new integration or a new risk, propose the documentation update. Check that the documents it touched still match the code, without reviewing everything after every small change.
- **When the project status changes:** keep `- Status:` in `PROJECT.md` current. From Development on, `groundwork validate` warns about required documents nobody has written or deferred; from Production on, about every one of them. Write them, or defer them with the reason.

### 6. Safety

- The documents are the source of truth. When the state and a document disagree, trust the document and update the state. `groundwork mark --repair` rebuilds a damaged state file, keeping every valid entry and a copy of the old file.
- Never overwrite, delete or rewrite a document wholesale without the developer's approval. Respect their manual edits.
- Never present your own assumptions as approved decisions.
- `groundwork validate` checks structure. Unfinished or deferred documentation never makes it fail; only `--strict` turns its warnings into failures.
