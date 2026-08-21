# Git Forest — Product & Engineering Roadmap

## Status

Current implementation:

```text
Release 0.0.4
```

Completed:

```text
0.0.1 Repository Bootstrap
0.0.2 Forest Configuration & Domain Model
0.0.3 Git-aware repository indexing
0.0.4 Git worktree lifecycle
```

Next:

```text
0.0.5 Terminal Provider System
```

The 1.0 release remains the first complete local MVP. `WorkspaceSession` from the original 0.0.2 type list is deferred to Release 0.0.8 (Sessions & Process Tracking).

This roadmap deliberately separates **foundational correctness** from richer integrations and future orchestration features.

---

## Deferred UI wiring

The desktop UI was built ahead of the backend against `docs/design.md`. The three interaction surfaces (Quick Launcher, Cockpit, Tray) exist today; the components below are rendered but inert because no command feeds them yet.

They are complete markup and styling. Landing the release listed against each one should be a wiring change, not a design change.

| Component | File | Waiting on |
| --- | --- | --- |
| `TerminalActions` (terminal half) | `components/deferred/TerminalActions.tsx` | 0.0.5 — pass an `onOpenTerminal` handler to enable the button |
| `TerminalActions` (agent half) | `components/deferred/TerminalActions.tsx` | 0.0.6 — pass an `onLaunchAgent` handler |
| `AgentBadge` | `components/deferred/AgentBadge.tsx` | 0.0.6 / 0.0.8 — pass a real `AgentSession` instead of `null` |
| Cockpit "Agents" filter pill | `features/cockpit/filters.ts` | 0.0.6 / 0.0.8 — supply the `hasAgentSession` predicate |
| Agent monitor "Running sessions" | `features/agents/AgentMonitorView.tsx` | 0.0.8 — replace the placeholder with the session list |
| `TrayPanel` active-agent count | `features/tray/TrayPanel.tsx` | 0.0.8 — replace `counts.agents: null` |
| `Super + W` global shortcut | `features/launcher/QuickLaunch.tsx` | 0.0.7 — Tauri global-shortcut plugin plus window show/hide; the overlay opens on `Cmd/Ctrl+K` today |
| Native system tray | `features/tray/TrayPanel.tsx` | 0.5.0 — the panel body becomes the native menu |
| `StashPill` | `components/deferred/StashPill.tsx` | **unscheduled** — `Worktree` has no `stashCount` and `git/status.rs` does not read the stash reflog. `docs/design.md` section 4.1 specifies the badge; a release needs to claim it |

`selection.open` (`Enter`) and `selection.agent` (`⌥A`) are registered in `lib/keymap.ts` and resolve correctly, but the cockpit's handler ignores them until 0.0.5 and 0.0.6 respectively.

---

# 1. Product Vision

Git Forest is a **keyboard-first desktop control plane for Git worktrees and coding-agent sessions**.

It should let a developer move rapidly between:

```text
Repository
    ↓
Task
    ↓
Worktree
    ↓
Terminal
    ↓
Coding Agent
    ↓
PR / completion
```

without manually managing directories, remembering which worktree belongs to which task, or repeatedly launching tools.

Git Forest is not another full Git client.

It focuses specifically on the workflow around **isolated parallel development environments**.

---

# 2. Core Product Metaphor

The product model is:

```text
🌳 Forest
│
├── 🌲 Repository A
│   ├── 🌿 main
│   ├── 🌿 feat/risk-483
│   │   └── 🤖 Codex ●
│   └── 🌿 fix/export
│       └── 🤖 Claude ○
│
└── 🌲 Repository B
    ├── 🌿 main
    └── 🌿 feat/map
```

Terminology:

### Forest

The complete set of repositories and workspaces known to Git Forest.

### Repository

A Git repository indexed by Forest.

### Worktree

A concrete local working directory created through Git worktree functionality.

### Agent Session

A coding-agent process or terminal session associated with a worktree.

### Workspace Session

A broader session representing a worktree being actively used in a terminal/editor/agent context.

---

# 3. Primary User Experience

The ideal workflow should become:

```text
Super + W
```

Then:

```text
> risk-483
```

Git Forest immediately shows:

```text
EXOG / feat/risk-483      Codex ●
```

From there the user can:

```text
Enter   Open terminal
A       Start/resume agent
D       View Git status
R       Remove worktree
Tab     Expand cockpit
Esc     Hide
```

Creating a workspace should eventually be approximately:

```text
Super + W
N

Repository:
EXOG

Base:
main

Branch:
feat/risk-483

Agent:
Codex

Create
```

Forest performs:

```text
git worktree add
        ↓
create Forest metadata
        ↓
open Warp tab
        ↓
cwd = worktree
        ↓
launch Codex
```

---

# 4. MVP Scope

Git Forest 1.0.0 must provide a reliable local workflow for:

* indexing local Git repositories;
* managing Forest repositories;
* creating Git worktrees;
* listing Git worktrees;
* inspecting basic worktree state;
* safely removing worktrees;
* opening worktrees in a terminal;
* supporting Warp as the primary terminal provider;
* reusing/opening Warp tabs rather than spawning unnecessary windows;
* launching configured CLI coding agents;
* tracking basic agent-session state;
* presenting a keyboard-first quick launcher;
* presenting a richer cockpit/list view;
* persisting Forest metadata;
* reconciling external Git changes;
* exposing basic preferences;
* running from the desktop/tray;
* shipping as an installable Linux desktop application.

