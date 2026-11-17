# Backend/API Profile

For backend services, APIs, workers, distributed systems and integrations. When it applies, which documents it adds and which checks it needs are declared in [profile.json](profile.json).

## Where each concern lives

| Concern | Lives in |
|---|---|
| Domain model: concepts, ownership, state | `docs/architecture/system-design/02-domain-and-state-model.md` |
| Rules and invariants | `docs/architecture/system-design/03-behaviour-and-business-rules.md`, with the ID'd rules in `SPEC.md` and feature specs |
| Components, boundaries, interface summary | `docs/architecture/system-design/04-architecture-and-interfaces.md` |
| Detailed API and event contracts (optional) | `docs/architecture/contracts/` |
| Concurrency, failure, retries, recovery | `docs/architecture/system-design/05-execution-and-resilience.md` |
| Deployment, observability, capacity | `docs/architecture/system-design/06-operations-and-scalability.md` |
| Data stores, migrations, backups, retention (optional) | `docs/backend-api/DATA.md` |
| Access control, secrets, data protection | `docs/engineering/SECURITY.md` |

## Engineering standards

Defaults for the services. A project can override any of them with a requirement in `SPEC.md` or an accepted ADR.

- Check every input at the service boundary, and return errors in one documented shape.
- Every operation a client may retry is idempotent (safe to run twice), or the contract says it is not.
- Every outgoing call has a timeout. Retries back off and have a limit.
- Public interfaces change compatibly: add, don't remove or rename. Breaking changes need a new version and an ADR.
- Schema migrations can be applied without downtime and can be undone, or the plan says why not.
- Logs are structured and leave out secrets and personal data. Each request can be traced across components.
- Each service has a health check and the alerts listed in `06-operations-and-scalability.md`.

## Agent instructions

- Before changing an interface, read its section in `04-architecture-and-interfaces.md` and its contract, if there is one. Check who consumes it.
- When you change stored data, update `02-domain-and-state-model.md` and, if it exists, `DATA.md`, and write the migration plan in the change's plan.
- When you add a dependency on another service, add its failure row to `05-execution-and-resilience.md`.
- Treat a missing timeout, an unbounded retry or an unchecked input as a bug.

## Composing with other profiles

- **With Application:** see the Application profile — one copy of the shared design documents, with client and services as separate components.
- **With AI Systems:** model calls are outgoing integrations. They follow this profile's rules on timeouts, retries and failure, plus the AI-specific rules in `docs/ai-systems/`.
