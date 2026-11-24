# Retrieval

> AI Systems profile, optional. Create this when the system retrieves documents or records to ground model output: search, retrieval-augmented generation (RAG) or long-term memory. How retrieved content fits into each model call is decided in `docs/ai-systems/MODEL_INTEGRATION.md` (context management).

## Sources
| Source | Content | Owner | How often it changes | Who may see it |
|---|---|---|---|---|
| | | | | |

## Ingestion
How content is collected, cleaned, split into chunks and indexed, how often that runs, and what is left out.

## Indexing and search
How content is represented (embeddings, which are numeric representations of meaning; keywords; or both), how results are ranked, and how many results reach the model.

## Freshness
How changes and deletions in a source reach the index, and how stale content is spotted.

## Access control
Retrieval must never show a user content they could not open themselves. Say how permissions travel from each source to each result.

## Retrieval quality
How retrieval is measured on its own, separately from the final answer — for example, how often the right document appears in the results for a set of known questions. The thresholds live in `docs/ai-systems/EVALUATION.md`.

## Citations
Whether answers cite their sources, and how users can check them.
