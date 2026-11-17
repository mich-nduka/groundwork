# 2. Domain & State Model

## Domain concepts
Agree on the important concepts, and use the same words for them everywhere.

## Entities and value objects
| Concept | Meaning | Identity / attributes |
|---|---|---|
| | | |

## Relationships
Describe who owns what, how things relate (one-to-many and so on — the cardinality), and how things are created, changed and retired.

## State model
What data does the system keep track of? For each piece, say who owns it and where the one copy that counts lives (the authoritative source).

## State transitions
How state moves from one value to another — the rules live in the behaviour document (`03-behaviour-and-business-rules.md`).

## Data structures and persistence
The shape of the data, how it's stored, how long it's kept, and how consistent it must be. Add detailed schemas separately only when they're genuinely useful.

## Modelling boundaries
Describe groupings such as aggregates or bounded contexts (DDD — Domain-Driven Design — vocabulary) only when they earn their place. DDD terms are optional.

## Glossary
Terms with precise meanings in this domain.
