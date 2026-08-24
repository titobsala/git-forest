/**
 * Quick Launch command registry — docs/design.md section 4.3.
 *
 * Commands are built from a plain context object rather than read out of
 * React state, so the whole registry — which entries exist, which are
 * disabled, how they rank — is testable without rendering anything.
 *
 * Entries that act on a selection carry it in `subtitle` and go disabled with
 * a reason when there is nothing selected, which is the flat-list answer to
 * context: no submenu is needed for the common case.
 */

import type { ShortcutId } from "../../lib/keymap";
import type { ViewId } from "../../app/views";
import type { Repository, ThemePreference, Worktree } from "../../types/forest";
import { score } from "./score";

export type CommandId =
  | "view.cockpit"
  | "view.agents"
  | "view.settings"
  | "panel.repositories"
  | "panel.inspector"
  | "theme.system"
  | "theme.light"
  | "theme.dark"
  | "worktree.new"
  | "worktree.terminal"
  | "worktree.agent"
  | "worktree.remove"
  | "repository.link"
  | "repository.scan"
  | "repository.refresh"
  | "repository.remove";

export interface Command {
  id: CommandId;
  title: string;
  /** Trailing context: the target it acts on, or why it cannot run. */
  subtitle?: string;
  /** Matched by the query but never rendered. */
  keywords?: string;
  /** Renders a keyhint chip when the command also has a physical binding. */
  shortcut?: ShortcutId;
  /** Set when the command cannot run. The palette dims it and inerts Enter. */
  disabledReason?: string;
  /** Marks the state already in effect, e.g. the active theme. */
  current?: boolean;
  run: () => void;
}

/** Panels in Settings a command can send the user to. */
export type SettingsFocus = "link" | "scan" | "repositories";

/**
 * Everything a command can do. Supplied by `App`, which owns the state these
 * mutate; the registry itself stays free of React.
 */
export interface CommandActions {
  setView: (view: ViewId) => void;
  toggleRepositories: () => void;
  toggleInspector: () => void;
  selectTheme: (theme: ThemePreference) => void;
  newWorktree: () => void;
  refreshRepository: (repository: Repository) => void;
  openSettings: (focus: SettingsFocus) => void;
  /**
   * Show the inspector in the cockpit, where the worktree removal flow lives.
   * Commands route the user to a confirmation, they never arm one.
   */
  revealInspector: () => void;
  openTerminal: (worktree: Worktree) => void;
  launchAgent: (worktree: Worktree) => void;
}

export interface CommandContext {
  view: ViewId;
  theme: ThemePreference;
  selectedRepository: Repository | null;
  selectedWorktree: Worktree | null;
  repositoriesCollapsed: boolean;
  inspectorCollapsed: boolean;
  actions: CommandActions;
}

const NEEDS_REPOSITORY = "Select a repository first";
const NEEDS_WORKTREE = "Select a worktree first";

/** Commands shown before the user types. Enough to browse, short enough to scan. */
const MAX_EMPTY = 7;

