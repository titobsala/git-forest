/**
 * Repository accordion group — docs/design.md section 4.2.
 *
 * The header toggles its child rows; worktrees load lazily the first time a
 * group expands (AGENTS.md section 28).
 */

import { useEffect } from "react";
import type {
  Repository,
  RepositoryId,
  Worktree,
  WorktreeId,
} from "../../types/forest";
import type { WorktreeIndexEntry } from "../../hooks/useWorktreeIndex";
import { ChevronIcon } from "../../components/shell/icons";
import { WorktreeRow } from "./WorktreeRow";

interface RepositoryGroupProps {
  repository: Repository;
  entry: WorktreeIndexEntry;
  worktrees: Worktree[];
  /** Total before filtering, for the "n of m" header count. */
  totalCount: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Stable callbacks from the worktree index; identity must not change. */
  ensureLoaded: (id: RepositoryId) => void;
  refresh: (id: RepositoryId) => void;
  selectedWorktreeId: WorktreeId | null;
  activeWorktreeId: WorktreeId | null;
  onSelectWorktree: (worktree: Worktree, repository: Repository) => void;
  terminalName: string;
  agentName: string;
  onOpenTerminal?: (worktree: Worktree) => void;
  onLaunchAgent?: (worktree: Worktree) => void;
}

export function RepositoryGroup({
  repository,
  entry,
  worktrees,
  totalCount,
  collapsed,
  onToggle,
  ensureLoaded,
  refresh,
  selectedWorktreeId,
  activeWorktreeId,
  onSelectWorktree,
  terminalName,
  agentName,
  onOpenTerminal,
  onLaunchAgent,
}: RepositoryGroupProps) {
  useEffect(() => {
    if (!collapsed) {
      ensureLoaded(repository.id);
    }
  }, [collapsed, ensureLoaded, repository.id]);

  const panelId = `cockpit-group-${repository.id}`;

  return (
    <section className="gf-surface overflow-hidden">
      <h3 className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-canvas"
        >
          <ChevronIcon
            className={
              collapsed ? "text-ink-muted" : "rotate-90 text-ink-muted"
            }
          />
          <span aria-hidden="true">📦</span>
          <span className="truncate text-heading text-ink">
            {repository.name}
          </span>
          <span className="gf-badge gf-badge-neutral shrink-0">
            {entry.status === "ready"
              ? worktrees.length === totalCount
                ? `${totalCount} worktrees`
                : `${worktrees.length} of ${totalCount}`
              : entry.status === "loading"
                ? "loading…"
                : "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => refresh(repository.id)}
          className="mr-2 rounded-sm px-1.5 py-0.5 font-mono text-micro text-ink-muted hover:bg-canvas hover:text-ink"
          title={`Refresh worktrees for ${repository.name}`}
        >
          ⟳
        </button>
      </h3>

      {collapsed ? null : (
        <div id={panelId} className="border-t border-card-border">
          {entry.status === "loading" && worktrees.length === 0 ? (
            <p className="px-3 py-2 text-body text-ink-muted">
              Loading worktrees…
            </p>
          ) : entry.status === "error" ? (
            <p role="alert" className="px-3 py-2 text-body text-badge-high-ink">
              {entry.error}
            </p>
          ) : worktrees.length === 0 ? (
            <p className="px-3 py-2 text-body text-ink-muted">
              {totalCount === 0
                ? "No worktrees found."
                : "No worktrees match the current filter."}
            </p>
          ) : (
            worktrees.map((worktree, index) => (
              <WorktreeRow
                key={worktree.id}
                worktree={worktree}
                index={index}
                total={worktrees.length}
                selected={worktree.id === selectedWorktreeId}
                tabbable={worktree.id === activeWorktreeId}
                onSelect={() => onSelectWorktree(worktree, repository)}
                terminalName={terminalName}
                agentName={agentName}
                onOpenTerminal={
                  onOpenTerminal ? () => onOpenTerminal(worktree) : undefined
                }
                onLaunchAgent={
                  onLaunchAgent ? () => onLaunchAgent(worktree) : undefined
                }
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
