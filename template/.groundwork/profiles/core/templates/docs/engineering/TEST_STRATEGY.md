# Test Strategy

## Quality objectives
What risks should testing catch?

## Test layers
| Layer | Purpose | Must pass in CI? |
|---|---|---|
| Unit | One piece of logic, on its own | |
| Integration | Components working together | |
| Contract | Agreements between connected systems stay honoured | |
| End-to-end | The critical user journeys | |
| Performance / security | The quality attributes that matter here | |

## Critical scenarios
The high-risk paths, the invariants (things that must always hold) and the failure cases.

## Test data and environments
Fixtures, synthetic data, isolation, and any environment the tests need. For an installed app, the devices, operating-system versions and screen sizes it must work on, and which of them each release is tested on.

## Test environments and orchestration
How a full test run is assembled when several apps run together (client, API, worker):

- Who starts which app, in what order, and how readiness is checked.
- How the client finds the server (base URLs, ports).
- Which app seeds shared test data, and when.
- Isolation: one shared environment vs per-run environments (containers).
- Teardown: what's collected (logs, screenshots, videos, traces).

End-to-end drivers — for example Playwright for browsers, Maestro for mobile — are recorded in the tooling table in `AGENTS.md` and the relevant ADRs.

## Release gates
What must pass before release, and who can approve an exception.