---

# 5. Explicitly Outside 1.0

The following are **not required for MVP**:

* GitHub API integration;
* GitLab API integration;
* Linear integration;
* automatic PR creation;
* remote/cloud agents;
* remote servers;
* SSH orchestration;
* mobile control;
* team collaboration;
* cloud sync;
* embedded terminal emulator;
* embedded code editor;
* automatic agent prompt generation;
* agent-to-agent orchestration;
* visual React Flow graph;
* full Git commit graph;
* Windows parity;
* macOS parity;
* automatic AI task decomposition.

These may come later.

---

# 6. Technology Baseline

## Desktop

```text
Tauri 2.x
```

## Native core

```text
Rust
```

## Frontend

```text
React 19.x
TypeScript
Vite
```

## JavaScript tooling

```text
Bun
```

## Local persistence

```text
SQLite
```

## Git integration

```text
system Git CLI
```

## Initial terminal provider

```text
Warp
```

## Initial agent runners

```text
Codex CLI
Claude Code
OpenCode
Cursor CLI
Custom command
```

---

# 7. Architecture Baseline

```text
┌────────────────────────────────────────────┐
│                 React UI                   │
│                                            │
│  Quick Launcher       Cockpit      Config │
└───────────────────┬────────────────────────┘
                    │
             typed Tauri commands
                    │
┌───────────────────▼────────────────────────┐
│                 Rust Core                  │
│                                            │
│ Repositories                               │
│ Worktrees                                  │
│ Sessions                                   │
│ Agent runners                              │
│ Terminal providers                         │
│ Reconciliation                            │
└──────┬───────────────┬───────────────┬─────┘
       │               │               │
       ▼               ▼               ▼
      Git           SQLite          Operating
      CLI                            System
```

The frontend is a client.

Rust owns privileged operations.

---

# 8. Release Philosophy

Version numbers before 1.0 represent increasingly usable internal releases.

The roadmap is structured so each release can later become one or more detailed implementation tickets.

Every phase should ideally finish with:

* working application;
* tests passing;
* no critical regressions;
* documentation updated;
* manually demonstrable milestone.

---

# Release 0.0.1 — Repository Bootstrap

Status: **complete**.

## Goal

Create the smallest correct Git Forest desktop application and establish engineering conventions.

No real Forest functionality is required yet.

## Deliverables

### Repository foundation

Create:

```text
AGENTS.md
ROADMAP.md
README.md
.gitignore
```

Establish Bun workspace structure.

Suggested root:

```text
git-forest/
├── apps/
│   └── desktop/
├── packages/
├── docs/
├── tests/
├── package.json
├── bun.lock
├── AGENTS.md
└── ROADMAP.md
```

### Desktop bootstrap

Create Tauri + React + TypeScript application.

The application should open successfully on Linux.

Initial UI:

```text
Git Forest

Version 0.0.1

Forest is growing.
```

### Rust bootstrap

Establish Rust module layout.

Example:

```text
src-tauri/src/
├── commands/
├── domain/
├── git/
├── worktrees/
├── terminals/
├── agents/
├── persistence/
├── platform/
└── main.rs
```

Empty modules are acceptable only where they establish an immediately useful boundary.

### Development commands

Provide root scripts such as:

```bash
bun run dev
bun run build
bun run test
bun run typecheck
bun run lint
```

Rust validation should also be documented.

### Code quality

Establish:

* TypeScript strict mode;
* frontend linting;
* frontend formatting;
* Rust formatting;
* Rust linting;
* test commands.

### Basic CI

Initial CI should validate at least:

```text
frontend dependencies
TypeScript
frontend tests
Rust format
Rust clippy
Rust tests
desktop build where practical
```

## Acceptance Criteria

A new developer can:

```bash
git clone ...
bun install
bun run dev
```

and see the Git Forest window.

No npm/yarn/pnpm lockfiles exist.

Both frontend and Rust checks pass.

---

# Release 0.0.2 — Forest Configuration & Domain Model

Status: **complete**.

`WorkspaceSession` is not implemented here; it belongs to Release 0.0.8.

## Goal

Define what a Forest actually is before implementing significant Git behavior.

## Domain types

Introduce models for:

```text
ForestConfiguration
Repository
RepositoryId
RepositoryMode
Worktree
WorktreeId
TerminalProviderId
AgentDefinition
AgentSession
AgentSessionId
```

IDs should not depend solely on display names.

## Repository modes

Support conceptually:

```text
Managed
Linked
```

### Managed repository

Located under Forest-controlled directories.

Example:

```text
~/forest/repos/exog-app
```

### Linked repository

Existing repository left where it already lives.

Example:

```text
~/Projects/exog-app
```

## Forest root

Default:

```text
~/forest
```

Configurable by user.

Suggested managed structure:

```text
~/forest/
├── repos/
└── worktrees/
```

Application state should use application data directories.

## Configuration model

Initial configurable properties:

```text
forest_root
default_terminal
default_agent
worktree_naming_strategy
launch_behavior
```

Do not expose every hypothetical future option.

## Persistence

Initialize SQLite.

Create migration framework.

Initial tables may include:

