# Client Releases

> Application profile, optional. Create this when the app ships as an installed client (app store, desktop installer), so older versions stay in use after each release. Environments and server deployment stay in `docs/architecture/system-design/06-operations-and-scalability.md`, if the project has it.

## Channels
Where the app is distributed (app stores, installers, company distribution), and each channel's review, signing and approval steps.

## Versioning
How version and build numbers are set, and what a version number promises to users.

## Supported versions
The oldest version still supported, and how people on older versions are asked or required to update.

## Version skew
Older clients keep calling the backend after a release. How the interfaces they use stay compatible, and for how long. Link the contracts in `docs/architecture/contracts/` if the project has them.

## Rollout
Staged rollouts, feature flags (switches that turn a feature on or off without a new release) and over-the-air updates, where the platform allows them.

## Rollback
A shipped client cannot be recalled. How a bad release is contained: switch the feature off on the server, ship a fixed release, or require an update.

## Release checklist
What must be true before each release.

- [ ] Critical journeys pass end to end on every supported platform.
- [ ] The backend still works with the oldest supported version.
- [ ] Store listing, screenshots and privacy details are up to date.
