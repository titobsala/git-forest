# 0002. Use the installed Git executable

Status: Accepted

Date: 2026-08-19

## Context

Forest reads repository state and creates, inspects, and removes worktrees. It could link a Git library (`libgit2`/`git2`, `gitoxide`) or call the user's installed `git`.

Worktree behavior must match what users get from Git directly. Users' credentials, SSH configuration, hooks, and config already belong to their Git installation. Library implementations lag the CLI on worktree features and can disagree with it on edge cases.

## Decision

Run the system `git` executable through a single `GitRunner` in the Rust core.

- Commands are built as a program plus an argument array. Paths, branch names, and refs are always separate arguments and are never interpolated into a shell string.
- Prefer machine-readable output: `git worktree list --porcelain`, `git status --porcelain=v2 --branch`, `git for-each-ref`, `git rev-parse`.
- Git failures map to typed `ForestError` variants (for example `GitNotInstalled`, `BranchAlreadyExists`, `DirtyWorktree`) so the UI never parses stderr.
- Git stays authoritative for Git facts; Forest does not copy history into its own database.

## Consequences

- Forest behaves exactly like the user's Git, including hooks and credential helpers.
- Git must be installed and on `PATH`; its absence is reported as `GitNotInstalled`.
- Each query spawns a process. Status checks therefore run asynchronously and in parallel rather than blocking the launcher.
- Tests create temporary repositories with real Git instead of mocking it.
