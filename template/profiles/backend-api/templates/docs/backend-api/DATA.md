# Data Architecture

> Backend/API profile, optional. Create this when the system has more than one data store, migrates live data, or must meet backup, retention or residency rules. The concepts, their owners and their states stay in `docs/architecture/system-design/02-domain-and-state-model.md`; this document covers where the data physically lives and how it is kept safe over time.

## Data stores
| Store | Kind | Data it holds | Owning component | Source of truth? |
|---|---|---|---|---|
| | | | | |

## Data flows
How data moves between stores and services: copies, caches, search indexes, analytics exports. For each copy, say which side wins when they disagree.

## Schema changes and migrations
How the data's shape changes without downtime or data loss — for example expand then contract: add the new shape, move the data, then remove the old shape. Say how backfills run and how a migration is undone.

## Backup and restore
Recovery point: how much recent data may be lost. Recovery time: how long a restore may take.

| Store | Backup frequency | Recovery point | Recovery time | Last restore test |
|---|---|---|---|---|
| | | | | |

## Retention and deletion
How long each kind of data is kept, and how it is deleted, including when a user asks. How data is classified lives in `docs/engineering/SECURITY.md`.

## Residency and access
Where the data is physically stored, which legal or contract rules limit that, and who or what may read production data.
