# Git Forest

Keyboard-first desktop control plane for Git worktrees and coding-agent sessions.

Git Forest is **not** a full Git client, IDE, or terminal. It connects repositories, worktrees, terminals, and CLI coding agents so a developer can move between isolated workspaces quickly.

This repository is at **Release 0.0.2** — a runnable Linux desktop app that can create, persist, and reload Forest configuration plus Linked/Managed repository records. Git discovery, worktrees, terminals, and agents start in later roadmap releases.

## Prerequisites

The 0.0.2 desktop app targets **Linux** first.

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

Version 0.0.2

Configuration rooted.
```

The window shows the Forest root, application-data/database location, schema version, editable configuration, and a form to register an existing directory as **Linked** or **Managed**. Restarting the app keeps that state.

Forest metadata lives in the OS application-data directory (`~/.local/share/dev.gitforest.desktop/` on Linux), not inside `~/forest`. The default Forest root is `~/forest`, with `repos/` and `worktrees/` created on first launch. Registering a repository only stores an index record; it does not inspect Git or move files.

JavaScript packages are managed with **Bun only**. Do not add npm, yarn, or pnpm lockfiles.

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
```

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
