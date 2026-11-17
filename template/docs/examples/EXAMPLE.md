# Worked Example

A minimal, fictional example of the Groundwork paper trail, for a tiny product: **Linkbag**, an app that saves links behind a sign-in. This file is an example only — you can delete the whole `docs/examples/` directory from your project.

The chain it shows: capability → requirement → design → test.

## 0. Profiles (`PROJECT.md`)

- Profiles: application
- Why: people sign in and manage their own saved links, so it is an Application. Its server only stores links for this one client, using a hosted database as-is, so Backend/API would add documents nobody needs yet. It gets added when a second client or a public API appears.

## 1. PRD capability (`docs/product/PRD.md`)

| ID | What it does | Why users care | Priority |
|---|---|---|---|
| CAP-001 | Save a link with one click | Finding things again is the point of the app | Must |

## 2. System requirement (`docs/product/SPEC.md` §4)

| ID | Serves | Requirement | Priority | Verification |
|---|---|---|---|---|
| SYS-FR-001 | CAP-001 | The system stores a link with its URL and title. | Must | Feature-spec tests |

## 3. Feature spec (`docs/product/specs/sign-in/SPEC.md`, prefix `AUTH`)

| ID | Serves | Requirement | Priority | Verification |
|---|---|---|---|---|
| AUTH-FR-001 | CAP-001 | A signed-in user can save a link; a signed-out request is rejected. | Must | Unit test |

| ID | Serves | Rule | Expected system behaviour |
|---|---|---|---|
| AUTH-BR-001 | CAP-001 | A saved link belongs to exactly one account. | Link queries filter by the signed-in account |

## 4. ADR (`docs/architecture/adr/0001-sign-in.md`)

- Status: Accepted
- Related requirements: AUTH-FR-001
- Decision: sign-in is email and password; no social login yet.
- Consequence: one account model to maintain, no third-party dependency.

## 5. Design (`docs/architecture/system-design/07-ui-and-interaction-mapping.md`)

| User interaction | System operation | State read / changed | Requirement |
|---|---|---|---|
| Press "Save link" | Create link record | One row added to the account's links | SYS-FR-001, AUTH-FR-001 |

## 6. Test (`tests/`)

`test_sign_in.py::test_wrong_password_rejected` — its docstring says "verifies AUTH-FR-001", so requirement coverage stays searchable in any language.

## The chain

| From | To |
|---|---|
| CAP-001 | served by SYS-FR-001, AUTH-FR-001, AUTH-BR-001 |
| AUTH-FR-001 | shaped the ADR, the design row and the test |
