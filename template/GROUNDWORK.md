# Groundwork

How AI coding agents help document this project. `AGENTS.md` sends every agent here. The developer controls this file: change the preferences to suit how you work. The agent does the documentation work; the developer gives direction, makes the decisions and stays in control.

Commands below are written `groundwork <command>`. Where that command isn't installed, run `python3 scripts/groundwork.py <command>` (on Windows, `py -3 scripts/groundwork.py <command>`). It behaves the same; `groundwork profiles` is `list` there, and `groundwork validate` is `python3 scripts/check_docs.py`.

## Preferences

- Autonomy: balanced

Autonomy is one of `guided`, `balanced` or `autonomous`:

| Level | The agent |
|---|---|
| guided | Asks before creating or changing any documentation, explains each proposal, and has every significant interpretation approved. |
| balanced | Drafts documentation from confirmed information, fills in straightforward details, asks before important decisions, and flags its assumptions. |
| autonomous | Keeps documentation current without being asked, makes low-risk improvements, fixes simple inconsistencies, and reports what it changed. |

At every level, the developer approves consequential decisions: product scope, security, privacy, data handling, money, permissions, architecture and outside integrations. No level permits deleting files, changing security settings or acting outside the repository without being asked.

### Documentation
- Keep documentation concise and practical.
- Don't document implementation details before they are decided.
- Don't create an optional document without explaining why it is needed.

### Conversation
- Ask one question, or a small group of related ones, at a time.
- Explain unfamiliar technical terms in plain language before asking about them.
- Don't ask for anything the repository or earlier answers already say.

### Project-specific instructions
Add your own here. They override the defaults in this file.

-

## How the agent works

### 1. At the start of a session

Run `groundwork status`. It reads `.groundwork/state.json` and the documents, and reports where discovery stands, what needs confirming, and the next thing to ask.

- **Discovery not started:** offer to start, briefly, without blocking what the developer asked for. Say in a sentence what you can see (the kind of system, and that its documents are still to be written), then begin with the questions `status` gives. If the project's description is already recorded, play it back and ask whether it's right, rather than asking what they're building. If they would rather get on with coding, run `groundwork mark discovery declined --note "<their words>"` and don't offer again.
- **Discovery in progress:** in a sentence or two, say what's done and what's next, and ask whether to continue or work on something else.
- **Discovery complete or declined:** don't interrupt. Do what the developer asks, and raise documentation only when the task touches it (see 6).

Never restart the interview. Never ask again what `status` shows as answered or confirmed.

### 2. Conducting discovery

- Start with the project, not the documents. Talk about what they're building, not Groundwork's files, sections or states; the developer doesn't need to know any of them.
- Follow `status`: it names the document, the section and the questions still to ask, in a sensible order. `groundwork docs PATH` shows a whole document, and `groundwork docs` lists them all.
- Ask in your own words, following on from the answers so far. The question text is a starting point, not a script. Use its *why* when the reason isn't obvious, its *explain* for technical terms, and its *examples* to help the developer put things into words, always leaving room for a different answer.
- If the developer has a brief, notes or existing documents, read them first, record what they answer, and ask only what's left.
- Help separate the problem from a proposed solution. Never invent features, requirements or technology choices.
- Match the developer's experience: let experts answer directly; explain the concept and the trade-off for everyone else.
- Don't push technical decisions before the requirements justify them. "Not decided yet" is a valid answer.
- Never ask for secrets, passwords, API keys or real personal data.

### 3. Recording progress

Record each outcome with `groundwork mark` as soon as it happens, so the next session picks up where this one stopped. Several targets can share one command.

| What happened | Record |
|---|---|
| The developer answered | `groundwork mark <question> answered` |
| They reviewed and agreed to your summary or draft | `groundwork mark <question> confirmed` |
| You inferred something they didn't say | `groundwork mark <question> assumed --note "<the assumption>"` |
| "Skip this" | `groundwork mark <question> skipped` |
| "That doesn't apply to us" | `groundwork mark <question> not_applicable` |
| "I don't know yet" | `groundwork mark <question> unknown` |
| "Let's decide later" | `groundwork mark <question> deferred --note "<when>"` |
| "That depends on something else" | `groundwork mark <question> blocked --note "<what>"` |

The same states apply to a section (`PATH#section`). A whole document (`PATH`) can be skipped, deferred, not_applicable, unknown or blocked. These states are not interchangeable: skipped is not not-applicable, unknown is not skipped, deferred is not done, and assumed is not approved.

Questions flagged *needs explicit confirmation* are not settled until the developer confirms them. `answered` alone leaves them waiting. A confirmed item can be reopened only with `--reopen`, when the developer asks to revisit it.

The state file records progress only. Answers belong in the documents.

### 4. Writing documents

- Read the document first. Keep its headings, its structure and anything already written. Change only the sections you're working on.
- Write each answer once, in its authoritative document (the section that asks the question), and refer to it elsewhere instead of copying it. A section's *uses* list names answers from elsewhere to build on.
- Turn answers into documentation, not a transcript: concise statements, consistent names, testable requirements with stable IDs, and decisions kept separate from suggestions.
- Put unresolved points in the document's open questions. Never fill a gap with invented detail to make a section look complete.
- Before writing an important document (the PRD, the specification, architecture, security or AI safety), show a short summary of what you'll record. Let the developer approve, edit, reject or defer it. How much else needs approval follows the autonomy level. Formatting changes never do.
- After writing a section, mark it `answered`, or `confirmed` once the developer has reviewed it. `status` flags any section whose text changed without being marked, so someone reviews it.

### 5. Optional documents and profiles

- An optional document is created only when its condition holds (`groundwork status` lists each one with its condition). Explain why it now applies, ask when you're not sure, then run `groundwork add PATH`. If it doesn't apply, run `groundwork mark PATH not_applicable` so it isn't raised again. Don't create a file just to record that.
- When the system takes on a new kind of responsibility, such as its first AI feature or an API other teams depend on, explain which profile fits and why, and recommend it. Run `groundwork init <profiles>` only after the developer agrees. Technology alone, such as an SDK in a dependency list, never justifies a profile.

### 6. While building

- **New feature:** check the PRD and any feature spec in `docs/product/specs/`, ask only what's needed to clarify it, update the authoritative documents, and keep IDs traceable from capability to requirement to test. Write a feature spec for a substantial feature, not for every change.
- **Architecture change:** name the design documents it affects, explain the impact, propose an ADR (`docs/architecture/adr/`) when the decision is costly to reverse, and get approval before treating it as decided.
- **During implementation:** when the work reveals a missing requirement, a wrong assumption, a new integration, a new data flow or a new risk, propose the documentation update instead of letting documents go stale.
- **After significant work:** check that the documents it touched still match the code. Don't review all the documentation after every small change, and don't interrupt unrelated work with onboarding.

### 7. Safety

- The documents are the source of truth. When the state and a document disagree, trust the document and update the state. If the state file is damaged, `groundwork mark --repair` rebuilds it, keeping every valid entry and a copy of the old file.
- Never overwrite, delete or rewrite a document wholesale without the developer's approval. Respect their manual edits.
- Never present your own assumptions as approved decisions.
- `groundwork validate` checks structure only. Unfinished, skipped or deferred documentation never makes it fail.
