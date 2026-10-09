# Git Forest — Agent Instructions

> Instructions for AI coding agents and human contributors working in the Git Forest repository.

Git Forest is a **keyboard-first Git worktree and local agent session manager**.

The application manages repositories, Git worktrees, terminals, coding-agent sessions, and the relationships between them.

The guiding product model is:

```text
Forest
└── Repository
    └── Worktree
        ├── Branch
        ├── Terminal Session
        └── Agent Session
```

Git Forest should make it extremely fast to:

1. find a repository or worktree;
2. create an isolated worktree;
3. open it in the user's terminal;
4. launch a chosen CLI coding agent;
5. understand what is currently running;
6. return to an existing workspace;
7. safely clean up completed worktrees.

The application is **not** intended to replace Git, terminals, IDEs, or coding agents.

It is the control plane that connects them.

---

# 1. Golden Rules

These rules override convenience.

## 1.1 Never commit unless explicitly instructed

Agents MUST NOT create Git commits unless the user explicitly asks for a commit.

Do not interpret any of the following as permission to commit:

* "implement this"
* "finish this ticket"
* "fix this"
* "make it work"
* "complete the phase"
* "prepare this"
* "run the tests"

Only commit when the user explicitly requests it.

Examples of explicit permission:

```text
Commit these changes.
Create a commit.
Commit phase 0.0.3.
Commit and push this.
```

When no commit was requested:

1. make the changes;
2. run appropriate validation;
3. report what changed;
4. leave the working tree for the user to inspect.

---

# 2. Never Push Unless Explicitly Instructed

A request to commit is **not** permission to push.

Do not run:

```bash
git push
```

unless the user explicitly asks.

A request to push does not automatically authorize opening a pull request unless that is also requested.

---

# 3. No Destructive Git Operations Without Explicit Approval

Never perform destructive operations merely to make the working tree convenient.

Do not run commands such as:

```bash
git reset --hard
git clean -fd
git clean -fdx
git checkout -- .
git restore .
git branch -D
git worktree remove --force
git push --force
git push --force-with-lease
```

unless explicitly requested and the consequences are understood.

Never discard changes you did not create.

Never overwrite user work to resolve an implementation problem.

If unrelated changes already exist, work around them.

---

# 4. Inspect Before Editing

At the beginning of a task, inspect relevant repository state.

At minimum, normally check:

```bash
git status --short
git branch --show-current
```

Then inspect the files relevant to the task.

Do not assume:

* the repository is clean;
* the user is on `main`;
* dependencies are installed;
* the current worktree is the primary worktree;
* the previous agent finished its work;
* documentation reflects implementation perfectly.

---

# 5. Do Not Modify Unrelated Work

Keep changes scoped to the current task.

Do not:

* reformat unrelated files;
* rename unrelated components;
* "clean up" neighboring code;
* update unrelated dependencies;
* modify unrelated configuration;
* rewrite architecture during a feature task.

If unrelated problems are discovered, mention them in the final summary rather than fixing them automatically.

---

# 6. Read Project Documentation First

Before significant implementation work, read:

```text
AGENTS.md
ROADMAP.md
README.md
```

If the relevant phase has a ticket or design document, read that too.

Documentation hierarchy:

```text
User instruction
    ↓
Ticket / task specification
    ↓
AGENTS.md
    ↓
ROADMAP.md
    ↓
README.md
    ↓
existing implementation
```

If these conflict materially, stop making assumptions and surface the conflict.

---

# 7. Technology Stack

Git Forest uses the following primary stack.

## Desktop application

```text
Tauri 2.x
Rust
React 19.x
TypeScript
Vite
```

## JavaScript package manager and runtime

Use:

```text
Bun
```

Do not introduce:

```text
npm
yarn
pnpm
```

for repository package-management tasks.

Examples:

```bash
bun install
bun add <package>
bun remove <package>
bun run dev
bun run build
bun test
```

The JavaScript lockfile belongs to Bun.

Do not create additional package-manager lockfiles.

---

# 8. Rust Tooling

Rust tooling uses the standard Rust ecosystem.

Allowed:

```bash
cargo check
cargo test
cargo clippy
cargo fmt
cargo build
```