```text
settings
repositories
worktrees
agent_definitions
agent_sessions
```

Keep schema minimal.

## Acceptance Criteria

Forest can:

* create/load configuration;
* persist configuration;
* initialize its database;
* represent linked vs managed repositories;
* restart without losing state.

No Git mutations are required yet.

---

# Release 0.0.3 — Repository Discovery & Import

Status: **complete**.

0.0.2 shipped naive directory registration. This release extends that seam into Git-aware indexing: validate and resolve repository roots, persist metadata, scan folders with progress/cancellation, search, and index-only removal. New imports are Linked. Existing Managed records remain readable. Bare-repository UX, managed clone/move/delete, and Cockpit navigation are out of scope.

## Goal

Allow Forest to know which repositories exist.

## Add repository

User can select an existing directory.

Forest validates:

```text
directory exists
        ↓
is Git repository?
        ↓
resolve repository root
        ↓
already indexed?
        ↓
store repository
```

## Repository metadata

Display:

* repository name;
* path;
* linked/managed status;
* current primary branch where detectable;
* remote URL when available;
* last refreshed time.

## Scan folder

Support discovering repositories underneath a chosen folder.

Example:

```text
~/Projects/
├── exog-app/.git
├── exog-api/.git
├── game/.git
└── notes/
```

Forest should detect the three Git repositories.

### Scan safeguards

Do not recursively crawl arbitrary giant filesystems without boundaries.

Provide:

* selected scan root;
* reasonable depth;
* ignored directories;
* cancellation;
* progress.

Ignore common heavy directories such as:

```text
node_modules
target
dist
build
.cache
```

when scanning for repositories.

## Repository list

Initial usable main view:

```text
Git Forest

Repositories

EXOG App     ~/Projects/exog-app
EXOG API     ~/Projects/exog-api
Game         ~/Projects/game
```

## Search

Provide basic repository fuzzy filtering.

## Remove from Forest

Removing a linked repository from Forest should only remove the index record.

It must not delete the repository from disk.

## Acceptance Criteria

User can:

* add a repository;
* scan a directory for repositories;
* see indexed repositories;
* search them;
* remove one from Forest;
* restart and retain index.

---

# Release 0.0.4 — Git Worktree Core

Status: **complete**.

Git is authoritative for worktree facts. SQLite stores Forest IDs and timestamps only. This release lists and reconciles worktrees (including external ones), inspects local status without network, creates a new branch from a local base under `~/forest/worktrees/<repo>/<slug>`, and removes with an explicit dirty/force preflight. Attaching an existing branch, deleting branches, pruning stale Git records, terminal launch, and agent launch remain later work.

## Goal

Build the core feature that justifies Git Forest.

## Worktree listing

For each repository, detect existing Git worktrees.

Forest should discover worktrees whether Forest created them or not.

Display:

```text
main
feat/risk-483
fix/report-export
```

With:

* worktree path;
* branch;
* HEAD;
* detached status;
* locked state where applicable.

## Worktree status

Calculate useful state:

```text
clean
dirty
untracked files
ahead
behind
detached
missing
```

Remote computations should not block core local behavior.

## Create worktree

User chooses:

```text
repository
base branch
new/existing branch
worktree name/path
```

Default location for managed worktrees:

```text
~/forest/worktrees/<repository>/<worktree>
```

Example:

```text
~/forest/worktrees/exog-app/feat-risk-483
```

Normalize filenames safely without changing the actual Git branch name unnecessarily.

## Branch creation

Support:

```text
create new branch from base
```

and later:

```text
attach existing branch
```

Avoid ambiguous destructive behavior when branch/worktree already exists.

## Validation

Before creation:

```text
repository exists
base exists
branch valid
branch availability checked
path availability checked
worktree does not conflict
```

## Remove worktree

Implement safe removal.

Before removal inspect:

```text
dirty?
untracked files?
active sessions?
directory exists?
Git knows worktree?
```

### Clean worktree

Allow normal removal.

### Dirty worktree

Require explicit confirmation.

### Force removal

May exist behind a deliberate advanced action.

Never default to force.

## External worktrees

Forest must correctly display worktrees created outside Forest.

## Tests

Create temporary Git repositories.

Cover at least:

```text
one worktree
multiple worktrees
new branch
existing branch conflict
dirty worktree
untracked files
detached worktree
missing directory
external worktree
safe removal
```

## Acceptance Criteria

Forest can reliably create, list, inspect, and safely remove Git worktrees.

This release should already be useful even without terminal or agent support.

---

# Release 0.0.5 — Terminal Provider System

> **UI already built.** The row and inspector actions exist in `components/deferred/TerminalActions.tsx`, rendered disabled. Passing an `onOpenTerminal` handler enables them; no markup change is needed. See "Deferred UI wiring".

## Goal

Open any worktree instantly in a terminal without coupling Forest to one terminal application.

## Provider contract

Create a terminal provider abstraction.

Responsibilities:

```text
detect availability
open directory
launch configured workspace
report launch failure
```

## Warp provider

Implement Warp first.

Required UX:

```text
Open worktree
       ↓
Warp available
       ↓
open as new tab in active Warp context when possible
       ↓
cwd = worktree
```

If no usable Warp instance exists, launch appropriately.

The user should not end up with unnecessary separate terminal windows.

