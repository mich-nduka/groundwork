# 7. UI & Interaction Mapping

> For systems with no user interface, mark this not applicable and describe the API or operational interface instead.
>
> This document owns what the UI does to the system. How the interface looks, feels and is structured visually is owned by `docs/design/DESIGN.md`.

## Interfaces and user roles
The applications and channels, who uses each, and what they're allowed to do.

## Information architecture
How content is organised: navigation, major sections, and what goes together. The structure itself is owned by `docs/design/DESIGN.md` §7 — record here only what the system must serve (routes, supplied content).

## User journeys
Product-level journeys live in `docs/product/PRD.md`. Map here the important user goals from entry point to completion, as the system supports them.

## Screen / view inventory
Screens as system surfaces: what each shows and what can be done on it. Screen names, entry points and access are owned by `docs/design/DESIGN.md` §7.5 — use the same screen names in both.

| Screen or view | User goal | Data shown | Actions |
|---|---|---|---|
| | | | |

## Interaction-to-system mapping
| User interaction | System operation | State read / changed | Requirement |
|---|---|---|---|
| | | | |

## UI states
The states every screen can be in are owned by `docs/design/DESIGN.md` §6.4. Map each state to system behaviour: what the system returns or does in each case.

## Accessibility and interaction constraints
Standards (contrast, focus, input modes, responsive behaviour) are owned by `docs/design/DESIGN.md` §6.7. Record here the system-side constraints: what the system must support for keyboard, assistive technology, localisation and input.

## Design references
Link to prototypes, or to `docs/design/DESIGN.md` if one exists.
