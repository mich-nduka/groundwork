# System Design

> The architecture starting point and index. Detailed design lives in `system-design/`.

## Status
- Status: Draft / In Review / Approved / Superseded
- Owner:
- Last reviewed:

## Summary
The system's structure, its biggest choices, and the constraints behind them.

## Context and high-level view
Add a context or container diagram when it helps.

## Seven-part system design
The seven parts are described in [system-design/README.md](./system-design/README.md). A project has only the parts its profiles need (see `PROJECT.md`), and the parts it has live in `system-design/`. Until a part exists, record what matters about it here, in the summary. Add a part when the work needs it: `python3 scripts/groundwork.py add docs/architecture/system-design/<part>.md`.

## Cross-cutting concerns
The concerns that touch several parts of the system: security, privacy, accessibility, performance, compliance. Split them into separate documents only when the depth justifies it.

## Key decisions
Link to the matching ADRs in `adr/` — short records of important decisions: what was chosen and why.

## Open questions and risks
| Item | Impact | Owner | Next action |
|---|---|---|---|
| | | | |

The seven parts are different views of the same system — not steps to finish in order. When a change touches state, behaviour, boundaries, runtime or UI, update every affected section together. Each numbered document owns its topic; this file owns the summary, the cross-cutting concerns and the decision index.
