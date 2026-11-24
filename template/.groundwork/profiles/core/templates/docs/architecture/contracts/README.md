# Contracts (Optional)

Detailed API and event contracts — created only when the complexity justifies them: multiple consumers, versioning needs, or external teams. For simple interfaces, the summary under Architecture and interfaces in `docs/architecture/SYSTEM_DESIGN.md` is enough.

- `api-<name>.md` — one per interface: operations, request and response shapes, errors, versioning and compatibility rules.
- `events-<stream>.md` — one per stream: event names, payloads, delivery guarantees and ordering.

Rules:
- Link every contract from Architecture and interfaces in `docs/architecture/SYSTEM_DESIGN.md`.
- State compatibility expectations in the contract itself.
- Record breaking changes in an ADR.
