# Git Forest

Keyboard-first desktop control plane for Git worktrees and coding-agent sessions.

Git Forest is **not** a full Git client, IDE, or terminal. It connects repositories, worktrees, terminals, and CLI coding agents so a developer can move between isolated workspaces quickly.

This repository is at **Release 0.0.4** — a runnable Linux desktop app that can index local Git repositories, scan folders, and create, inspect, and safely remove Git worktrees. Terminals and coding agents start in later roadmap releases.

## Prerequisites

The 0.0.4 desktop app targets **Linux** first.

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

Version 0.0.4

Worktrees in reach.
```

The window shows Forest status and configuration, then lets you:

- link an existing Git repository (directory picker or path);
- scan a folder with live progress and cancellation, then import selected candidates;
- search indexed repositories by name, path, branch, or remote;
- refresh Git metadata and remove a repository from the Forest index only;
- select a repository to list worktrees, create a new-branch worktree, and remove one after a safety preview.

Restarting the app keeps that index. Schema version 2 adds repository metadata (`primary_branch`, `remote_url`, `last_refreshed_at`) without dropping 0.0.2 rows.

Forest metadata lives in the OS application-data directory (`~/.local/share/dev.gitforest.desktop/` on Linux), not inside `~/forest`. The default Forest root is `~/forest`, with `repos/` and `worktrees/` created on first launch. Linking a repository does not move it. New worktrees are created under `~/forest/worktrees/<repository-slug>/<worktree-slug>`. Removing a repository or a clean worktree never deletes Git branches; dirty worktree removal requires an explicit force action.

Limitations in this release:

- new imports are Linked only (existing Managed records still load);
- worktree creation always makes a new branch from a local base (no attach-existing-branch yet);
- primary, locked, missing, and Git-unknown worktrees cannot be removed;
- terminals and agents are not launched yet.

The desktop capability set is `core:default` plus `dialog:allow-open` for native directory pickers. The UI never receives a generic shell command.

JavaScript packages are managed with **Bun only**. Do not add npm, yarn, or pnpm lockfiles.

## Manual smoke

After `bun run dev`:

1. Link a nested path inside an existing Git repository; the indexed path should be the repository root.
2. Scan a folder, cancel mid-scan, then scan again and import selected candidates.
3. Search by name, path, branch, or remote; refresh metadata; restart and confirm the index remains.
4. Remove a repository from Forest and confirm the directory is still on disk.
5. Select a repository, create a worktree with a new branch from a local base, and confirm it appears under `~/forest/worktrees/<repository-slug>/`.
6. Make the worktree dirty, confirm ordinary removal is blocked, force-remove it, and confirm the branch still exists.

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
