# AI Safety and Data Governance

> AI Systems profile. The risks that come from model behaviour, and the rules for the data models see. General security (sign-in, access, secrets) stays in `docs/engineering/SECURITY.md`; this document covers what is specific to AI.

## Risk assessment
Consider at least: confident wrong answers (often called hallucinations), harmful or off-brand output, prompt injection (instructions hidden in user input or retrieved content that take over the model), data leaking between users, unsafe tool actions, and users relying on output more than they should.

| Risk | Feature | Impact if it happens | Likelihood | Mitigation | Test |
|---|---|---|---|---|---|
| | | | | | |

## Trust boundaries
What the model may read, what it may do, and what it must never be trusted with. Treat model output as untrusted input everywhere the system uses it.

## Tool and action limits
For agents and tool use: which actions can be undone, which need a person's approval, and which are never allowed.

## Human oversight
Where a person can review, override or undo what the AI did, and how users report a problem.

## Data governance
- What data may go into prompts, and what must be removed or masked first.
- Each provider's terms: how long it keeps data, whether it trains on it, and where it processes it.
- The right to use the data behind retrieval, fine-tuning or evaluation.
- How a user's data is removed from logs, evaluation sets and indexes when they ask.

| Data | Sent to | Purpose | Kept by provider? | Used for training? | Legal basis or consent |
|---|---|---|---|---|---|
| | | | | | |

## Transparency
How users are told that output comes from AI, and what the system says about its limits.

## Incident response
What counts as an AI incident (harmful output, a data leak, an agent acting out of bounds), how a feature is switched off quickly, and who decides.
