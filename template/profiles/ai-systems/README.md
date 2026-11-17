# AI Systems Profile

For systems whose behaviour depends on AI models at run time: LLM features (large language models), retrieval, agents and model-driven workflows. When it applies, which documents it adds and which checks it needs are declared in [profile.json](profile.json).

AI Systems is never used alone. AI is a capability of a product, so this profile requires at least one of Web, Application or Backend/API. That other profile describes the product that carries the AI features.

## Where each concern lives

| Concern | Lives in |
|---|---|
| AI features, models, prompts, context management, tools and agents | `docs/ai-systems/MODEL_INTEGRATION.md` |
| Retrieval: sources, indexing, freshness, permissions (optional) | `docs/ai-systems/RETRIEVAL.md` |
| Quality criteria, evaluation sets, thresholds, AI observability | `docs/ai-systems/EVALUATION.md` |
| AI risks, prompt injection, human oversight, data governance | `docs/ai-systems/SAFETY.md` |
| Where model calls sit among the components | `docs/architecture/system-design/04-architecture-and-interfaces.md` |
| General security: sign-in, access, secrets | `docs/engineering/SECURITY.md` |
| What the AI features must do, as requirements | `docs/product/SPEC.md` and feature specs |

## Engineering standards

Defaults for the AI features. A project can override any of them with a requirement in `SPEC.md` or an accepted ADR.

- Every AI feature has written quality criteria and an evaluation set before it ships. "It looked fine when I tried it" is not evidence.
- A change to a prompt, model, retrieval setup or tool is a code change: reviewed, versioned and evaluated against the thresholds in `EVALUATION.md`.
- Model output is untrusted input. Validate it before it changes state, reaches another system or is shown as fact.
- Retrieved content and user input can carry hidden instructions. Keep them apart from system instructions, and never let them widen what the model may do.
- Agents get the narrowest tools that do the job. Actions that cannot be undone need a person's approval or a hard limit.
- Every model call has a timeout, a cost limit and a fallback the user can understand.
- Send a model only the data it needs. Follow the data rules in `SAFETY.md`.
- Pin model versions, and treat a version upgrade as a change that must pass evaluation.

## Agent instructions

- Before changing an AI feature, read its row in `MODEL_INTEGRATION.md`, its quality criteria in `EVALUATION.md` and its risks in `SAFETY.md`.
- When you change a prompt, model or retrieval setting, run the AI evaluation and report the scores against the thresholds in the change's plan or pull request.
- When you add a tool an agent can call, add it to `MODEL_INTEGRATION.md` and review its limits in `SAFETY.md`.
- When you add a new kind of data sent to a model, add a row to the data governance table in `SAFETY.md`.
- Don't let a passing ordinary test suite stand in for evaluation.

## Composing with other profiles

- **With Backend/API:** model calls follow that profile's rules on timeouts, retries and failure, as well as these.
- **With Application:** AI output in the interface needs UI states for slow, failed and low-confidence answers, recorded in `docs/design/DESIGN.md` §6.4.
- **With Web:** only for AI that runs for visitors. Content written with AI help is ordinary content.