## Terminal configuration

Settings:

```text
Default Terminal: Warp

Open Behavior:
● Auto
○ Tab
○ Window
```

For MVP:

```text
Auto
```

should favor tab reuse.

## Missing terminal

If Warp is unavailable, present a clear error rather than silently failing.

Later provider fallback can be added.

## Provider detection

Provider availability should be cached/rechecked sensibly.

Do not spawn expensive checks every time the launcher opens.

## Acceptance Criteria

From a worktree, one action opens Warp at the correct directory.

If Warp is already in use, Forest opens the workspace as a new tab rather than needlessly spawning another independent window.

---

# Release 0.0.6 — Agent Runner System

> **UI already built.** `components/deferred/AgentBadge.tsx` renders the session pill (pulsing dot, agent name, PID) and returns `null` while no session exists. The agent action in `TerminalActions` and the cockpit "Agents" filter pill activate from the same data. See "Deferred UI wiring".

## Goal

Launch CLI coding agents inside specific worktrees.

## Agent abstraction

Agent definitions should provide a launch specification.

Examples:

```text
Codex
Claude Code
OpenCode
Cursor CLI
Custom
```

## Detection

Forest should detect whether configured agent executables are available.

Status example:

```text
Codex        Installed
Claude Code  Installed
OpenCode     Installed
Cursor CLI   Missing
```

## Default agent

User can choose:

```text
Default agent: Codex
```

## Launch agent

Flow:

```text
Select worktree
       ↓
Select agent
       ↓
AgentRunner creates launch specification
       ↓
TerminalProvider receives it
       ↓
Warp tab opens at worktree
       ↓
agent command starts
```

Example conceptual result:

```text
cwd:
~/forest/worktrees/exog-app/risk-483

command:
codex
```

## Warp integration

For agent launch, Forest may generate/use an appropriate Warp Tab Config so startup commands execute naturally inside the new tab.

Temporary/generated configuration needs a cleanup strategy.

Do not leave uncontrolled configuration garbage behind.

## Custom agents

Initial custom-agent configuration may support:

```text
name
executable
arguments
```

Do not build a generalized arbitrary workflow engine yet.

## Security

Never interpolate paths into unsafe shell strings.

Arguments remain structured.

## Acceptance Criteria

User can launch at least:

```text
Codex
Claude Code
OpenCode
```

inside any Forest worktree using Warp.

---

# Release 0.0.7 — Quick Launcher

> **UI already built.** `features/launcher/QuickLaunch.tsx` implements the overlay, search, ranking (`results.ts`) and keyhints. This release adds the OS-global `Super + W` binding and window show/hide; the overlay currently opens on `Cmd/Ctrl+K` and from the L1 rail. See "Deferred UI wiring".

## Goal

Create the interaction that makes Git Forest faster than conventional Git GUIs.

## Global shortcut

Default concept:

```text
Super + W
```

Shortcut should be configurable later.

When invoked:

```text
hidden → show
visible → hide/focus appropriately
```

## Launcher design

Small frameless/compact window.

Primary focus immediately enters search.

Example:

```text
┌─────────────────────────────────────────────┐
│ 🌳 Search Git Forest...                    │
├─────────────────────────────────────────────┤
│ EXOG / feat/risk-483           Codex ●     │
│ EXOG / main                    idle        │
│ Game / feat-map                OpenCode ●  │
└─────────────────────────────────────────────┘
```

## Search entities

Search:

```text
repository names
worktree names
branch names
paths
```

Later:

```text
issues
PRs
agent sessions
```

## Keyboard actions

Initial design:

```text
Enter       Open worktree
A           Start agent
N           New worktree
D           Status/details
R           Remove
Tab         Open cockpit
Esc         Hide
↑ / ↓       Navigate
```

Shortcuts should not fire while conflicting with text editing.

## Performance target

Opening the launcher should not require a fresh synchronous scan of all repositories.

Flow:

```text
hotkey
   ↓
show cached Forest state
   ↓
background refresh
```

## Recency

Prefer recently used worktrees where query relevance is otherwise similar.

## Acceptance Criteria

A user can invoke Forest, find a worktree, and open it in a terminal without using the mouse.

This should be the first release where the intended product experience is clearly visible.

---

# Release 0.0.8 — Sessions & Process Tracking

## Goal

Know which workspaces and agents are active.

## Agent session model

Persist metadata such as:

```text
id
worktree_id
agent_id
launch_time
pid/process metadata where available
status
last_seen
exit_time
```

## Status states

Possible model:

```text
starting
running
exited
unknown
failed
```

Avoid pretending process detection is perfect.

## Reconciliation

At application start:

```text
load sessions
     ↓
inspect OS
     ↓
validate known processes
     ↓
mark running/exited/unknown
```

## Worktree display

Example:

```text
EXOG / feat/risk-483

Branch   feat/risk-483
Status   Dirty
Agent    Codex ● Running
Started  recently
```

## Multiple agents

Data model should allow multiple agent sessions per worktree even if initial UI emphasizes one primary active session.

## Relaunch

If a previous agent exited, user can launch another session.

## Resume

Do not claim generic "resume" support until a specific agent provides a reliable mechanism.

Differentiate:

```text
Open worktree
Launch new agent
Resume agent
```

where supported.

## Acceptance Criteria

