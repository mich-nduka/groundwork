# Application Profile

For interactive web, mobile and desktop applications with real product behaviour: people sign in, create and change data, and work through multi-step workflows. When it applies, which documents it adds and which checks it needs are declared in [profile.json](profile.json).

This profile adds almost no documents of its own, on purpose. The core already has the right homes for product requirements, feature specs and the seven-part system design. This profile turns on the parts an application needs and sets the standards for using them.

## Where each concern lives

| Concern | Lives in |
|---|---|
| Product requirements and capabilities | `docs/product/PRD.md` |
| Feature specifications — one per feature people use | `docs/product/specs/<feature>/SPEC.md` |
| Domain concepts and state | `docs/architecture/system-design/02-domain-and-state-model.md` |
| State transitions and rules | `docs/architecture/system-design/03-behaviour-and-business-rules.md` |
| Application architecture (client structure, state handling, integrations) | `docs/architecture/system-design/04-architecture-and-interfaces.md` |
| Interaction model: what each user action does to the system | `docs/architecture/system-design/07-ui-and-interaction-mapping.md` |
| How it looks and feels, UI states, accessibility standard | `docs/design/DESIGN.md` |
| Offline use, sync, on-device background work (optional) | `docs/architecture/system-design/05-execution-and-resilience.md` |
| Releasing installed clients (optional) | `docs/application/RELEASES.md` |

## Engineering standards

Defaults for the application. A project can override any of them with a requirement in `SPEC.md` or an accepted ADR.

- Every user-facing feature has a feature spec with acceptance criteria before it is built.
- Every screen handles all the UI states in `DESIGN.md` §6.4: loading, empty, error, offline and no permission, not only success.
- Each piece of state has one owner and one authoritative copy, recorded in `02-domain-and-state-model.md`. The client caches; it does not quietly become the source of truth.
- Check permissions on the server. Hiding a button is not access control.
- The critical journeys in the PRD have end-to-end tests.
- Meet the accessibility standard named in `DESIGN.md` §6.7.

## Agent instructions

- Before changing a feature, read its feature spec and the rows for it in `07-ui-and-interaction-mapping.md`.
- When you add a screen or a user action, add it to `07-ui-and-interaction-mapping.md` (system side) and `DESIGN.md` §7.5 (design side) with the same name.
- When you change state or rules, update `02` and `03` together.
- Name the requirement IDs a test verifies in the test itself.

## Composing with other profiles

- **With Backend/API:** Application owns the client and the user's view of behaviour; Backend/API owns the services, their data and how they run. Shared documents (`01`–`04`) have one copy: describe both sides in it, client and services as separate components.
- **With Web:** see the Web profile — draw the boundary between public pages and the product in `docs/web/CONTENT.md`.
- **Without Backend/API:** if the app relies on a hosted backend used as-is, describe it as an integration in `04-architecture-and-interfaces.md`.
