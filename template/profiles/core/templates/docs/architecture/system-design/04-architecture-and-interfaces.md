# 4. Architecture & Interfaces

## Architectural approach
The overall style, and why it fits the requirements and constraints.

## Components and responsibilities
| Component | Responsibility | Owns state? | Depends on |
|---|---|---|---|
| | | | |

## Boundaries and dependency direction
Where trust, deployment and module boundaries sit, and which dependencies are allowed across them.

## Communication
How parts talk to each other: direct calls, queued messages, events, or shared storage.

## Interfaces and contracts
List the interfaces, who consumes them, their inputs and outputs, and how compatible they must stay. When a surface is substantial — multiple consumers, versioning needs, external teams — add a contract document under `docs/architecture/contracts/` and link it here.

## Integrations
External services: what data crosses, how you authenticate, and what you assume about them when they fail.

## Technology choices
Record the choices that matter; put the consequential ones in ADRs, together with the alternatives you rejected.

## Diagrams
Add component, sequence or deployment diagrams where they remove ambiguity.