Using Bun does not replace Cargo for Rust dependencies.

---

# 9. TypeScript Rules

TypeScript should run in strict mode.

Avoid:

```ts
any
```

unless interacting with an unavoidable external boundary.

Prefer:

```ts
unknown
```

followed by explicit narrowing.

Public interfaces should have clear types.

Prefer domain types over arbitrary object structures.

Good:

```ts
type WorktreeId = string;

interface WorktreeSummary {
  id: WorktreeId;
  branch: string;
  path: string;
  dirty: boolean;
}
```

Avoid passing loosely shaped objects throughout the application.

---

# 10. Rust Rules

Rust owns privileged/native behavior.

This includes:

* Git process execution;
* filesystem operations;
* process inspection;
* terminal integration;
* agent process management;
* persistence;
* OS integration;
* path validation;
* destructive action guards.

The React application should not become a second backend.

Prefer:

```text
React
    ↓ typed command
Tauri command boundary
    ↓
Rust application service
    ↓
Git / OS / SQLite
```

Avoid:

```text
React
    ↓
arbitrary shell command
```

---

# 11. Architecture Principles

## 11.1 UI is a client

The UI presents and manipulates state.

It does not own authoritative Git or process state.

The long-term architecture is:

```text
                ┌──────────────┐
                │ React UI     │
                └──────┬───────┘
                       │
                Tauri Commands
                       │
                ┌──────▼───────┐
                │ Forest Core  │
                └──────┬───────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
      Git          Persistence      OS / Processes
```

The core should eventually be usable by additional interfaces such as:

```text
Desktop UI
CLI
TUI
Remote client
```

Do not couple domain behavior unnecessarily to React.

---

# 12. Recommended Repository Structure

The initial structure should remain understandable rather than excessively abstract.

```text
git-forest/
├── AGENTS.md
├── ROADMAP.md
├── README.md
├── package.json
├── bun.lock
│
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── types/
│       │
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── commands/
│       │   │   ├── domain/
│       │   │   ├── git/
│       │   │   ├── worktrees/
│       │   │   ├── terminals/
│       │   │   ├── agents/
│       │   │   ├── processes/
│       │   │   ├── persistence/
│       │   │   ├── platform/
│       │   │   └── main.rs
│       │   ├── migrations/
│       │   └── Cargo.toml
│       │
│       └── package.json
│
├── packages/
│   └── shared/
│
├── docs/
│   ├── architecture/
│   └── decisions/
│
└── tests/
    └── fixtures/
```

Do not create separate Rust crates for every concept prematurely.

Split modules into crates only when a real boundary emerges.

---

# 13. Git Operations

For MVP, prefer the installed Git executable over implementing Git semantics ourselves.

Reasons are architectural rather than cosmetic:

* users already have Git configured;
* credentials belong to Git;
* hooks belong to Git;
* SSH configuration belongs to the user's environment;
* worktree behavior should match what users get from Git directly.

Prefer machine-readable Git output.

Examples:

```bash
git worktree list --porcelain
git status --porcelain=v2 --branch
git for-each-ref
git rev-parse
```

Do not parse colorized human-readable terminal output if a stable structured form exists.

---

# 14. Never Build Shell Commands by Concatenating User Input

Bad:

```rust
let command = format!("git worktree add {} {}", path, branch);
```

Prefer executable + argument arrays.

Conceptually:

```text
program: git

args:
- worktree
- add
- -b
- <branch>
- <path>
- <base>
```

Paths and branch names must remain separate arguments.

This rule applies to:

* Git;
* terminals;
* coding agents;
* editors;
* custom commands.

---

# 15. Worktree Safety

Worktrees are the heart of the application.

Operations must be conservative.

Before removing a worktree, inspect at least:

* whether it exists;
* whether Git recognizes it;
* dirty state;
* untracked files;
* active agent sessions;
* active terminal/session state when detectable;
* whether its branch has unmerged work when relevant.

Unsafe removal must require explicit user action.

Never silently force-remove a dirty worktree.

---

# 16. Repository Ownership Model

Forest supports two repository modes.

## Managed

```text
~/forest/repos/project
```

