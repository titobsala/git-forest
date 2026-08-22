/**
 * Per-result actions for the Quick Launch submenu — docs/design.md 4.3.
 *
 * Tab on a highlighted repository or worktree opens this list, scoped to that
 * one item. Kept pure for the same reason as `commands.ts`: the set of actions
 * and their disabled states are worth testing without a DOM.
 */

import type { Repository } from "../../types/forest";
import { AGENT_PENDING, TERMINAL_PENDING } from "./commands";
import type { LaunchResult } from "./results";
import { score } from "./score";

export interface LaunchAction {
  id: string;
  title: string;
  subtitle?: string;
  disabledReason?: string;
  run: () => void;
}

export interface ActionContext {
  /** Select the item and show it in the cockpit. */
  reveal: (result: LaunchResult) => void;
  newWorktree: (repository: Repository) => void;
  refreshRepository: (repository: Repository) => void;
  copyPath: (path: string) => void;
  /** Routes to the inspector's removal flow; never arms the confirmation. */
  removeWorktree: (result: LaunchResult) => void;
  /** Routes to the repository browser, where removal is confirmed inline. */
  removeRepository: (repository: Repository) => void;
  /** False when the platform exposes no clipboard; the copy action is dropped. */
  canCopy: boolean;
}

export function buildActions(
  result: LaunchResult,
  context: ActionContext,
): LaunchAction[] {
  const copy: LaunchAction[] = context.canCopy
    ? [
        {
          id: "copy-path",
          title: "Copy path",
          subtitle: result.subtitle,
          run: () => context.copyPath(result.subtitle),
        },
      ]
    : [];

  if (result.worktree) {
    return [
      {
        id: "reveal",
        title: "Reveal in Cockpit",
        run: () => context.reveal(result),
      },
      ...copy,
      {
        id: "terminal",
        title: "Open in terminal",
        disabledReason: TERMINAL_PENDING,
        run: () => {},
      },
      {
        id: "agent",
        title: "Launch agent",
        disabledReason: AGENT_PENDING,
        run: () => {},
      },
      {
        id: "remove",
        title: "Remove worktree…",
        run: () => context.removeWorktree(result),
      },
    ];
  }

  return [
    {
      id: "reveal",
      title: "Reveal in Cockpit",
      run: () => context.reveal(result),
    },
    {
      id: "new-worktree",
      title: "New worktree here",
      run: () => context.newWorktree(result.repository),
    },
    {
      id: "refresh",
      title: "Refresh worktrees",
      run: () => context.refreshRepository(result.repository),
    },
    ...copy,
    {
      id: "remove",
      title: "Remove repository…",
      run: () => context.removeRepository(result.repository),
    },
  ];
}

/**
 * Rank actions against a query, disabled ones last — the same ordering rule
 * `filterCommands` uses, so the two lists behave identically as you type.
 */
export function filterActions(
  actions: readonly LaunchAction[],
  query: string,
): LaunchAction[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...actions];
  }

  const ranked: { action: LaunchAction; rank: number }[] = [];

  for (const action of actions) {
    const rank = score(action.title.toLowerCase(), needle);
    if (rank >= 0) {
      ranked.push({
        action,
        rank: action.disabledReason === undefined ? rank : rank + 1000,
      });
    }
  }

  return ranked
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.action);
}
