/**
 * Worktree index shared by the cockpit, the launcher and the inspector.
 *
 * `list_worktrees` reconciles against git for one repository, so it is not
 * free. AGENTS.md section 28 forbids rescanning every repository before the UI
 * is shown, so this hook:
 *
 *   1. serves whatever is already cached immediately;
 *   2. loads a repository on demand when its cockpit group expands;
 *   3. drains the remaining repositories in the background, one at a time,
 *      so the launcher becomes complete without a startup stall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";
import { listWorktrees, refreshWorktrees } from "../lib/worktrees";
import type { Repository, RepositoryId, Worktree } from "../types/forest";

export type WorktreeIndexStatus = "idle" | "loading" | "ready" | "error";

export interface WorktreeIndexEntry {
  status: WorktreeIndexStatus;
  worktrees: Worktree[];
  error: string | null;
}

export interface RepositoryWorktree {
  repository: Repository;
  worktree: Worktree;
}

const EMPTY_ENTRY: WorktreeIndexEntry = {
  status: "idle",
  worktrees: [],
  error: null,
};

type IndexState = Record<RepositoryId, WorktreeIndexEntry>;

export function useWorktreeIndex(repositories: Repository[]) {
  const [entries, setEntries] = useState<IndexState>({});

  // Mirror of the per-repository status, readable synchronously so callbacks
  // can decide whether to start a load without touching the state updater.
  const statuses = useRef(new Map<RepositoryId, WorktreeIndexStatus>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (id: RepositoryId, mode: "list" | "refresh"): Promise<void> => {
      if (statuses.current.get(id) === "loading") {
        return;
      }
      statuses.current.set(id, "loading");

      setEntries((current) => ({
        ...current,
        [id]: {
          ...(current[id] ?? EMPTY_ENTRY),
          status: "loading",
          error: null,
        },
      }));

      try {
        const worktrees =
          mode === "refresh"
            ? await refreshWorktrees(id)
            : await listWorktrees(id);
        statuses.current.set(id, "ready");
        if (mounted.current) {
          setEntries((current) => ({
            ...current,
            [id]: { status: "ready", worktrees, error: null },
          }));
        }
      } catch (caught: unknown) {
        statuses.current.set(id, "error");
        if (mounted.current) {
          setEntries((current) => ({
            ...current,
            [id]: {
              status: "error",
              worktrees: current[id]?.worktrees ?? [],
              error: errorMessage(caught),
            },
          }));
        }
      }
    },
    [],
  );

  /** Load a repository's worktrees unless they are already loaded or loading. */
  const ensureLoaded = useCallback(
    (id: RepositoryId) => {
      const status = statuses.current.get(id) ?? "idle";
      if (status !== "idle") {
        return;
      }
      void load(id, "list");
    },
    [load],
  );

  const refresh = useCallback(
    (id: RepositoryId) => {
      void load(id, "refresh");
    },
    [load],
  );

  /** Replace a repository's rows after a create/remove mutation. */
  const setWorktrees = useCallback(
    (id: RepositoryId, worktrees: Worktree[]) => {
      statuses.current.set(id, "ready");
      setEntries((current) => ({
        ...current,
        [id]: { status: "ready", worktrees, error: null },
      }));
    },
    [],
  );

  /** Forget a repository that left the forest. */
  const forget = useCallback((id: RepositoryId) => {
    statuses.current.delete(id);
    setEntries((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  // Background prefetch: start at most one repository per pass, so the
  // launcher fills in without competing with whatever the user expands. Each
  // completed load updates `entries`, which re-runs this effect for the next.
  useEffect(() => {
    const pending = repositories.find(
      (repository) =>
        (statuses.current.get(repository.id) ?? "idle") === "idle",
    );
    if (pending) {
      void load(pending.id, "list");
    }
  }, [repositories, entries, load]);

  const entryFor = useCallback(
    (id: RepositoryId): WorktreeIndexEntry => entries[id] ?? EMPTY_ENTRY,
    [entries],
  );

  /** Flat repository+worktree pairs, for the launcher and tray counters. */
  const flat = useMemo<RepositoryWorktree[]>(() => {
    const rows: RepositoryWorktree[] = [];
    for (const repository of repositories) {
      for (const worktree of entries[repository.id]?.worktrees ?? []) {
        rows.push({ repository, worktree });
      }
    }
    return rows;
  }, [repositories, entries]);

  return { entryFor, ensureLoaded, refresh, setWorktrees, forget, flat };
}

export type WorktreeIndex = ReturnType<typeof useWorktreeIndex>;
