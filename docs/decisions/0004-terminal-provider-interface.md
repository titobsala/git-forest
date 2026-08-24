# 0004. Terminal provider interface

Status: Accepted

Date: 2026-08-24

## Context

Git Forest needs to open a worktree in the user's terminal without embedding a terminal or coupling Forest's Git/worktree code to one application. The Linux MVP launches Warp. Later providers (system default, Ghostty, Kitty, and others) should be addable without changing Forest orchestration.

Warp's supported desktop integration is a URI scheme, not a documented argv API for "open this directory as a tab". Forest therefore needs a process seam for opening URIs and detecting binaries, plus a provider that speaks Warp's URIs.

## Decision

Introduce a `TerminalProvider` trait in the Rust core:

```text
id
is_available
open_directory(path, launch_behavior)
launch_command(agent_launch_spec, launch_behavior)
```

Forest validates the worktree (it must exist on disk) and then calls the configured provider. The UI invokes a narrow `open_worktree` command; it never receives a generic shell.

The first implementation is Warp on Linux:

- Availability is true when `warp-terminal` or `warp` is on `PATH`, or the `warp` URI scheme is registered. The result is cached for 30 seconds so the launcher does not re-detect on every open.
- `Auto` and `Tab` open `warp://action/new_tab?path=...` with a percent-encoded path. `Window` uses `new_window`.
- Desktop URIs are opened through `xdg-open` as an argv array, never a concatenated shell string.

Missing Warp returns `TerminalUnavailable`. Failed URI opens return `TerminalLaunchFailed`. Missing worktree directories return `WorktreeMissing`.

## Consequences

- Warp-specific URI and tab-config details stay inside `apps/desktop/src-tauri/src/terminals/warp.rs`.
- Tests inject a `DesktopLauncher` fake rather than talking to a real Warp install.
- Additional terminal applications become new provider implementations behind the same Forest command.
- `launch_command` is part of this seam so Release 0.0.6 can reuse the same provider rather than inventing a second Warp integration.
