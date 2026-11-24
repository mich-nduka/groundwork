# Repository Structure

Pick the layout that matches how the code is owned, deployed and released — not what's fashionable.

## Single application
```text
repo/
├── docs/
├── src/
├── tests/
├── scripts/
└── config/
```

## Modular monorepo
```text
repo/
├── apps/
│   ├── web/       # optional
│   ├── mobile/    # optional
│   ├── api/       # optional
│   └── worker/    # optional
├── packages/      # only when shared code is justified
├── docs/
└── infrastructure/ # optional
```

## Multiple repositories
```text
workspace/
├── project-docs/
├── client-app/
├── api-service/       # optional
└── infrastructure/    # optional
```

Ask: do parts need to deploy, ship or be owned separately? Do they need different permissions? Is the shared code big enough to justify `packages/`? Can the team carry the extra tooling and CI complexity? Start with the simplest layout that handles the real constraints.
