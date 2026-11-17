# AI Evaluation and Observability

> AI Systems profile. How we know the AI features are good enough, and how we notice when they stop being good enough. Ordinary tests stay in `docs/engineering/TEST_STRATEGY.md`; this document covers what ordinary tests cannot prove.

## Quality criteria
For each AI feature in `docs/ai-systems/MODEL_INTEGRATION.md`: what a good result looks like, what is unacceptable, and how results are scored (exact match, a rubric, human rating, or another model grading against a rubric).

## Evaluation sets
Representative cases, hard cases, and cases taken from real failures. Say how personal data is removed from them.

| Set | Feature | Size | Source | Owner | Last refreshed |
|---|---|---|---|---|---|
| | | | | | |

## Metrics and thresholds
These thresholds are the release gate behind the "AI evaluation" check in the tooling table in `AGENTS.md`.

| Metric | Feature | Threshold to ship | Current |
|---|---|---|---|
| | | | |

## When evaluations run
On every change to a prompt, model, retrieval setup or tool; before upgrading a model version; and on a schedule against samples from production.

## Human review
Where people review output (a sample, flagged cases, high-risk cases), who reviews it, and how their judgements flow back into the evaluation sets.

## Production observability
- Traces: each model call with its inputs, context size, output, response time, cost and model version, with sensitive data handled as `docs/ai-systems/SAFETY.md` requires.
- Quality signals: user feedback, retries, edits and escalations.
- Drift: changes over time in what users ask or in output quality.
- Alerts: the quality, cost or error levels that trigger action, and who acts.

## Known limitations
What the AI features are known to get wrong, and how users are told.
