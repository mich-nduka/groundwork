# Application Profile

For interactive web, mobile and desktop applications with real product behaviour: people sign in, create and change data, and work through multi-step workflows. When it applies, which documents it adds and which checks it needs are declared in [profile.json](profile.json).

This profile adds almost no documents of its own, on purpose. The core already has the right homes for product requirements, feature specs and the system design. This profile adds the parts of `SYSTEM_DESIGN.md` an application needs and sets the standards for using them.

## Where each concern lives

| Concern | Lives in |
|---|---|
| Product requirements and capabilities | `docs/product/PRD.md` |
| Feature specifications — one per feature people use | `docs/product/specs/<feature>/SPEC.md` |
| Domain concepts and state | `docs/architecture/SYSTEM_DESIGN.md`, Domain and state |
| State transitions and rules | `docs/architecture/SYSTEM_DESIGN.md`, Behaviour and rules |
| Application architecture (client structure, state handling, integrations, offline use) | `docs/architecture/SYSTEM_DESIGN.md`, Architecture and interfaces |
| Interaction model: what each user action does to the system | `docs/architecture/SYSTEM_DESIGN.md`, UI and interaction mapping |
| How it looks and feels, UI states, accessibility standard | `docs/design/DESIGN.md` |
| Sync and on-device background work (optional) | `docs/architecture/SYSTEM_DESIGN.md`, Execution and resilience: add the part with `groundwork add docs/architecture/SYSTEM_DESIGN.md#execution` |
| Platforms the app runs on, and push notifications | `docs/architecture/SYSTEM_DESIGN.md`, Architecture and interfaces; Behaviour and rules |
| Device permissions | `docs/engineering/SECURITY.md`, Data protection |
| Devices and OS versions to test on | `docs/engineering/TEST_STRATEGY.md`, Test data and environments |
| Releasing installed clients: store review, supported versions, required updates (optional) | `docs/application/RELEASES.md` |

## Engineering standards

Defaults for the application. A project can override any of them with a requirement in `SPEC.md` or an accepted ADR.

- Every user-facing feature has a feature spec with acceptance criteria before it is built.
- Every screen handles all the UI states in `DESIGN.md` §6.4: loading, empty, error, offline and no permission, not only success.
- Each piece of state has one owner and one authoritative copy, recorded under Domain and state in `SYSTEM_DESIGN.md`. The client caches; it does not quietly become the source of truth.
- Check permissions on the server. Hiding a button is not access control.
- On phones, tablets and computers, ask for a device permission only when the feature that needs it is used, and keep the app usable when the person says no.
- Change the server before the client that depends on it, and keep the oldest supported version working until people have been moved off it (`RELEASES.md`).
- The critical journeys in the PRD have end-to-end tests.
- Meet the accessibility standard named in `DESIGN.md` §6.7.

## Agent instructions

- Before changing a feature, read its feature spec and its rows under UI and interaction mapping in `SYSTEM_DESIGN.md`.
- When you add a screen or a user action, add it under UI and interaction mapping in `SYSTEM_DESIGN.md` (system side) and `DESIGN.md` §7.5 (design side) with the same name.
- When you change state or rules, update Domain and state and Behaviour and rules together.
- If the project traces requirements into tests (see the code standards in `AGENTS.md`), name the requirement IDs a test verifies in the test itself.

## Composing with other profiles

- **With Backend/API:** Application owns the client and the user's view of behaviour; Backend/API owns the services, their data and how they run. `SYSTEM_DESIGN.md` has one copy of each part: describe both sides in it, client and services as separate components.
- **With Content site:** see the Content site profile — draw the boundary between public pages and the product in `docs/content-site/CONTENT.md`.
- **Without Backend/API:** if the app relies on a hosted backend used as-is, describe it as an integration under Architecture and interfaces in `SYSTEM_DESIGN.md`.
