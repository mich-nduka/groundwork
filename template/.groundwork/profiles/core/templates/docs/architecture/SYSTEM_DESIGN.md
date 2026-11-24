# System Design

The architecture of the system, in one document. Each part below is a different view of the same system, not a step to finish in order. The document holds only the parts the project's profiles need; `groundwork docs docs/architecture/SYSTEM_DESIGN.md` lists them. Purpose, users and scope are in `docs/product/PRD.md`: refer to them, don't repeat them. When one part grows past a few screens, move its detail to its own file next to this one, and keep the part's heading here with a short summary and a link.

## Status
- Status: Draft / In Review / Approved / Superseded
- Owner:
- Last reviewed:

## Summary
The system's structure, its biggest choices, and the constraints behind them. While the system is small, this may be all the design there is.

## Context
Who and what the system deals with, and where it stops.

| Actor or external system | What it needs or provides | How it connects |
|---|---|---|
| | | |

Add a context diagram when it makes the boundaries easier to see.

## Domain and state
The important concepts, named the same way everywhere, and the data the system keeps:

| Concept | Meaning | Owned by / authoritative copy | Lifecycle |
|---|---|---|---|
| | | | |

How the data is stored, how long it's kept, and how consistent it must be. Detailed schemas belong elsewhere, and only when they're genuinely useful.

## Behaviour and rules
What changes state, and what must always hold:

| Operation or trigger | Actor | Conditions | Result / next state |
|---|---|---|---|
| | | | |

- Invariants: what must stay true even when things happen at once or part of the system fails.
- Business rules: list by ID the rules from `docs/product/SPEC.md` (or a feature spec) that shape this behaviour.
- Validation: which inputs are accepted, which are rejected, and the hard limits.
- Notifications: what triggers each message sent to people (email, push), and how they choose which they get.

## Architecture and interfaces
The overall approach, and why it fits the requirements and constraints. For an application, the platforms it runs on (browsers, iOS, Android, desktop) and what is shared between them.

| Component | Responsibility | Owns state? | Talks to |
|---|---|---|---|
| | | | |

- Communication: direct calls, queued messages, events or shared storage, and where the trust boundaries sit.
- Interfaces: who consumes each one and how compatible it must stay. A surface with several consumers or versioning needs gets a contract document in `docs/architecture/contracts/`.
- Integrations: what data crosses, how it authenticates, and what happens when the other side fails.
- Technology choices: the ones that matter; costly-to-reverse ones get an ADR.

## Execution and resilience
What actually runs (processes, workers, jobs), what can fail, and how the system recovers:

| Failure | Effect | Detection | Response / recovery |
|---|---|---|---|
| | | | |

Note where operations must be all-or-nothing, where retries are safe (an idempotent operation gives the same result run once or twice), and how background work is delivered.

## Operations and scaling
Who runs the system day to day, the environments, and how releases and configuration work.

- Observability: logs (no sensitive data), metrics, traces where worth it, and the alerts someone acts on.
- Capacity: expected load, the targets that matter, and where bottlenecks will show first.
- Scaling: the least complex way to meet demand, and the operational risks (cost, lock-in, recovery time).

## UI and interaction mapping
What each user action does to the system. How the interface looks and is structured lives in `docs/design/DESIGN.md`; use the same screen names in both.

| Screen or view | User action | System operation | State read / changed | Requirement |
|---|---|---|---|---|
| | | | | |

For each UI state in `DESIGN.md` (empty, loading, error, offline), what the system returns or does.

## Cross-cutting concerns
The concerns that touch several parts: security, privacy, accessibility, performance, compliance. Split them into separate documents only when the depth justifies it.

## Key decisions
Link to the matching ADRs in `adr/`: short records of important decisions, what was chosen and why.

## Open questions and risks
| Item | Impact | Owner | Next action |
|---|---|---|---|
| | | | |
