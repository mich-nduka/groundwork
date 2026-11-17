# Feature Specification: [Feature Name]

**Status:** Draft
**Requirement ID prefix:** [PREFIX]
**Owner:** [Person or team]
**Last updated:** [YYYY-MM-DD]

## 1. Overview

Describe the feature in a few sentences: what it is and what it lets people do.

## 2. Objectives

What outcomes this feature must deliver. Name the PRD capabilities (`CAP-NNN`) it serves where you can.

## 3. Actors and Permissions

Who and what interacts with this feature — users, roles, external systems, automated jobs — and what each one is allowed to do.

## 4. Preconditions

What must already be true before this feature (or a specific workflow) can be used.

## 5. Functional Requirements

Write each requirement as a clear statement that can be checked on its own.

| ID | Serves | Requirement | Priority | Verification |
|---|---|---|---|---|
| [PREFIX]-FR-001 | [CAP-NNN] | The system shall [observable behaviour]. | [Must/Should/Could] | [Test or other verification] |

## 6. Business Rules and Invariants

Rules that must always hold: domain rules, validation, limits, calculations. An invariant is something that stays true no matter what happens.

| ID | Serves | Rule | Expected system behaviour |
|---|---|---|---|
| [PREFIX]-BR-001 | [CAP-NNN] | [Rule] | [Enforcement or outcome] |

## 7. Data Requirements

The information the feature receives, keeps, exposes or retains. Name the important fields, relationships, validation and lifecycle rules — describe the data, not a database schema, unless one is truly needed.

## 8. Behaviour and Workflows

The main workflows: what triggers them, how state changes, and what results users see. Use diagrams or tables where they make things clearer.

## 9. Edge Cases and Failure States

Bad input, unavailable dependencies, conflicting actions, retries, timeouts, partial completion — whatever can go wrong, and what should happen then.

| Scenario | Expected behaviour |
|---|---|
| [Condition] | [Required system response] |

## 10. Acceptance Criteria

The observable conditions that prove the feature is done. Given/When/Then (a standard format for acceptance tests) helps where it fits:

- **Given** [starting situation]
- **When** [action or event]
- **Then** [observable result]

## 11. Dependencies and Interfaces

What this feature relies on: other features, external systems, shared capabilities. Link to their specs and interface contracts.

## 12. Out of Scope

Related behaviour this spec deliberately does not cover — say so explicitly.

## 13. Open Questions

Unresolved requirements, assumptions to validate, and decisions still to make.

## 14. References

Links to PRD capabilities (`CAP-NNN`), system-wide requirements, architecture docs, ADRs, designs and related feature specs.
