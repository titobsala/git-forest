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
 *
 * Every listing runs behind the single Forest mutex (`commands/mod.rs`), which
 * makes concurrency here actively harmful: firing one listing per repository
 * would queue an unrelated configuration save or worktree creation behind a
 * scan of the entire forest. So listings go through one serial queue —
 * on-demand requests ahead of background ones — and the background pass waits
 * for an idle slot and stands down entirely while a native mutation is in
 * flight. A user command then waits for at most one repository.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";
import { isRepositoryAvailable } from "../lib/repository-health";
import { listWorktrees, refreshWorktrees } from "../lib/worktrees";
import type {
  Repository,
  RepositoryId,
  Worktree,
  WorktreeId,
} from "../types/forest";

export type WorktreeIndexStatus = "idle" | "loading" | "ready" | "error";

export interface WorktreeIndexOptions {
  /**
   * Suspends the background pass. Set while a native mutation is in flight so
   * the user's command is not stuck behind a speculative repository scan.
   */
  paused?: boolean;
}

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

type LoadMode = "list" | "refresh";

/** A repository waiting for its turn on the shared Forest lock. */
interface QueuedLoad {
  id: RepositoryId;
  mode: LoadMode;
}

/** Deadline for the idle slot, so the launcher still fills in on a busy tab. */
const PREFETCH_IDLE_TIMEOUT_MS = 2_000;

/** Fallback spacing where `requestIdleCallback` is missing (jsdom, WebKit). */
const PREFETCH_FALLBACK_DELAY_MS = 50;

/** Run `task` once the renderer is idle. Returns a cancel function. */
function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, {
      timeout: PREFETCH_IDLE_TIMEOUT_MS,
    });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, PREFETCH_FALLBACK_DELAY_MS);
  return () => clearTimeout(handle);
}

export function useWorktreeIndex(
  repositories: Repository[],
  options: WorktreeIndexOptions = {},
) {
  const paused = options.paused ?? false;

  const [entries, setEntries] = useState<IndexState>({});
  const repositoriesRef = useRef(repositories);
  repositoriesRef.current = repositories;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Mirror of the per-repository status, readable synchronously so callbacks
  // can decide whether to queue a load without touching the state updater.
  // A repository counts as "loading" from the moment it is queued.
  const statuses = useRef(new Map<RepositoryId, WorktreeIndexStatus>());
  const queue = useRef<QueuedLoad[]>([]);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ id, mode }: QueuedLoad): Promise<void> => {
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
  }, []);

  /** Run queued listings one at a time until the queue empties. */
  const drain = useCallback(async () => {
    if (running.current || pausedRef.current) {
      return;
    }
    running.current = true;
    try {
      for (;;) {
        if (pausedRef.current) {
          return;
        }
        const next = queue.current.shift();
        if (!next) {
          return;
        }
        await load(next);
      }
    } finally {
      running.current = false;
    }
  }, [load]);

  const enqueue = useCallback(
    (id: RepositoryId, mode: LoadMode, priority: "user" | "background") => {
      const repository = repositoriesRef.current.find((item) => item.id === id);
      if (!repository || !isRepositoryAvailable(repository)) {
        return;
      }
      if (statuses.current.get(id) === "loading") {
        // Already queued or in flight. A refresh still upgrades a plain
        // listing that has not started yet, so the newer intent wins.
        const queued = queue.current.find((item) => item.id === id);
        if (queued && mode === "refresh") {
          queued.mode = "refresh";
        }
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

      const item: QueuedLoad = { id, mode };
      if (priority === "user") {
        queue.current.unshift(item);
      } else {
        queue.current.push(item);
      }
      void drain();
    },
    [drain],
  );

  /** Load a repository's worktrees unless they are already loaded or loading. */
  const ensureLoaded = useCallback(
    (id: RepositoryId) => {
      const status = statuses.current.get(id) ?? "idle";
      if (status !== "idle") {
        return;
      }
      enqueue(id, "list", "user");
    },
    [enqueue],
  );

  const refresh = useCallback(
    (id: RepositoryId) => {
      enqueue(id, "refresh", "user");
    },
    [enqueue],
  );

  const refreshAll = useCallback(
    (repositoryIds: RepositoryId[]) => {
      for (const id of repositoryIds) {
        enqueue(id, "refresh", "user");
      }
    },
    [enqueue],
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

  /** Patch recency after a successful terminal or agent launch. */
  const touchWorktree = useCallback((id: WorktreeId, lastUsedAt: string) => {
    setEntries((current) => {
      let changed = false;
      const next: IndexState = { ...current };
      for (const [repositoryId, entry] of Object.entries(current)) {
        const index = entry.worktrees.findIndex(
          (worktree) => worktree.id === id,
        );
        if (index === -1) {
          continue;
        }
        const worktrees = entry.worktrees.slice();
        const currentWorktree = worktrees[index];
        if (!currentWorktree) {
          continue;
        }
        worktrees[index] = { ...currentWorktree, lastUsedAt };
        next[repositoryId] = { ...entry, worktrees };
        changed = true;
        break;
      }
      return changed ? next : current;
    });
  }, []);

  /** Forget a repository that left the forest. */
  const forget = useCallback((id: RepositoryId) => {
    statuses.current.delete(id);
    queue.current = queue.current.filter((item) => item.id !== id);
    setEntries((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!paused) {
      void drain();
    }
  }, [paused, drain]);

  // Background pass: queue at most one repository per idle slot, and only once
  // the queue has drained. Each completed load updates `entries`, which
  // re-runs this effect for the next repository.
  useEffect(() => {
    if (paused || queue.current.length > 0 || running.current) {
      return;
    }
    const pending = repositories.find(
      (repository) =>
        isRepositoryAvailable(repository) &&
        (statuses.current.get(repository.id) ?? "idle") === "idle",
    );
    if (!pending) {
      return;
    }
    return scheduleIdle(() => {
      enqueue(pending.id, "list", "background");
    });
  }, [repositories, entries, enqueue, paused]);

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

  return {
    entryFor,
    ensureLoaded,
    refresh,
    refreshAll,
    setWorktrees,
    touchWorktree,
    forget,
    flat,
  };
}

export type WorktreeIndex = ReturnType<typeof useWorktreeIndex>;
