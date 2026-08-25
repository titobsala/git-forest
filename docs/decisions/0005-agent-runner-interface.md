# 0005. Agent runner interface

Status: Accepted

Date: 2026-08-24

## Context

Git Forest should launch CLI coding agents inside a selected worktree. The agents own their own interactive sessions; Forest should not embed them or become a second shell. Warp is the only terminal provider in the MVP, and Warp starts a command through a generated Tab Config whose `commands` field is a string, not an argv array.

AGENTS.md forbids interpolating untrusted paths into shell strings. Worktree paths and agent arguments must stay structured until Warp's required command-string boundary.

Session persistence, live PID reconciliation, custom-agent management UI, and the cockpit/tray session surfaces belong to later releases. This decision only covers detection and launch of the seeded built-in agents.

## Decision

Agent runners produce an `AgentLaunchSpec` (`working_directory`, `command`, `args`, `display_name`). They do not open terminals.

Forest then:

1. detects seeded definitions (`codex`, `claude`, `opencode`, `cursor`) by checking whether their configured executable is on `PATH`;
2. resolves the agent from the optional command argument or the configured default;
3. refuses launch when the executable is missing (`AgentUnavailable`) or the worktree directory is gone (`WorktreeMissing`);
4. hands the spec to the terminal provider.

Warp writes a Tab Config under `{XDG_DATA_HOME or ~/.local/share}/warp-terminal/tab_configs/` with a `git-forest-` prefix, then opens `warp://tab_config/{stem}` (`?new_window=true` for Window). The worktree path is Warp's `directory` field; it is never concatenated into the command. The command string is produced by a narrowly tested encoder: safe tokens pass through, everything else is POSIX single-quoted, empty values and control characters are rejected.

Generated `git-forest-*.toml` files older than 60 seconds are deleted before a new write. Files without that prefix are left alone. A failed URI open deletes the file just written.

The UI invokes `detect_agents` and `launch_agent`. Custom-agent editing and `agent_sessions` persistence are out of scope.

## Consequences

- Codex, Claude Code, and OpenCode can be launched from a worktree through Warp. Cursor CLI may show Installed/Missing but is not a required launch target.
- Forest records agent sessions and reconciles them against Linux `/proc` as of Release 0.0.8. See [0006. Linux agent process reconciliation](0006-linux-agent-process-reconciliation.md).
- Adding another terminal provider means implementing `launch_command` for that provider without changing agent detection.
- The encoder is the only place Forest builds a command string, and tests assert that worktree paths never appear in it.