Forest controls its location.

## Linked

```text
~/Projects/project
```

Forest indexes the repository but does not relocate it.

Do not require users to move their existing repositories into Forest.

---

# 17. Default Forest Directory

The default managed root is:

```text
~/forest
```

Suggested layout:

```text
~/forest/
├── repos/
├── worktrees/
└── state/
```

Example:

```text
~/forest/
├── repos/
│   ├── acme-app/
│   └── acme-api/
│
├── worktrees/
│   ├── acme-app/
│   │   ├── feat-auth-142/
│   │   └── fix-dashboard/
│   │
│   └── acme-api/
│       └── feat-export/
│
└── state/
```

Application database/configuration should use appropriate OS application-data directories rather than relying exclusively on files inside this tree.

---

# 18. Terminal Provider Architecture

Terminal integration must use an adapter boundary.

Conceptually:

```rust
trait TerminalProvider {
    fn id(&self) -> TerminalProviderId;
    fn is_available(&self) -> Result<bool>;
    fn open_directory(&self, path: &Path) -> Result<()>;
    fn launch_command(
        &self,
        path: &Path,
        command: &AgentCommand,
    ) -> Result<LaunchResult>;
}
```

Initial provider:

```text
Warp
```

Later:

```text
System Default
Ghostty
Kitty
GNOME Terminal
WezTerm
others
```

Do not place Warp-specific behavior in generic worktree code.

---

# 19. Warp Behavior

Desired default behavior:

```text
Launch worktree
       ↓
Is Warp available?
       ↓
      yes
       ↓
Open worktree in Warp
       ↓
Prefer active Warp window/new tab
```

For an agent:

```text
Launch Agent
     ↓
Generate/open appropriate Warp tab/session
     ↓
cwd = selected worktree
     ↓
startup command = selected agent
```

Warp-specific implementation belongs entirely inside the Warp terminal adapter.

If Warp changes its external integration later, the rest of Forest should remain unaffected.

---

# 20. Agent Runner Architecture

Coding agents also use adapters.

Conceptually:

```rust
trait AgentRunner {
    fn id(&self) -> AgentRunnerId;
    fn detect(&self) -> Result<AgentAvailability>;
    fn launch_spec(
        &self,
        context: &LaunchContext,
    ) -> Result<AgentLaunchSpec>;
}
```

Initial targets:

```text
Codex CLI
Claude Code
OpenCode
Cursor CLI
Custom command
```

Agent providers should generally describe how an agent should be launched.

They should not duplicate terminal behavior.

Correct model:

```text
Worktree
    ↓
Agent Runner
    ↓
Launch Specification
    ↓
Terminal Provider
```

---

# 21. Agent Configuration

Do not hardcode all agent commands permanently.

Allow configuration resembling:

```toml
[agents.codex]
command = "codex"

[agents.claude]
command = "claude"

[agents.opencode]
command = "opencode"
```

Eventually custom runners may resemble:

```toml
[agents.my-agent]
command = "my-agent"
args = ["--interactive"]
```

Never execute arbitrary configuration without presenting clear trust boundaries.

---

# 22. Process State Is Ephemeral

Never assume a process stored in SQLite still exists.

Persistent state can tell Forest:

> A Codex session was launched with PID 123.

The operating system determines whether PID 123 still represents that session.

At startup:

```text
load persisted sessions
        ↓
reconcile with OS
        ↓
running / exited / unknown
```

Do not display stale persisted state as live truth.

---

# 23. State Model

Keep core domain concepts explicit.

Expected concepts include:

```text
Repository
Worktree
Branch
TerminalProvider
AgentDefinition
AgentSession
WorkspaceSession
ForestConfiguration
```

Likely relationship:

```text
Repository 1 ─── * Worktree

Worktree 1 ─── * AgentSession

Worktree 1 ─── * WorkspaceSession
```

Do not let database rows become the domain model automatically.

---

# 24. Persistent State

SQLite is for Forest metadata.

Examples:

* indexed repositories;
* user labels;
* repository mode;
* worktree metadata;
* launch history;
* agent session metadata;
* application preferences;
* provider configuration;
* recent items.

