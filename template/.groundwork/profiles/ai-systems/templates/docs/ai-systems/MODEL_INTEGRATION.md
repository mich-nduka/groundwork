# Model Integration

> AI Systems profile. Where and how the system uses AI models at run time, and how it builds what each model sees. Quality measurement lives in `docs/ai-systems/EVALUATION.md`, risks and data rules in `docs/ai-systems/SAFETY.md`, and retrieval, if the system has it, in `docs/ai-systems/RETRIEVAL.md`. Components and their boundaries stay under Architecture and interfaces in `docs/architecture/SYSTEM_DESIGN.md`.

## AI features
Every place a model shapes what the system does or shows. Name the requirement IDs each one serves.

| Feature | Model task | What the model decides or produces | What happens when it is wrong | Requirements |
|---|---|---|---|---|
| | | | | |

## Models and providers
Record the choices that are hard to reverse (provider, hosting, open or closed model) in an ADR.

| Model | Provider or hosting | Used for | Why this one | Fallback |
|---|---|---|---|---|
| | | | | |

## Prompts and instructions
Where prompts live, how they are versioned and reviewed, and how a prompt change is evaluated before it ships. Treat prompts as code.

## Context management
What goes into each model call, in what order, and what is left out: instructions, user input, conversation history, retrieved content, tool results. Set a budget for how much of the model's context (its input limit, counted in tokens) each part may use, and say what is trimmed or summarised first when the budget runs out.

## Tools and agents
Only if models call tools or run multi-step loops: the tools each agent may use, what each tool can change, the limits on steps and cost, and where a person must approve. `docs/ai-systems/SAFETY.md` reviews these permissions.

## Output handling
How model output is checked before it is used: the expected structure, how it is validated, and what the system does with output that fails.

## Failure and fallback
Timeouts, rate limits, provider outages and refusals: how each is detected, and what the user sees.

## Cost and latency
| Feature | Response-time target | Cost per call or per user | Limit or alert |
|---|---|---|---|
| | | | |
