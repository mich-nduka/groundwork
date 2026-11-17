# Seven-Part System Design

Each document describes the same system from a different angle. Start short; add detail only where it helps.

A project has only the parts it needs. Each active profile requires some parts and makes others optional (see `profiles/<id>/profile.json`). `python3 scripts/groundwork.py init` creates the required parts here; create another part when the work needs it with `python3 scripts/groundwork.py add docs/architecture/system-design/<part>.md`. Every part belongs to Groundwork Core, so profiles share one copy rather than each keeping their own.

| Step | Document | Core question |
|---|---|---|
| 1 | `01-system-overview.md` | What is the system, who uses it, and what does it do? |
| 2 | `02-domain-and-state-model.md` | What data and concepts does it manage? |
| 3 | `03-behaviour-and-business-rules.md` | How does that state change, and what must always hold? |
| 4 | `04-architecture-and-interfaces.md` | How is it built, and what connects its parts? |
| 5 | `05-execution-and-resilience.md` | How does it run, fail and recover? |
| 6 | `06-operations-and-scalability.md` | How is it run day to day, watched and scaled? |
| 7 | `07-ui-and-interaction-mapping.md` | How do user actions map to system behaviour? |
