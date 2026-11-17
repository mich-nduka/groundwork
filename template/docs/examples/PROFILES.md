# Profile Examples

Fictional examples of choosing and combining profiles. Profiles are always recorded in alphabetical order, whatever order you give them. Each one shows the `PROJECT.md` lines, the reasoning, and what `python3 scripts/groundwork.py init` creates. Delete this file whenever you like.

Core documents (`PRD.md`, `SPEC.md`, `SYSTEM_DESIGN.md`, `SECURITY.md`, `TEST_STRATEGY.md`, ADRs, plans) are present in every example and aren't repeated below.

## 1. Company landing page → Web

```text
- Profiles: web
- Why: it publishes content for prospective customers and must be found in search. No sign-in, no data of its own; the contact form posts to a hosted form service.
```

Creates `docs/web/CONTENT.md`, `docs/web/SEO.md` and `docs/design/DESIGN.md`, and adds tooling rows for Accessibility, Performance budget, and Links and metadata. There are no system-design parts: the hosting and form service fit in the `SYSTEM_DESIGN.md` summary.

Left out: Backend/API, because the form service is used as-is and the project owns no server logic.

## 2. Online shop → Application + Backend/API

```text
- Profiles: application, backend-api
- Why: shoppers sign in, manage baskets and place orders (Application). The order, stock and payment services are ours, and their failures cost money (Backend/API).
```

Creates system-design parts 01–07 and `docs/design/DESIGN.md`. Parts 01–04 are required by both profiles and are created once: each describes the storefront and the services as separate components. Tooling rows: End-to-end, Accessibility, Integration tests, API compatibility.

Optional documents to add later: `docs/backend-api/DATA.md` when stock moves to its own store, and `docs/architecture/contracts/README.md` when a warehouse partner starts calling the API.

Left out: Web, unless the shop also runs a content-heavy editorial site. If it does, add Web and record the boundary between the pages and the app in `docs/web/CONTENT.md`.

## 3. AI-powered SaaS → Application + Backend/API + AI Systems

```text
- Profiles: ai-systems, application, backend-api
- Why: teams work in the product every day (Application); our services own their data and run model calls (Backend/API); the core feature drafts answers with a language model, whose quality has to be measured (AI Systems).
```

Adds `docs/ai-systems/MODEL_INTEGRATION.md`, `EVALUATION.md` and `SAFETY.md` to everything example 2 creates, plus tooling rows for AI evaluation and AI safety tests. The answers draw on each customer's documents, so the team also runs `python3 scripts/groundwork.py add docs/ai-systems/RETRIEVAL.md`.

The model calls follow both the Backend/API rules (timeouts, retries) and the AI Systems rules (evaluation, untrusted output). These rules don't conflict: they add up.

## 4. AI marketing website → Web, and AI Systems only if there is real AI

The same brief can go two ways:

```text
- Profiles: web
- Why: the copy and images were drafted with AI tools, then reviewed and published like any other content. Nothing runs a model for visitors.
```

```text
- Profiles: ai-systems, web
- Why: visitors ask an assistant about the product, and a model answers live from our documentation. Wrong answers reach prospects, so quality and prompt injection need managing.
```

Only the second version gets the AI documents and checks. AI Systems needs at least one other profile; here Web carries it.

## 5. Command-line tool → none

```text
- Profiles: none
- Why: a single-user tool with no interface beyond its commands, no service and no model. Core is enough.
```

## 6. Growing over time

A project starts as example 1. A year later it adds customer accounts, and later still an AI assistant:

```text
python3 scripts/groundwork.py init web
python3 scripts/groundwork.py init web application backend-api
python3 scripts/groundwork.py init web application backend-api ai-systems
```

Each run creates only the documents that are missing and keeps everything already written. Nothing is renamed or moved. If a profile is later dropped, its documents stay, and `check_docs.py` warns until they are deleted or the profile comes back.
