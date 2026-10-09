# 0001. Use Tauri for the desktop application

Status: Accepted

Date: 2026-08-19

## Context

Git Forest is a keyboard-first desktop control plane. It must open instantly from a global shortcut, sit in the background, and do privileged local work: run Git, inspect processes, write files, and launch terminals. The interface benefits from a fast-moving web UI stack, but native behavior must stay narrow and auditable.

Options considered:

- **Electron**: mature, but ships a full Chromium and Node runtime and makes it easy for the UI to gain broad native access.
- **Native GTK/Qt**: smallest footprint, but slow UI iteration and a poor fit for a later macOS/Windows port.
- **Tauri 2**: system webview, Rust backend, and an explicit capability/permission model for what the frontend may call.

## Decision

Use Tauri 2 with a Rust core and a React 19 + TypeScript + Vite frontend.

- All privileged behavior (Git, filesystem, processes, persistence, terminals, agents) lives in Rust.
- The frontend calls a small set of intent-level Tauri commands (`create_worktree`, `launch_agent`, …), never a generic shell or `run_git`.
- The capability file grants only `core:default`, directory-picker dialogs, logging, and the window permissions the global launcher needs. No shell plugin is enabled.

## Consequences

- Native privileges are concentrated in one auditable Rust boundary that could later back a CLI or TUI.
- The UI can be developed and tested in plain Vitest/jsdom without the native runtime.
- Linux builds depend on WebKitGTK; rendering differences across platform webviews must be checked when macOS/Windows support arrives.
