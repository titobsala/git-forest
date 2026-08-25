/**
 * Central cockpit stage — docs/design.md sections 3.1 and 4.
 *
 * Grouped, high-density worktree list. The list is a composite widget: ↑/↓
 * move the selection and Tab / Shift+Tab toggle the side panels, per the key
 * map in section 5. Scoping the Tab override to this widget keeps ordinary
 * tabbing intact everywhere else (AGENTS.md section 43).
 */

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { isInteractiveTarget, resolveShortcut } from "../../lib/keymap";
import type {
  AgentDefinition,
  AgentDefinitionId,
  AgentSession,
  ForestConfiguration,
  Repository,
  RepositoryId,
  Worktree,
  WorktreeId,
} from "../../types/forest";
import type { WorktreeIndex } from "../../hooks/useWorktreeIndex";
import { CockpitToolbar } from "./CockpitToolbar";
import { RepositoryGroup } from "./RepositoryGroup";
import { matchesFilter, worktreeMatches, type CockpitFilter } from "./filters";

interface CockpitViewProps {
  repositories: Repository[];
  index: WorktreeIndex;
  configuration: ForestConfiguration;
  agentDefinitions: AgentDefinition[];
  selectedRepositoryId: RepositoryId | null;
  selectedWorktreeId: WorktreeId | null;
  onSelectWorktree: (worktree: Worktree, repository: Repository) => void;
  onToggleRepositories: () => void;
  onToggleInspector: () => void;
  onNewWorktree: () => void;
  onOpenTerminal?: (worktree: Worktree) => void;
  onLaunchAgent?: (worktree: Worktree) => void;
  hasActiveSession?: (worktree: Worktree) => boolean;
  primarySession?: (worktreeId: WorktreeId) => AgentSession | null;
}

export function CockpitView({
  repositories,
  index,
  configuration,
  agentDefinitions,
  selectedRepositoryId,
  selectedWorktreeId,
  onSelectWorktree,
  onToggleRepositories,
  onToggleInspector,
  onNewWorktree,
  onOpenTerminal,
  onLaunchAgent,
  hasActiveSession,
  primarySession,
}: CockpitViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CockpitFilter>("all");
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<RepositoryId>>(
    new Set(),
  );

  const groups = useMemo(
    () =>
      repositories.map((repository) => {
        const entry = index.entryFor(repository.id);
        return {
          repository,
          entry,
          totalCount: entry.worktrees.length,
          worktrees: entry.worktrees.filter(
            (worktree) =>
              worktreeMatches(worktree, query) &&
              matchesFilter(worktree, filter, hasActiveSession),
          ),
        };
      }),
    [repositories, index, query, filter, hasActiveSession],
  );

  /** Visible rows in document order, for ↑/↓ traversal across groups. */
  const rows = useMemo(
    () =>
      groups.flatMap((group) =>
        collapsedIds.has(group.repository.id)
          ? []
          : group.worktrees.map((worktree) => ({
              worktree,
              repository: group.repository,
            })),
      ),
    [groups, collapsedIds],
  );

  const matchCount = rows.length;
  const allCollapsed =
    repositories.length > 0 && collapsedIds.size === repositories.length;

  const activeWorktreeId =
    rows.find((row) => row.worktree.id === selectedWorktreeId)?.worktree.id ??
    rows[0]?.worktree.id ??
    null;

  const toggleGroup = useCallback((id: RepositoryId) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  function toggleAll() {
    setCollapsedIds((current) =>
      current.size === repositories.length
        ? new Set()
        : new Set(repositories.map((repository) => repository.id)),
    );
  }

  function moveSelection(delta: number) {
    if (rows.length === 0) {
      return;
    }
    const current = rows.findIndex(
      (row) => row.worktree.id === activeWorktreeId,
    );
    const nextIndex =
      current === -1
        ? 0
        : Math.min(Math.max(current + delta, 0), rows.length - 1);
    const next = rows[nextIndex];
    if (next) {
      onSelectWorktree(next.worktree, next.repository);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    const id = resolveShortcut(event, ["cockpitList"]);
    if (!id) {
      return;
    }

    switch (id) {
      case "selection.previous":
        event.preventDefault();
        moveSelection(-1);
        break;
      case "selection.next":
        event.preventDefault();
        moveSelection(1);
        break;
      case "panel.repositories":
        event.preventDefault();
        onToggleRepositories();
        break;
      case "panel.inspector":
        event.preventDefault();
        onToggleInspector();
        break;
      case "selection.open": {
        event.preventDefault();
        const active = rows.find((row) => row.worktree.id === activeWorktreeId);
        if (active && onOpenTerminal) {
          onOpenTerminal(active.worktree);
        }
        break;
      }
      case "selection.agent": {
        event.preventDefault();
        const active = rows.find((row) => row.worktree.id === activeWorktreeId);
        if (active && onLaunchAgent) {
          onLaunchAgent(active.worktree);
        }
        break;
      }
      default:
        break;
    }
  }

  const agentName =
    agentDefinitions.find((agent) => agent.id === configuration.defaultAgentId)
      ?.name ?? configuration.defaultAgentId;

  function agentNameFor(agentId: AgentDefinitionId): string {
    return (
      agentDefinitions.find((agent) => agent.id === agentId)?.name ?? agentId
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CockpitToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        allCollapsed={allCollapsed}
        onToggleAll={toggleAll}
        onNewWorktree={onNewWorktree}
        canCreateWorktree={selectedRepositoryId !== null}
        matchCount={matchCount}
      />

      {repositories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-body text-ink-muted">
            No repositories indexed yet. Add or scan for repositories from the
            Settings view to populate the cockpit.
          </p>
        </div>
      ) : (
        <div
          role="listbox"
          aria-label="Worktrees"
          // Roving tabindex: the selected option carries the tab stop, so the
          // container itself is only programmatically focusable.
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
        >
          {groups.map((group) => (
            <RepositoryGroup
              key={group.repository.id}
              repository={group.repository}
              entry={group.entry}
              worktrees={group.worktrees}
              totalCount={group.totalCount}
              collapsed={collapsedIds.has(group.repository.id)}
              onToggle={() => toggleGroup(group.repository.id)}
              ensureLoaded={index.ensureLoaded}
              refresh={index.refresh}
              selectedWorktreeId={selectedWorktreeId}
              activeWorktreeId={activeWorktreeId}
              onSelectWorktree={onSelectWorktree}
              terminalName={configuration.defaultTerminal}
              agentName={agentName}
              onOpenTerminal={onOpenTerminal}
              onLaunchAgent={onLaunchAgent}
              sessionFor={primarySession}
              agentNameFor={agentNameFor}
            />
          ))}
        </div>
      )}
    </div>
  );
}
