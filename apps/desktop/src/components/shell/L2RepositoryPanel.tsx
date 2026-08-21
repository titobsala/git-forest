/**
 * L2 repositories panel — docs/design.md section 3.1.
 *
 * Collapsible 224px sub-sidebar listing indexed repositories with their paths
 * and mode badges. Collapses to a 40px rail to widen the cockpit stage.
 */

import { useMemo, useState } from "react";
import { repositoryMatches } from "../../lib/search";
import type { Repository, RepositoryId } from "../../types/forest";
import type { WorktreeIndex } from "../../hooks/useWorktreeIndex";
import { ChevronIcon } from "./icons";

interface L2RepositoryPanelProps {
  repositories: Repository[];
  selectedId: RepositoryId | null;
  onSelect: (id: RepositoryId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  index: WorktreeIndex;
  onAddRepository: () => void;
}

export function L2RepositoryPanel({
  repositories,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  index,
  onAddRepository,
}: L2RepositoryPanelProps) {
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      repositories.filter((repository) => repositoryMatches(repository, query)),
    [repositories, query],
  );

  if (collapsed) {
    return (
      <div className="flex w-collapsed shrink-0 flex-col items-center border-r border-l2-divider bg-l2 py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand repositories sidebar"
          aria-expanded={false}
          title="Expand repositories sidebar"
          className="grid size-7 place-items-center rounded-sm text-l2-muted hover:bg-card hover:text-l2-active"
        >
          <ChevronIcon />
        </button>
        <span className="mt-3 font-mono text-micro text-l2-muted [writing-mode:vertical-rl]">
          {repositories.length} repos
        </span>
      </div>
    );
  }

  return (
    <aside
      aria-label="Repositories"
      className="flex w-l2 shrink-0 flex-col border-r border-l2-divider bg-l2"
    >
      <div className="flex items-center gap-1 border-b border-l2-divider px-2 py-1.5">
        <h2 className="text-heading text-l2-active">Repositories</h2>
        <span className="gf-badge gf-badge-neutral">{repositories.length}</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Collapse repositories sidebar"
          aria-expanded
          title="Collapse repositories sidebar"
          className="ml-auto grid size-6 place-items-center rounded-sm text-l2-muted hover:bg-card hover:text-l2-active"
        >
          <ChevronIcon className="rotate-180" />
        </button>
      </div>

      <div className="px-2 py-1.5">
        <label className="sr-only" htmlFor="l2-repository-search">
          Filter repositories
        </label>
        <input
          id="l2-repository-search"
          className="gf-input font-mono text-mono-code"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter repositories"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {repositories.length === 0 ? (
          <p className="px-2 py-3 text-body text-l2-muted">
            No repositories indexed yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-3 text-body text-l2-muted">No matches.</p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((repository) => {
              const entry = index.entryFor(repository.id);
              const selected = repository.id === selectedId;

              return (
                <li key={repository.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(repository.id)}
                    aria-current={selected ? "true" : undefined}
                    className={[
                      "flex w-full flex-col gap-0.5 border-l-2 px-2 py-1.5 text-left transition-colors",
                      selected
                        ? "border-brand bg-card"
                        : "border-transparent hover:bg-card/60",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-body font-semibold text-l2-active">
                        {repository.name}
                      </span>
                      <span
                        className={
                          repository.mode === "managed"
                            ? "gf-badge gf-badge-good"
                            : "gf-badge gf-badge-neutral"
                        }
                      >
                        {repository.mode}
                      </span>
                      {entry.status === "ready" ? (
                        <span className="ml-auto font-mono text-micro text-l2-muted">
                          {entry.worktrees.length}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="truncate font-mono text-mono-code text-l2-muted"
                      title={repository.path}
                    >
                      {repository.path}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-l2-divider p-2">
        <button
          type="button"
          className="gf-button w-full"
          onClick={onAddRepository}
        >
          Add repository
        </button>
      </div>
    </aside>
  );
}
