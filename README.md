# Git Forest

Keyboard-first desktop control plane for Git worktrees and coding-agent sessions.

Git Forest is **not** a full Git client, IDE, or terminal. It connects repositories, worktrees, terminals, and CLI coding agents so a developer can move between isolated workspaces quickly.

This repository is at **Release 0.1.0** — a local Linux internal alpha. It can index local Git repositories, survive missing, moved, invalid, or unavailable checkouts, create, inspect, and safely remove Git worktrees, preview and run metadata cleanup, open a worktree in Warp, launch Codex, Claude Code, or OpenCode, invoke Quick Launch from anywhere with `Super + W`, and track those agent sessions against Linux `/proc`. 0.0.9 was an internal safety gate and is not a separately versioned package.

## Prerequisites

The 0.1.0 desktop app targets **Linux** first.

You need:

- [Bun](https://bun.sh) (JavaScript toolchain)
- [Rust](https://rustup.rs) via `rustup` (`rustc`, `cargo`, `clippy`, `rustfmt`)
- System Git
- Tauri 2 native libraries

On Ubuntu 24.04:

```bash
curl -fsSL https://bun.sh/install | bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

sudo apt update
sudo apt install \
  build-essential \
  curl \
  wget \
  file \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libxdo-dev
```

Confirm `~/.cargo/bin` is on your `PATH` (the rustup installer usually appends this in `~/.cargo/env`).

## Setup

```bash
git clone git@github.com:titobsala/git-forest.git
cd git-forest
bun install
bun run dev
```

That opens the Git Forest window:

```text
Git Forest

Version 0.1.0

Worktrees in reach.
```

The window shows Forest status and configuration, then lets you:

- link an existing Git repository (directory picker or path);
- scan a folder with live progress and cancellation, then import selected candidates;
- search indexed repositories by name, path, branch, or remote;
- refresh Git metadata and remove a repository from the Forest index only;
- select a repository to list worktrees, create a new-branch worktree (optionally copying ignored root `.env` files from the indexed repository), and remove one after a safety preview;
- open a selected worktree in Warp (new tab by default, or a new window from Settings);
- launch the configured default agent (Codex, Claude Code, or OpenCode) in that worktree, then see the session on the cockpit badge, Agents filter, monitor, and tray;
- invoke Quick Launch with `Super + W` (or `Ctrl/Cmd + K` while Forest is focused), search repositories and worktrees, and open a worktree in Warp with Enter.

Restarting the app keeps that index. Schema version 5 adds cached repository `health`, `health_detail`, and `last_reconciled_at` (existing rows migrate to `unknown`). Schema version 4 adds `agent_sessions.process_start_ticks` so a reused PID is not treated as the original process. Schema version 3 adds `worktrees.last_used_at` for launcher recency without dropping earlier rows. Schema version 2 added repository metadata (`primary_branch`, `remote_url`, `last_refreshed_at`).

Forest metadata lives in the OS application-data directory (`~/.local/share/dev.gitforest.desktop/` on Linux), not inside `~/forest`. The default Forest root is `~/forest`, with `repos/` and `worktrees/` created on first launch. Linking a repository does not move it. New worktrees are created under `~/forest/worktrees/<repository-slug>-<repository-id>/<worktree-slug>`, so repositories with the same name remain isolated. Removing a repository or a clean worktree never deletes Git branches. Worktrees with tracked or untracked changes require an explicit force action. Ignored-only worktrees warn that those local files will be deleted, then use ordinary removal. Create Worktree can copy ignored root-level `.env` family files from the indexed repository root; the copy is on by default when candidates exist and can be turned off.

Limitations in this release:

- new imports are Linked only (existing Managed records still load);
- worktree creation always makes a new branch from a local base (no attach-existing-branch yet);
- primary, locked, missing, Git-unknown, and status-unavailable worktrees cannot be ordinarily removed;
- a missing repository is shown as “Missing or moved” and must be located by the user — Forest does not scan the filesystem for it;
- cleanup is metadata/artifact maintenance: it never deletes a present worktree directory or a foreign Warp file;
- Warp is the only terminal provider;
- if `Super + W` is already taken by the desktop environment, Forest logs a warning and `Ctrl/Cmd + K` still toggles Quick Launch;
- agent session status is approximate (a Warp URI launch may be `unknown` when `/proc` never shows a matching process);
- custom-agent management and generic `WorkspaceSession` (terminal/editor activity) are not implemented.

The desktop capability set is `core:default`, `dialog:allow-open` for native directory pickers, `log:default` for rolling local logs, and narrow window show/hide/focus permissions for the global launcher. `Super + W` is registered in Rust; the UI never receives a generic shortcut or shell command.

JavaScript packages are managed with **Bun only**. Do not add npm, yarn, or pnpm lockfiles.

## Manual smoke

Use a disposable Git repository with an initial `main` commit. Never use a developer repository for destructive scenarios.

After `bun run dev`:

1. Link a nested path inside an existing Git repository; the indexed path should be the repository root.
2. Scan a folder, cancel mid-scan, then scan again and import selected candidates.
3. Search by name, path, branch, or remote; refresh metadata; restart and confirm the index remains.
4. Remove a repository from Forest and confirm the directory is still on disk.
5. In a disposable repo, ignore `.env`, `.env.local`, `.env.development`, `.env.development.local`, and an unrelated `.cache`. Create a worktree and confirm the Copy local environment files checkbox lists those env names (not `.cache`), defaults on, and can be unchecked. Create once with copying enabled and once disabled; confirm the exact copied set, independent edits, and that names appear without contents. If copy fails, Launch anyway must not create a second worktree. After a successful copy, the selected agent launches; unavailable agents stay visible but disabled as Missing.
6. Ignored-only worktrees warn that N ignored local files will be deleted and use ordinary Remove worktree. A true untracked or dirty worktree still requires Force remove; the branch is kept. Status-unavailable and Git-unknown rows omit ordinary remove.
7. With Warp installed, open a worktree from the cockpit (`Enter` or the row action) and confirm a tab opens at that path.
8. With Codex, Claude Code, or OpenCode on `PATH`, launch the default agent (`⌥A` or the row action) and confirm Warp starts that command in the worktree. Settings should show Installed/Missing next to each built-in. If launch fails after create, Retry launch must not create a second worktree.
9. Press `Super + W` from another app while Forest is hidden: the window appears, Quick Launch is open, and search is focused. Press it again: the overlay closes and the window hides. `Ctrl/Cmd + K` still toggles the overlay without hiding Forest.
10. Search a worktree, press Enter, confirm Warp opens at that path, then reopen Quick Launch with an empty query and confirm that worktree ranks above unused ones.
11. Launch two agents in one worktree: the row shows one primary badge, the monitor lists both, and the tray/Agents filter count active sessions. Terminate one process, wait up to ten seconds (or hide and show Forest), and confirm reconciliation. Restart Forest and confirm sessions are `running`, `exited`, or `unknown`. Active sessions block worktree removal; exited/unknown sessions do not.
12. Move a linked repository, confirm Forest shows “Missing or moved”, then Locate it with the directory picker and confirm worktrees return. Do not expect Forest to scan the disk for it.
13. In Settings → Maintenance, preview cleanup, cancel with Escape, then execute selected categories. Confirm Git prune, stale Forest rows, exited/failed sessions, and generated `git-forest-*.toml` files are the only removals, and present directories plus foreign Warp files remain.

## Commands

From the repository root:

```bash
bun run dev           # Tauri + Vite desktop development
bun run build         # production desktop build
bun run test          # frontend tests
bun run typecheck     # TypeScript
bun run lint          # ESLint
bun run format        # Prettier
bun run format:check  # Prettier check
bun run check:rust    # rustfmt, clippy, and cargo test
bun run check         # frontend checks plus Rust checks
bun run hooks:install # enable Git hooks for this clone
```

`bun install` also runs `prepare`, which points Git at [`.githooks/`](.githooks/). The pre-commit hook formats/lints staged frontend files and, when Rust files are staged, runs `rustfmt` and Clippy. Skip it with `git commit --no-verify` or `GIT_FOREST_SKIP_HOOKS=1`.

## CI

GitHub Actions runs on pull requests, pushes to `main`, and manual dispatch:

- Frontend: Prettier, ESLint, TypeScript, Vitest, Vite build
- Rust: rustfmt, Clippy, `cargo test`
- Desktop: production Tauri build after the other jobs pass

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Equivalent Cargo commands from `apps/desktop/src-tauri`:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

## Layout

```text
git-forest/
├── apps/desktop/          Tauri 2 + React 19 + Vite application
├── packages/              reserved for later shared packages
├── docs/                  architecture notes and ADRs
├── tests/fixtures/        shared test fixtures
├── AGENTS.md
├── ROADMAP.md
└── README.md
```

The desktop UI is a client. Privileged work (Git, filesystem, processes, persistence) belongs in the Rust core behind typed Tauri commands.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full 1.0 plan. Contributor rules for humans and coding agents are in [AGENTS.md](AGENTS.md).
