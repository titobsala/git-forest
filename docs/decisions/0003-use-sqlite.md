# 0003. Use SQLite for Forest metadata

Status: Accepted

Date: 2026-08-19

## Context

Forest needs to remember things Git does not know: which repositories are indexed, repository mode (linked or managed), user preferences, worktree recency for the launcher, and agent session history. This state must survive restarts, migrate safely between releases, and stay local and offline.

## Decision

Store Forest metadata in a single SQLite database through `rusqlite` with the bundled SQLite build.

- The database lives in the OS application-data directory (`~/.local/share/dev.gitforest.desktop/forest.db` on Linux), not inside the Forest root or a repository.
- Schema changes are numbered SQL migrations in `apps/desktop/src-tauri/migrations/`, applied in order at startup and recorded in `schema_migrations`.
- Foreign keys are enforced and the database runs in WAL mode.
- Rows are persistence records, not the domain model. Services map them into domain types.

## Consequences

- No database server or network dependency; the core flow works offline.
- Persisted state can be stale. Repository health, worktrees, and agent sessions are always reconciled against the filesystem, Git, and `/proc` before being shown as live (see [0006](0006-linux-agent-process-reconciliation.md)).
- Migrations are append-only; existing ones are never edited after release.