Forest can distinguish approximately:

```text
running
finished
unknown
```

agent sessions after launches and application restarts.

---

# Release 0.0.9 — Safety, Reconciliation & Cleanup

## Goal

Make Forest trustworthy enough to use on real development repositories every day.

## Repository reconciliation

Detect when:

* indexed repo moved;
* indexed repo was deleted;
* Git metadata changed;
* worktree was manually removed;
* new external worktree appeared.

## Worktree reconciliation

Cases:

```text
Git record + directory
Git record + missing directory
directory + unexpected state
stale metadata
```

Forest should surface problems, not silently "repair" everything.

## Cleanup command

Provide safe maintenance action.

Potential operations:

```text
refresh repository
prune stale Git worktree records
remove stale Forest metadata
clean generated Warp config artifacts
remove finished session records
```

Each destructive cleanup should explain what will happen.

## Dangerous-action confirmation

Create consistent confirmation pattern.

Example:

```text
Remove worktree?

feat/risk-483 has:
• 3 modified files
• 1 untracked file

This may destroy uncommitted work.

Cancel
Force Remove
```

"Force Remove" should visually and behaviorally differ from ordinary actions.

## Errors

Introduce structured error classes between Rust and frontend.

Frontend should not interpret random stderr strings.

## Logging

Add local logs useful for support/debugging.

## Acceptance Criteria

Forest survives common external changes without corrupting its own state or destroying user work.

---

# Release 0.1.0 — Internal Alpha

## Goal

Combine releases 0.0.x into the first coherent end-to-end development workflow.

This is the first milestone intended for sustained real use.

## Required workflow

The developer should be able to:

```text
Launch Forest
    ↓
Search repository
    ↓
Create worktree
    ↓
Choose Codex
    ↓
Warp opens tab
    ↓
Codex starts in worktree
    ↓
Return to Forest later
    ↓
See active session
    ↓
Open worktree again
    ↓
Eventually remove worktree safely
```

## Alpha hardening

Perform real-world testing across several repositories.

Record:

* failures;
* unexpected Git layouts;
* naming issues;
* terminal edge cases;
* process-detection limitations;
* launcher UX friction.

## UX polish

Address:

* loading states;
* empty states;
* error presentation;
* keyboard focus;
* search ranking;
* navigation consistency.

## Acceptance Criteria

The developer can use Git Forest as part of normal daily development without immediately needing a shell workaround for basic Forest actions.

---

# Release 0.2.0 — Forest Cockpit

> **UI already built.** The cockpit shipped early against `docs/design.md`: four-tier shell, repository accordions, dense worktree rows with telemetry badges and commit drift, status filter pills, and the inspector panel. What remains for this release is the richer operational content, not the layout.

## Goal

Add the broader operational view.

The launcher remains optimized for speed.

The cockpit is optimized for understanding.

## Layout

Potential structure:

```text
┌─────────────────────────────────────────────────────┐
│ Git Forest                                  Search │
├───────────────┬─────────────────────────────────────┤
│ Repositories  │ EXOG APP                            │
│               │                                     │
│ EXOG App      │ main                    clean       │
│ EXOG API      │ ├─ feat/risk-483        Codex ●    │
│ Game          │ ├─ feat/report          dirty       │
│               │ └─ fix/navigation       idle        │
│               │                                     │
└───────────────┴─────────────────────────────────────┘
```

## Worktree cards/rows

Show useful information without becoming a Git client.

Possible fields:

```text
branch
path
clean/dirty
ahead/behind
agent state
last activity
terminal status where known
```

## Repository summary

Example:

```text
EXOG APP

4 worktrees
2 running agents
1 dirty workspace
```

## Actions

From cockpit:

```text
Open
Start agent
Create worktree
Refresh
Inspect
Remove
```

## Toggle from launcher

`Tab` or equivalent should move naturally between launcher and cockpit.

## Acceptance Criteria

A user with many simultaneous worktrees can understand their active development environment at a glance.

---

# Release 0.3.0 — Command Palette & Keyboard Completion

## Goal

Make essentially the entire common workflow keyboard operable.

## Command palette

Potential entries:

```text
New Worktree
Open Worktree
Launch Agent
Change Default Agent
Refresh Repository
Remove Worktree
Open Settings
Show Cockpit
```

## Contextual commands

Typing:

```text
> risk-483
```

selects context.

Then actions operate on that worktree.

## Action search

Support conceptual queries such as:

```text
> new worktree
> open exog
> agent risk-483
```

This does not need natural-language AI.

Simple deterministic command/search behavior is preferable.

## Shortcut configuration

Allow user to configure main global shortcut.

Detect conflicts where possible.

## Focus behavior

Thoroughly test:

```text
shortcut while Forest hidden
shortcut while Forest visible
shortcut while another app focused
Escape
Tab
arrow keys
typing immediately
```

## Acceptance Criteria

Routine Forest operations require minimal or no mouse interaction.

---

# Release 0.4.0 — Onboarding & Forest Setup

## Goal

Make a fresh installation understandable.

## First-run wizard

Potential flow:

### Welcome

```text
Welcome to Git Forest
```

### Forest root

Default:

```text
~/forest
```

Allow changing.

### Existing repositories

Choose:

```text
Scan a folder
Add individually
Skip
```

### Terminal