Git remains authoritative for Git facts.

Do not duplicate Git history into SQLite unless there is a specific product requirement.

---

# 25. Reconciliation

External changes are expected.

Users may run:

```bash
git worktree add
git worktree remove
git branch
```

outside Forest.

Forest must tolerate this.

Therefore:

```text
Stored state
     +
Filesystem
     +
Git state
     +
Process state
     ↓
Reconciliation
     ↓
Current Forest state
```

Do not assume Forest is the only actor touching repositories.

---

# 26. Frontend Principles

Git Forest is keyboard-first.

Every important action should eventually be accessible without the mouse.

Primary interaction surfaces:

```text
Quick Launcher
Cockpit
Tray/Menu
```

The launcher is the fastest path.

The cockpit is the richer path.

Neither should require the other.

---

# 27. Quick Launcher

Target behavior:

```text
Super + W

Search...
```

Results may include:

```text
Repository
Worktree
Branch
Action
```

Examples:

```text
Acme / main
Acme / feat-auth-142
Game / feat-map-generation
```

Common actions:

```text
Enter   Open
A       Agent
N       New worktree
D       Diff/status
R       Remove
Tab     Cockpit
Esc     Hide
```

Exact shortcuts may evolve.

Architecture should not hardcode shortcut handling throughout arbitrary components.

---

# 28. UI Performance

The quick launcher should feel immediate.

Avoid unnecessary work when opening it.

Do not:

* rescan every repository synchronously before showing the window;
* rebuild the entire database;
* block on remote Git operations;
* fetch from GitHub;
* execute expensive status checks serially.

Prefer:

```text
show cached UI immediately
        ↓
refresh stale information asynchronously
        ↓
update UI
```

---

# 29. Avoid Network Dependencies in Core MVP Flow

The fundamental MVP should work offline.

Creating and managing local worktrees must not require:

* GitHub;
* GitLab;
* Linear;
* cloud accounts;
* remote agents;
* analytics services.

Those are later integrations.

---

# 30. Security Boundaries

Treat the following as untrusted:

* repository names;
* branch names;
* filesystem paths;
* custom terminal commands;
* custom agent commands;
* imported configuration;
* external Git output where relevant.

Never interpolate untrusted values into a shell string.

Do not expose broad Tauri shell permissions to the frontend for convenience.

Prefer narrow Rust commands.

---

# 31. Tauri Commands

Tauri commands should express business intent.

Good:

```text
list_repositories
list_worktrees
create_worktree
remove_worktree
open_worktree
launch_agent
get_agent_sessions
```

Avoid generic commands such as:

```text
execute_shell
run_command
run_git
```

unless they are internal Rust functions rather than frontend-exposed commands.

The UI should request an action, not arbitrary native execution.

---

# 32. Error Handling

Never swallow operational errors.

User-facing operations should return enough structured information to explain failure.

Example categories:

```text
GitNotInstalled
RepositoryNotFound
InvalidRepository
BranchAlreadyExists
WorktreeAlreadyExists
DirtyWorktree
TerminalUnavailable
AgentUnavailable
PermissionDenied
ProcessLaunchFailed
DatabaseError
```

Avoid making the UI parse human-readable error strings.

---

# 33. Logging

Logs should help diagnose:

* Git command failures;
* worktree reconciliation;
* provider detection;
* agent launching;
* process lifecycle;
* configuration loading;
* database migrations.

Do not log secrets.

Avoid logging full environment-variable sets.

---

# 34. Testing Requirements

Changes should include tests when behavior can reasonably be tested.

## TypeScript

Use the repository's Bun-based testing setup.

Run relevant tests with:

```bash
bun test
```

## Rust

Use:

```bash
cargo test
```

For meaningful Rust changes also consider:

```bash
cargo clippy
cargo fmt --check
```

---

# 35. Git Testing

Never run destructive Git tests against the developer's actual repositories.

Create temporary repositories.

Tests should be able to generate fixtures resembling:

```text
temp/
└── repo/
    ├── .git/
    ├── main
    └── worktree
```

Test situations such as:

