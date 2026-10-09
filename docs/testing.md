# Manual QA checklist

Automated tests cover the Rust core and the React UI. These manual checks cover the parts that need a real desktop session: Warp, the global shortcut, and live agent processes.

Use a disposable Git repository with an initial `main` commit. Never use a developer repository for destructive scenarios.

After `bun run dev`:

## Remote branch worktrees (0.1.1)

1. Link a repository that already has modified and untracked files; confirm those files remain untouched after linking.
2. Open Create worktree; confirm the dialog lists cached local and remote-tracking refs and does not fetch until you choose Fetch remotes.
3. From another clone, push a new branch. Activate Fetch remotes, then select `origin/<branch>` as the base.
4. Create the worktree and confirm Git created a new local branch that tracks the selected remote branch (`branch.<name>.remote` / `merge`).
5. Confirm ignored root `.env` copy and optional agent launch still work, including Launch anyway / Retry launch without creating a second worktree.
6. Confirm the dirty primary checkout is unchanged after fetch and create.

## Alpha smoke

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