Detect available providers.

Initial recommendation:

```text
Warp
```

### Agents

Detect:

```text
Codex
Claude Code
OpenCode
Cursor CLI
```

### Shortcut

Default:

```text
Super + W
```

### Complete

Show:

```text
Repositories found: 8
Agents found: 3
Terminal: Warp

Open Forest
```

## Existing repo philosophy

Never pressure users to move repositories.

Present:

```text
Link existing repositories
```

as the safest default.

Managed repositories can come later.

## Acceptance Criteria

A first-time user can install and reach a useful Forest without editing configuration files.

---

# Release 0.5.0 — Tray, Background Lifecycle & Startup

> **UI already built.** `features/tray/TrayPanel.tsx` holds the menu body (counts, Quick Launch, New worktree, Settings), shown today as an in-app dropdown from the top bar. This release registers the native tray icon and background lifecycle. See "Deferred UI wiring".

## Goal

Make Forest feel like a persistent desktop utility rather than an ordinary windowed application.

## Single instance

Only one Forest application instance should normally own the local state.

Invoking Forest again should focus/show existing instance.

## Tray/menu

Provide basic menu such as:

```text
Open Git Forest
New Worktree
Active Agents: 3
Settings
Quit
```

Avoid turning tray UI into the primary interface.

## Background behavior

Closing/hiding launcher should not necessarily quit Forest.

Define explicit behavior:

```text
Esc → hide
close launcher → hide
Quit → terminate application
```

## Autostart

Optional setting:

```text
Start Git Forest at login
```

Default should be deliberate rather than surprising.

## Global shortcut lifecycle

Shortcut remains available while Forest runs in background.

## Acceptance Criteria

Forest can live quietly in the background and instantly appear when requested.

---

# Release 0.6.0 — Resilience & Large Forest Performance

## Goal

Handle developers with many repositories and worktrees.

## Performance scenarios

Test at least conceptually against:

```text
50 repositories
100 repositories
hundreds of branches
dozens of worktrees
multiple active agents
```

## Refresh strategy

Do not scan everything constantly.

Introduce refresh concepts:

```text
fresh
stale
refreshing
error
```

## Bounded concurrency

Git status checks should run with bounded concurrency.

Do not spawn hundreds of Git processes simultaneously.

## Lazy details

Launcher results should use lightweight cached summaries.

Detailed Git state can load when:

* selected;
* visible;
* explicitly refreshed;
* stale enough to justify refresh.

## File watching

Investigate filesystem watchers only where useful.

Do not make watchers authoritative.

Git remains the source of truth.

## Database indexes

Add indexes only based on real query patterns.

Likely search fields:

```text
repository
branch
worktree
last_used
```

## Acceptance Criteria

Forest remains responsive with a realistically large local development environment.

---

# Release 0.7.0 — Testing, Packaging & Reliability

## Goal

Prepare Git Forest to behave like actual software rather than a development prototype.

## Automated test layers

### Rust unit tests

Domain logic.

### Git integration tests

Temporary real repositories.

### Frontend tests

Important components and state.

### Command boundary tests

Tauri command behavior where practical.

### E2E smoke tests

At minimum verify:

```text
application starts
repository can be registered
worktree lifecycle works
```

## Failure testing

Test:

```text
Git missing
Warp missing
agent missing
invalid repo
permission denied
branch collision
worktree collision
dirty removal
database unavailable
corrupt/stale path
process dies immediately
```

## Migrations

Verify upgrading from older development DB schema.

Never require users to delete their state for ordinary migrations.

## Packaging

Produce Linux install artifact(s).

Installer/package should handle required desktop integration cleanly.

## Version reporting

Expose version in:

```text
About
logs
diagnostic output
```

## Acceptance Criteria

A clean machine can install and run Forest without development tooling beyond necessary system prerequisites.

---

# Release 0.8.0 — Public Beta Candidate

## Goal

Freeze major MVP architecture and focus on usage feedback.

## Feature freeze

Avoid adding major new product areas.

Focus on:

```text
bugs
usability
performance
reliability
documentation
installation
```

## Settings

Finalize MVP settings:

```text
Forest root
terminal provider
terminal behavior
default agent
agent definitions
global shortcut
autostart
appearance basics
```

## Diagnostics

Add a simple diagnostic view/export containing non-secret information such as:

```text
Forest version
OS
Git version
terminal providers
agent detection
repository count
worktree count
database version
recent application errors
```

Never include secrets automatically.

## UX review

Evaluate every common action for:

```text
keyboard access
mouse access
loading feedback
error feedback
confirmation
focus
empty state
```

## Acceptance Criteria

No known architectural blocker remains for 1.0.

---

# Release 0.9.0 — Release Candidate

## Goal

Treat the application as though it were already 1.0 and find reasons it should not ship.

## No major features

Only:

```text
bug fixes
polish
documentation
packaging
compatibility
performance
```

## Clean installation test

Test from scratch.

```text
install
launch
onboarding
scan repositories
create worktree
launch Codex
open Warp tab
restart Forest
reopen workspace
remove worktree
```

## Upgrade test

Upgrade from beta state.

Existing:

```text
repositories
settings
worktrees
agent definitions
```

must survive.

## Destructive-action audit

Review every native operation capable of:

```text
deleting
moving
removing
overwriting
executing
```