* clean repository;
* dirty repository;
* untracked files;
* detached HEAD;
* existing branch;
* multiple worktrees;
* removed worktree directory;
* manually-created worktree;
* stale worktree metadata.

---

# 36. Dependencies

Before adding a dependency, ask whether the standard library or existing dependency already solves the problem.

Avoid adding packages for trivial helpers.

When adding dependencies:

1. use Bun for JS/TS dependencies;
2. use Cargo for Rust dependencies;
3. explain major new architectural dependencies in the change summary;
4. do not update unrelated dependencies.

---

# 37. Formatting and Linting

Use project-provided scripts.

Typical checks should eventually include:

```bash
bun run lint
bun run typecheck
bun test
bun run build
cargo fmt --check
cargo clippy
cargo test
```

Do not invent alternative formatting rules during an implementation task.

---

# 38. Documentation

Update documentation when changing:

* architecture;
* configuration structure;
* provider interfaces;
* persistence model;
* development commands;
* user-visible behavior;
* release scope.

Small internal implementation changes do not require documentation churn.

---

# 39. Architecture Decisions

Important architectural decisions should eventually be recorded under:

```text
docs/decisions/
```

Examples:

```text
0001-use-tauri.md
0002-use-git-cli.md
0003-use-sqlite.md
0004-terminal-provider-interface.md
0005-agent-runner-interface.md
```

Do not create an ADR for every minor decision.

---

# 40. No Premature Features

Before implementing something, check whether it belongs to the current roadmap phase.

Do not opportunistically implement:

* GitHub integrations;
* Linear integrations;
* remote agents;
* cloud sync;
* visual node graphs;
* collaboration;
* embedded terminals;
* embedded code editors;
* AI orchestration;

during early foundation phases unless explicitly requested.

Build the smallest correct foundation for the current milestone.

---

# 41. No Premature Abstraction

Avoid turning every implementation concept into:

* a trait;
* a generic;
* a plugin system;
* a separate crate;
* a registry;
* a factory;
* an event bus.

Provider boundaries are expected for:

```text
Terminals
Agents
```

Other abstractions should emerge from actual requirements.

---

# 42. Linux First, Portable Architecture

The initial MVP targets desktop Linux first.

Do not compromise the Linux experience merely for hypothetical portability.

However:

* isolate platform-specific code;
* avoid Linux assumptions in domain models;
* avoid hardcoding `/home/...`;
* use proper path APIs;
* keep terminal integrations behind providers.

Later macOS and Windows support should not require rewriting the Forest domain.

---

# 43. Accessibility

Keyboard-first does not mean keyboard-only.

UI changes should preserve:

* visible focus;
* semantic controls;
* reasonable labels;
* keyboard navigation;
* screen-reader-compatible structure where applicable;
* sufficient contrast.

Do not implement interactions requiring hover alone.

---

# 44. User Confirmation for Dangerous Actions

The application should distinguish:

```text
safe/reversible
```

from:

```text
destructive
```

Examples requiring elevated caution:

* deleting a dirty worktree;
* deleting an unmerged branch;
* force-removing a worktree;
* moving managed repositories;
* deleting Forest state.

Prefer explicit confirmation over clever automation.

---

# 45. Final Response After Agent Work

When finishing a coding task, report:

## Changed

What was implemented.

## Validation

Commands/tests run and their results.

## Notes

Anything important the user should know.

## Not Done

Only when relevant: requested pieces that could not be completed.

Do not claim tests passed unless they were actually run.

Do not say an implementation is complete when known parts remain unfinished.

---

# 46. Before Finishing a Task

Normally inspect:

```bash
git status --short
```

Confirm that changes match the requested scope.

Do not commit unless explicitly requested.

---

# 47. Definition of Good Agent Behavior

A good Git Forest coding agent:

* reads before editing;
* understands the current roadmap phase;
* changes the minimum necessary surface;
* preserves user work;
* keeps native privileges in Rust;
* uses typed boundaries;
* uses Bun consistently;
* writes tests for meaningful domain behavior;
* validates its work;
* avoids destructive Git actions;
* avoids premature features;
* leaves the repository understandable;
* does not commit or push without permission.

When uncertain, prefer a smaller, safer implementation that keeps future options open.
