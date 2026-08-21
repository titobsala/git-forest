/**
 * Cockpit control bar — docs/design.md section 3.1.
 *
 * Global accordion toggle, live branch filter, and status category pills.
 */

import type { CockpitFilter } from "./filters";
import { FILTER_LABELS, FILTERS } from "./filters";

interface CockpitToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filter: CockpitFilter;
  onFilterChange: (filter: CockpitFilter) => void;
  allCollapsed: boolean;
  onToggleAll: () => void;
  onNewWorktree: () => void;
  canCreateWorktree: boolean;
  matchCount: number;
}

export function CockpitToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  allCollapsed,
  onToggleAll,
  onNewWorktree,
  canCreateWorktree,
  matchCount,
}: CockpitToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-card-border bg-card px-3 py-1.5">
      <button
        type="button"
        className="gf-button"
        onClick={onToggleAll}
        aria-expanded={!allCollapsed}
        title={
          allCollapsed ? "Expand all repositories" : "Collapse all repositories"
        }
      >
        <span aria-hidden="true">{allCollapsed ? "►" : "▼"}</span>
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>

      <div className="min-w-40 flex-1">
        <label className="sr-only" htmlFor="cockpit-filter">
          Filter worktrees by branch or path
        </label>
        <input
          id="cockpit-filter"
          className="gf-input font-mono text-mono-code"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter branches and paths"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Status filter"
      >
        {FILTERS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={filter === candidate}
            onClick={() => onFilterChange(candidate)}
            className={[
              "rounded-full border px-2 py-0.5 text-body transition-colors",
              filter === candidate
                ? "border-brand bg-badge-good text-badge-good-ink"
                : "border-card-border text-ink-muted hover:border-brand",
            ].join(" ")}
          >
            {FILTER_LABELS[candidate]}
          </button>
        ))}
      </div>

      <span className="font-mono text-micro text-ink-muted">
        {matchCount} shown
      </span>

      <button
        type="button"
        className="gf-button gf-button-primary"
        onClick={onNewWorktree}
        disabled={!canCreateWorktree}
        title={
          canCreateWorktree
            ? "Create a worktree in the selected repository"
            : "Select a repository first"
        }
      >
        New worktree
      </button>
    </div>
  );
}