Confirm user intent and validation.

## Security audit

Audit:

```text
Tauri permissions
shell invocation
path handling
custom commands
Warp configuration
database
logs
```

## Documentation

Finalize:

```text
README
installation
quick start
configuration
troubleshooting
architecture overview
AGENTS.md
```

## Acceptance Criteria

No severity-1 bugs.

No known issue that risks silently losing repository/worktree data.

---

# Release 1.0.0 — Git Forest MVP

## Definition

Git Forest 1.0 is a reliable local worktree + agent launcher for daily development.

It is not yet the full long-term agent orchestration platform.

## Required User Story 1 — Existing Repository

```text
I have ~/Projects/exog-app.

I install Forest.

Forest finds/indexes it.

Forest does not move it.
```

---

## Required User Story 2 — Create Workspace

```text
Super + W

N

Repository:
EXOG App

Base:
main

Branch:
feat/risk-483

Agent:
Codex

Create
```

Forest creates:

```text
~/forest/worktrees/exog-app/feat-risk-483
```

---

## Required User Story 3 — Agent Launch

Forest opens:

```text
Warp
└── new tab
    └── cwd: feat-risk-483
        └── Codex
```

If Warp is already open, reuse its tab workflow rather than unnecessarily creating separate application instances/windows.

---

## Required User Story 4 — Multiple Parallel Worktrees

Forest can simultaneously represent:

```text
EXOG
├── feat/risk-483       Codex ●
├── feat/report         Claude ●
├── fix/navigation      OpenCode ●
└── main                idle
```

Each exists independently.

---

## Required User Story 5 — Return Later

After hiding/restarting Forest, the user can understand:

```text
which repositories exist
which worktrees exist
which sessions were running
which sessions are no longer running
which worktrees are dirty
```

---

## Required User Story 6 — Safe Cleanup

When the user finishes work:

```text
Remove feat/risk-483
```

Forest verifies safety.

Dirty work is never silently destroyed.

---

# 1.0 Functional Checklist

## Repository

* [x] Add existing repository.
* [x] Scan folder.
* [x] Search repositories.
* [x] Remove linked repository from Forest.
* [x] Persist repository index.

## Worktrees

* [x] List existing worktrees.
* [x] Detect externally created worktrees.
* [x] Create worktree.
* [x] Create branch.
* [x] Choose base branch.
* [x] Display clean/dirty state.
* [x] Display basic branch relationship.
* [x] Safely remove worktree.
* [x] Handle stale worktree metadata.

## Terminals

* [ ] Terminal provider interface.
* [ ] Warp provider.
* [ ] Open worktree.
* [ ] Prefer tab reuse.
* [ ] Detect missing Warp.
* [ ] Configurable default behavior.

## Agents

* [ ] Agent runner interface.
* [ ] Codex.
* [ ] Claude Code.
* [ ] OpenCode.
* [ ] Cursor CLI where supported.
* [ ] Custom agent command.
* [ ] Agent detection.
* [ ] Default agent.
* [ ] Launch agent in selected worktree.

## Sessions

* [ ] Persist session metadata.
* [ ] Track launch.
* [ ] Reconcile after restart.
* [ ] Running/exited/unknown states.
* [ ] Associate agent session with worktree.

## Quick Launcher

* [ ] Global shortcut.
* [ ] Immediate focus.
* [ ] Fuzzy search.
* [ ] Keyboard result navigation.
* [ ] Open action.
* [ ] New worktree action.
* [ ] Agent action.
* [ ] Remove action.
* [ ] Escape to hide.

## Cockpit

* [ ] Repository list.
* [ ] Worktree list.
* [ ] Worktree state.
* [ ] Agent status.
* [ ] Quick actions.
* [ ] Search/filter.

## Application

* [ ] SQLite migrations.
* [ ] Structured errors.
* [ ] Logging.
* [ ] Single-instance behavior.
* [ ] Tray.
* [ ] Optional autostart.
* [ ] Settings.
* [ ] First-run onboarding.
* [ ] Linux installer/package.
* [ ] Upgrade-safe state.

## Engineering

* [ ] Bun-only JS tooling.
* [ ] TypeScript strict.
* [ ] Rust tests.
* [ ] Frontend tests.
* [ ] Git integration tests.
* [ ] CI.
* [ ] Documentation.
* [ ] Security review.
* [ ] Destructive-action review.

---

# Definition of 1.0 Done

Git Forest reaches 1.0 when it is reasonable to trust it with real repositories every day.

That means the product must be:

```text
fast
predictable
keyboard-friendly
safe
recoverable
understandable
```

Correctness beats feature count.

---

# Future Work

Everything below is directional.

Major-version numbering represents product themes, not guaranteed implementation order.

---

# Release 2.0.0 — Developer Workflow Integrations

## Theme

Connect Forest worktrees to the development systems surrounding them.

## GitHub

Potential capabilities:

```text
PR associated with worktree
PR status
CI status
review status
open PR
create PR
checkout PR
```

Possible cockpit:

```text
feat/risk-483
Codex ●
PR #483
CI ✓
2 reviews
```

## GitLab

Provider architecture can later mirror GitHub concepts.

## Linear

Associate:

```text
Linear Issue
    ↓
Worktree
    ↓
Agent
    ↓
PR
```

Potential creation:

