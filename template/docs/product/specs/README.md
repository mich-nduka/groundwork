# Feature Specifications

Detailed specs for individual features or capabilities.

## Organisation

One directory per independently specifiable feature:

```text
specs/
├── README.md
├── _template/
│   └── SPEC.md
├── authentication/
│   └── SPEC.md
└── another-feature/
    └── SPEC.md
```

Use lowercase kebab-case (words separated by hyphens) for directory names. Each feature directory contains a `SPEC.md` — the authoritative spec for that feature. Add supporting documents only if the feature is complex enough to need them.

## Rules

1. Give each requirement a stable, unique ID, such as `AUTH-FR-001`, and name the PRD capability (`CAP-NNN`) it serves in the **Serves** column.
2. Write requirements that are clear and can be checked.
3. Keep everything specific to one feature in that feature's spec: behaviour, rules, data, workflows, edge cases and acceptance criteria.
4. Keep requirements that span several features in the root `../SPEC.md`.
5. Never copy a requirement into multiple documents — link to the one authoritative copy.
6. When you add, rename or retire a feature spec, update the index in `../SPEC.md`.
7. Link implementation and architecture decisions to the feature requirements where useful.

## Creating a feature specification

1. Copy `_template/SPEC.md` into a new directory named after the feature (kebab-case).
2. Replace the template content with the feature's real requirements.
3. Add the feature to the index in `../SPEC.md`.
4. Delete `_template/` when it's no longer needed.
