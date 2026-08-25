# 0006. Linux agent process reconciliation

Status: Accepted

Date: 2026-08-25

## Context

Warp launches agents by opening a `warp://` URI. Forest does not receive a child PID. Release 0.0.8 still needs an approximate `AgentSession` lifecycle so the cockpit badge, Agents filter, monitor, tray counts, and worktree-removal blockers can distinguish live work from finished or ambiguous work.

Generic process crates and portable inspectors are out of scope: the MVP is Linux-first, and `/proc` is the local source of truth. Terminal or editor activity (`WorkspaceSession`) is a different concept from an agent CLI and is not required to make `AgentSession` honest.

## Decision

Persist `AgentSession` rows with optional `pid` and `process_start_ticks` (schema version 4). Reconcile against Linux `/proc` through a small `ProcessInspector` seam.

Matching a live process requires:

1. canonical worktree cwd (`/proc/<pid>/cwd`);
2. the agent command basename on `/proc/<pid>/exe`, argv0, **or** a wrapper-script token in NUL-separated `cmdline`;
3. both PID and `starttime` (stat field 22, parsed after the final `)` in `comm`).

Launch tracking:

1. snapshot matching identities **before** Warp dispatch (baseline);
2. insert `starting`;
3. on dispatch failure mark `failed`;
4. on success poll briefly for a **new** matching identity, preferring the newest start tick;
5. transition to `running` with identity, or `unknown` when detection is inconclusive.

Reconciliation (on service init and before session lists / removal previews):

| Observation | Result |
| --- | --- |
| Same PID, start ticks, cwd, and command | stay `running`, refresh `last_seen_at` |
| Process absent | `exited`, set `exited_at` |
| Permission/identity mismatch or PID reuse (same PID, different ticks) | `unknown`, clear live PID identity |
| Stale `starting` without a PID (> 30s) | `unknown` |
| `exited`, `unknown`, `failed` | terminal for automatic reconciliation |

Only `starting` and `running` are active. They block worktree removal and count in the tray. The UI shows one primary badge per worktree (newest active session, then id) and lists every session on the monitor.

Outside Linux, the inspector reports no matches / inaccessible status rather than inventing liveness.

`WorkspaceSession` (generic terminal/editor activity) remains deferred. This release tracks agent CLI processes only.

## Consequences

- Forest can distinguish approximately running, finished, and unknown agent sessions after launches and restarts.
- Warp's fire-and-forget URI means a matching process may never appear; that is `unknown`, not a silent success.
- PID reuse cannot revive an old session because start ticks must match.
- Adding another OS means a new `ProcessInspector`, not a change to Forest commands or the session model.
- Do not claim generic resume. A later agent-specific resume path can use these identities if an agent provides one.