```text
Select ENG-483
       ↓
Forest proposes
feat/eng-483-risk-dashboard
       ↓
create worktree
       ↓
launch agent with issue context
```

## Issue context

Forest may supply selected issue information to configured agents.

This should remain explicit and inspectable.

## PR lifecycle

Eventually:

```text
Task
  ↓
Worktree
  ↓
Agent
  ↓
Commit
  ↓
PR
  ↓
Review
  ↓
Merge
  ↓
Cleanup
```

Forest should assist rather than automatically commit/push without clear user intent.

---

# Release 3.0.0 — Remote Forest

## Theme

Separate the Forest control plane from the machine where work executes.

Potential architecture:

```text
Desktop Git Forest
        │
        ▼
Forest Protocol/API
        │
  ┌─────┴─────┐
  ▼           ▼
Local       Remote
Daemon      Daemon
              │
              ▼
         Worktrees
         Agents
```

## Remote hosts

Potential targets:

```text
personal server
Railway
VM
cloud development machine
homelab
```

## Remote workspace

The same conceptual workflow:

```text
Create worktree
      ↓
choose execution location
      ↓
Local / Remote
```

## Remote agents

Potential:

```text
Codex CLI
Claude Code
OpenCode
Warp/Oz
custom agent harnesses
```

## Session transport

Investigate:

```text
SSH
WebSocket
purpose-built RPC
```

Security must be treated as a primary design problem.

## Cross-device control

Once a daemon/API exists, other interfaces become possible:

```text
desktop
browser
phone
TUI
CLI
```

---

# Release 4.0.0 — Visual Forest

## Theme

Move beyond lists into visual development topology.

Do not implement merely because the name "Forest" suggests a graph.

It must provide operational value.

Potential visualization:

```text
                       MAIN
                        │
          ┌─────────────┼──────────────┐
          │             │              │
      RISK-483      REPORT-121      NAV-44
       Codex ●        Claude ●       idle
          │             │
       PR #981        dirty
       CI ✓
```

## Nodes

Possible information:

```text
repository
worktree
branch
agent
PR
CI
task
```

## Visual actions

Potential:

```text
open
launch agent
inspect diff
open PR
remove
merge
```

## Graph principles

The view should show **development topology**, not merely reproduce a Git commit graph.

The useful relationship is:

```text
task
worktree
agent
delivery state
```

---

# Release 5.0.0 — Agent Control Plane

## Theme

Forest evolves from launcher to agent-session supervisor.

## Agent templates

Examples:

```text
Frontend Agent
Backend Agent
Review Agent
Bugfix Agent
Research Agent
```

Each could define:

```text
runner
model
permissions
startup prompt
tools
environment
```

## Model selection

Agent configuration may expand from:

```text
runner: Codex
```

to:

```text
runner: Codex
model: selected model
profile: implementation
```

Forest should never assume one vendor.

## Agent session management

Potential:

```text
start
stop
resume
inspect
rename
archive
```

Where individual agent runtimes actually support those semantics.

## Task bootstrapping

Create:

```text
Issue
   ↓
Worktree
   ↓
Agent
   ↓
Initial context
```

## Multiple agents

Potentially:

```text
Worktree
├── implementation agent
└── review agent
```

But avoid agent swarms without a concrete user problem.

---

# Release 6.0.0 — Workflow Automation

## Theme

Allow deterministic workflows around worktrees and agents.

Potential examples:

```text
When worktree created:
  install dependencies

When agent launched:
  attach task context

When PR merged:
  suggest cleanup

When CI fails:
  show Forest alert
```

## Hooks

Potential lifecycle:

```text
before_worktree_create
after_worktree_create
before_agent_launch
after_agent_exit
before_worktree_remove
```

Hooks must have strong security and observability.

## Templates

Example:

```text
Next.js Feature
Rust Feature
Bugfix
Hotfix
Experiment
```

Template could define:

```text
base branch
branch naming
setup commands
default agent
terminal layout
```

---

# Release 7.0.0 — Team Forest

## Theme

Optional collaborative/shared operational state.

Potential capabilities:

```text
shared workspace templates
team agent definitions
shared repository catalog
workspace handoff
shared workflow rules
```

Local-first behavior should remain valuable.

Do not require a cloud account for fundamental Git worktree management.

---

# Long-Term North Star

The mature product could provide one consistent interface for:

```text
Repositories
Tasks
Worktrees
Agents
Terminals
Pull Requests
CI
Local execution
Remote execution
```

A future Forest might look like:

```text
Git Forest

EXOG
├── RISK-483
│   ├── Worktree          feat/risk-483
│   ├── Agent             Codex / GPT-X ●
│   ├── Environment       Railway
│   ├── Issue             Linear RISK-483
│   ├── PR                #981
│   └── CI                ✓
│
├── REPORT-121
│   ├── Worktree          feat/report
│   ├── Agent             Claude ●
│   ├── Environment       Local
│   └── Status            Dirty
│
└── NAV-44
    ├── Worktree          feat/nav
    └── Status            Idle
```

At that point Git Forest is no longer simply a worktree manager.

It becomes:

> **A developer workspace and coding-agent control plane built around Git worktrees.**

The path to that product begins by making the local worktree lifecycle exceptionally reliable.

That is the purpose of the 1.0 roadmap.
