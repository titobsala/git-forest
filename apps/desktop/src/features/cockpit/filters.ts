/**
 * Cockpit status filters — docs/design.md section 3.1 ("status category pills").
 */

import type { Worktree } from "../../types/forest";
import { isDirty } from "./telemetry";

export type CockpitFilter = "all" | "agents" | "dirty";

export const FILTERS: readonly CockpitFilter[] = ["all", "agents", "dirty"];

export const FILTER_LABELS: Record<CockpitFilter, string> = {
  all: "All",
  agents: "Agents",
  dirty: "Dirty",
};

/**
 * Free-text match over the fields a developer would actually type: branch,
 * worktree name and path.
 */
export function worktreeMatches(worktree: Worktree, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [worktree.name, worktree.path, worktree.branch ?? ""]
    .join(" ")
    .toLowerCase();

  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

/**
 * Status pill predicate.
 *
 * AWAITING BACKEND: "agents" needs agent sessions (release 0.0.8).
 * Until `hasAgentSession` is supplied it resolves to false, so the pill
 * correctly yields an empty result rather than a fabricated one.
 */
export function matchesFilter(
  worktree: Worktree,
  filter: CockpitFilter,
  hasAgentSession: (worktree: Worktree) => boolean = () => false,
): boolean {
  switch (filter) {
    case "dirty":
      return isDirty(worktree);
    case "agents":
      return hasAgentSession(worktree);
    case "all":
      return true;
  }
}
