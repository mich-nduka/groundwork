# System Specification

Testable requirements for the whole system — what it must do, and how well.

## 1. Purpose

What this specification covers, and how it relates to the product requirements (PRD).

Requirement IDs follow `{SCOPE}-{TYPE}-NNN`. `SCOPE` is `SYS` for requirements that apply to the whole system, or a short feature code (like `AUTH`) in a feature spec. `TYPE` is `FR` (functional requirement — something the system must do), `NFR` (non-functional requirement — a quality goal like speed or uptime) or `BR` (business rule). Examples: `SYS-FR-001`, `AUTH-BR-002`.

Capabilities in the PRD have IDs in the form `CAP-NNN`. Every requirement names, in its **Serves** column, the PRD capability it contributes to — that is the first link in the traceability chain.

## 2. System Scope

The capabilities this specification covers. Product scope — what gets built, and what doesn't — lives in `PRD.md`; this section only bounds which requirements belong here.

## 3. System Context

Who and what surrounds the system: external users, other systems, and the environment it runs in.

## 4. System-Wide Functional Requirements

Requirements that apply across the whole system, not just one feature. Feature-specific requirements belong in that feature's spec under `specs/`.

| ID | Serves | Requirement | Priority | Verification |
|---|---|---|---|---|
| SYS-FR-001 | [CAP-NNN] | [Requirement] | [Must/Should/Could] | [How it will be verified] |

## 5. Non-Functional Requirements

Measurable quality goals: performance, availability, accessibility, reliability, maintainability and similar.

| ID | Serves | Quality Attribute | Requirement | Verification |
|---|---|---|---|---|
| SYS-NFR-001 | [CAP-NNN] | [Attribute] | [Measurable requirement] | [How it will be verified] |

## 6. System Constraints

System-wide limits: legal, operational, platform, compatibility and technical constraints.

## 7. Global Business Rules

Rules that apply across multiple features — things that must always or never happen. Feature-specific rules belong in that feature's spec.

## 8. Global Acceptance Criteria

Acceptance criteria are the checkable conditions for saying "this is done". These apply to the system as a whole, before release.

## 9. Feature Specification Index

Links to every feature spec. Keep this list in sync with the contents of `specs/` — `scripts/check_docs.py` verifies it.

| Feature | Specification | Status |
|---|---|---|
| [Feature name] | [specs/feature-name/SPEC.md](specs/feature-name/SPEC.md) | [Draft/In Review/Approved] |

## 10. Open Questions

System-level questions that are still unresolved. Feature-specific questions stay in that feature's spec.

## 11. References

Links to the PRD, architecture docs, relevant ADRs and other authoritative project documents.