export function buildCommands(context: CommandContext): Command[] {
  const {
    view,
    theme,
    selectedRepository,
    selectedWorktree,
    repositoriesCollapsed,
    inspectorCollapsed,
    actions,
  } = context;

  const repositoryName = selectedRepository?.name;
  const worktreeName = selectedWorktree?.name;

  return [
    {
      id: "view.cockpit",
      title: "Go to Cockpit",
      keywords: "view worktrees home",
      shortcut: "view.cockpit",
      current: view === "cockpit",
      run: () => actions.setView("cockpit"),
    },
    {
      id: "view.agents",
      title: "Go to Agent monitor",
      keywords: "view agents sessions",
      current: view === "agents",
      run: () => actions.setView("agents"),
    },
    {
      id: "view.settings",
      title: "Go to Settings",
      keywords: "view preferences configuration options",
      current: view === "settings",
      run: () => actions.setView("settings"),
    },
    {
      id: "worktree.new",
      title: "New worktree…",
      subtitle: repositoryName ?? NEEDS_REPOSITORY,
      keywords: "create add branch",
      disabledReason: selectedRepository ? undefined : NEEDS_REPOSITORY,
      run: actions.newWorktree,
    },
    {
      id: "repository.link",
      title: "Link repository…",
      keywords: "add import existing index",
      run: () => actions.openSettings("link"),
    },
    {
      id: "repository.scan",
      title: "Scan for repositories…",
      keywords: "discover find folder search",
      run: () => actions.openSettings("scan"),
    },
    {
      id: "repository.refresh",
      title: "Refresh repository",
      subtitle: repositoryName ?? NEEDS_REPOSITORY,
      keywords: "reload rescan sync worktrees",
      disabledReason: selectedRepository ? undefined : NEEDS_REPOSITORY,
      run: () => {
        if (selectedRepository) {
          actions.refreshRepository(selectedRepository);
        }
      },
    },
    {
      id: "panel.repositories",
      title: repositoriesCollapsed
        ? "Expand repositories sidebar"
        : "Collapse repositories sidebar",
      keywords: "panel toggle sidebar repositories",
      shortcut: "panel.repositories",
      run: actions.toggleRepositories,
    },
    {
      id: "panel.inspector",
      title: inspectorCollapsed
        ? "Expand inspector panel"
        : "Collapse inspector panel",
      keywords: "panel toggle details",
      shortcut: "panel.inspector",
      run: actions.toggleInspector,
    },
    {
      id: "theme.system",
      title: "Theme: match system",
      keywords: "appearance dark light auto",
      current: theme === "system",
      run: () => actions.selectTheme("system"),
    },
    {
      id: "theme.light",
      title: "Theme: light",
      keywords: "appearance bright",
      current: theme === "light",
      run: () => actions.selectTheme("light"),
    },
    {
      id: "theme.dark",
      title: "Theme: dark",
      keywords: "appearance night",
      current: theme === "dark",
      run: () => actions.selectTheme("dark"),
    },
    {
      id: "worktree.terminal",
      title: "Open in terminal",
      subtitle: worktreeName ?? NEEDS_WORKTREE,
      keywords: "shell console launch warp",
      shortcut: "selection.open",
      disabledReason: selectedWorktree ? undefined : NEEDS_WORKTREE,
      run: () => {
        if (selectedWorktree) {
          actions.openTerminal(selectedWorktree);
        }
      },
    },
    {
      id: "worktree.agent",
      title: "Launch agent",
      subtitle: worktreeName ?? NEEDS_WORKTREE,
      keywords: "claude codex ai coding",
      shortcut: "selection.agent",
      disabledReason: selectedWorktree ? undefined : NEEDS_WORKTREE,
      run: () => {
        if (selectedWorktree) {
          actions.launchAgent(selectedWorktree);
        }
      },
    },
    {
      id: "worktree.remove",
      title: "Remove worktree…",
      subtitle: worktreeName ?? NEEDS_WORKTREE,
      keywords: "delete prune destroy",
      disabledReason: selectedWorktree ? undefined : NEEDS_WORKTREE,
      run: actions.revealInspector,
    },
    {
      id: "repository.remove",
      title: "Remove repository…",
      subtitle: repositoryName ?? NEEDS_REPOSITORY,
      keywords: "delete unlink forget",
      disabledReason: selectedRepository ? undefined : NEEDS_REPOSITORY,
      run: () => actions.openSettings("repositories"),
    },
  ];
}

/**
 * Rank commands against a query.
 *
 * Disabled entries sink below every runnable one but stay matchable: a search
 * for "terminal" should say when it arrives rather than come back empty.
 */
export function filterCommands(
  commands: readonly Command[],
  query: string,
): Command[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return commands
      .filter((command) => command.disabledReason === undefined)
      .slice(0, MAX_EMPTY);
  }

  const ranked: { command: Command; rank: number }[] = [];

  for (const command of commands) {
    // Deliberately excludes the subtitle: it holds the selected repository or
    // worktree name, and matching it would rank "Remove worktree… feat/x"
    // above feat/x itself for anyone searching a branch.
    const haystack = `${command.title} ${command.keywords ?? ""}`.toLowerCase();
    const rank = score(haystack, needle);
    if (rank >= 0) {
      ranked.push({
        command,
        rank: command.disabledReason === undefined ? rank : rank + 1000,
      });
    }
  }

  return ranked
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.command);
}
