/**
 * Forest maintenance — refresh and previewed cleanup.
 *
 * Destructive cleanup is confined to Settings. The first action loads a
 * preview; checkboxes select categories; "Clean selected…" reveals an inline
 * confirmation. Execution always shows per-category results plus the
 * post-run preview.
 */

import { useEffect, useRef, useState } from "react";
import { toCommandError } from "../../lib/errors";
import { previewCleanup, runCleanup } from "../../lib/cleanup";
import type {
  CleanupCategory,
  CleanupOperationResult,
  CleanupPreview,
  CleanupRequest,
  CommandError,
  ForestState,
} from "../../types/forest";

interface MaintenancePanelProps {
  busy: boolean;
  onRefreshForest: () => void;
  onCleanupComplete: (state: ForestState) => void;
}

const EMPTY_PREVIEW: CleanupPreview = {
  prunableGitWorktrees: [],
  staleForestWorktrees: [],
  staleWarpConfigs: [],
  finishedSessions: [],
  blockedForestWorktrees: [],
  sourceErrors: [],
};

const CATEGORIES: {
  id: keyof CleanupRequest;
  category: CleanupCategory;
  label: string;
  items: (preview: CleanupPreview) => { name: string; reason?: string }[];
}[] = [
  {
    id: "pruneGitWorktrees",
    category: "git_worktrees",
    label: "Prunable Git worktrees",
    items: (preview) =>
      preview.prunableGitWorktrees.map((item) => ({
        name: item.name,
        reason: item.reason,
      })),
  },
  {
    id: "removeForestMetadata",
    category: "forest_metadata",
    label: "Stale Forest metadata",
    items: (preview) =>
      preview.staleForestWorktrees.map((item) => ({
        name: item.name,
        reason: item.reason,
      })),
  },
  {
    id: "removeWarpConfigs",
    category: "warp_configs",
    label: "Stale Warp configs",
    items: (preview) =>
      preview.staleWarpConfigs.map((item) => ({
        name: item.fileName,
        reason: `${item.ageSeconds}s old`,
      })),
  },
  {
    id: "removeFinishedSessions",
    category: "finished_sessions",
    label: "Finished sessions",
    items: (preview) =>
      preview.finishedSessions.map((item) => ({
        name: `${item.id} (${item.status})`,
      })),
  },
];

function defaultRequest(preview: CleanupPreview): CleanupRequest {
  return {
    pruneGitWorktrees: preview.prunableGitWorktrees.length > 0,
    removeForestMetadata: preview.staleForestWorktrees.length > 0,
    removeWarpConfigs: preview.staleWarpConfigs.length > 0,
    removeFinishedSessions: preview.finishedSessions.length > 0,
  };
}

function selectedCount(
  preview: CleanupPreview,
  request: CleanupRequest,
): number {
  return CATEGORIES.reduce(
    (total, category) =>
      request[category.id] ? total + category.items(preview).length : total,
    0,
  );
}

export function MaintenancePanel({
  busy,
  onRefreshForest,
  onCleanupComplete,
}: MaintenancePanelProps) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [request, setRequest] = useState<CleanupRequest>(
    defaultRequest(EMPTY_PREVIEW),
  );
  const [confirming, setConfirming] = useState(false);
  const [operations, setOperations] = useState<CleanupOperationResult[] | null>(
    null,
  );
  const [error, setError] = useState<CommandError | null>(null);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (confirming) {
      function onKey(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          restoreFocus.current = true;
          setConfirming(false);
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
    return undefined;
  }, [confirming]);

  async function handlePreview() {
    setError(null);
    setOperations(null);
    setConfirming(false);
    setLoading(true);
    try {
      const next = await previewCleanup();
      setPreview(next);
      setRequest(defaultRequest(next));
    } catch (caught: unknown) {
      setError(toCommandError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await runCleanup(request);
      setOperations(result.operations);
      setPreview(result.preview);
      setRequest(defaultRequest(result.preview));
      setConfirming(false);
      onCleanupComplete(result.state);
      restoreFocus.current = true;
    } catch (caught: unknown) {
      setError(toCommandError(caught));
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(id: keyof CleanupRequest) {
    setConfirming(false);
    setRequest((current) => ({ ...current, [id]: !current[id] }));
  }

  const disabled = busy || loading;
  const count = preview ? selectedCount(preview, request) : 0;

  return (
    <section className="panel" aria-labelledby="maintenance-heading">
      <h2 id="maintenance-heading">Maintenance</h2>
      <p className="hint">
        Refresh observes Git and disk. Cleanup only removes stale Git records,
        Forest metadata, generated Warp files, and finished sessions.
      </p>

      <div className="button-row">
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => onRefreshForest()}
        >
          Refresh Forest
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void handlePreview()}
        >
          Preview cleanup
        </button>
      </div>

      {error ? (
        <p className="banner" role="alert">
          {error.message}
        </p>
      ) : null}

      {preview ? (
        <div className="stack">
          {CATEGORIES.map((category) => {
            const items = category.items(preview);
            const enabled = items.length > 0;
            return (
              <label key={category.id} className="field">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={request[category.id]}
                    disabled={!enabled || disabled}
                    onChange={() => toggleCategory(category.id)}
                  />
                  {category.label} ({items.length})
                </span>
                {items.length > 0 ? (
                  <ul className="hint">
                    {items.map((item) => (
                      <li key={item.name}>
                        {item.name}
                        {item.reason ? ` — ${item.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">None.</p>
                )}
              </label>
            );
          })}

          {preview.blockedForestWorktrees.length > 0 ? (
            <div>
              <p className="gf-label">Blocked Forest metadata</p>
              <ul className="hint">
                {preview.blockedForestWorktrees.map((item) => (
                  <li key={item.path}>
                    {item.name} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.sourceErrors.length > 0 ? (
            <div>
              <p className="gf-label">Source errors</p>
              <ul className="hint">
                {preview.sourceErrors.map((item, index) => (
                  <li key={`${item.category}-${index}`}>
                    {item.category}: {item.error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {operations ? (
            <div>
              <p className="gf-label">Last cleanup</p>
              <ul className="hint">
                {operations.map((operation) => (
                  <li key={operation.category}>
                    {operation.category}: removed {operation.removed}
                    {operation.error ? ` — ${operation.error.message}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!confirming ? (
            <button
              ref={triggerRef}
              type="button"
              className="gf-button gf-button-danger"
              disabled={disabled || count === 0}
              onClick={() => setConfirming(true)}
            >
              Clean selected…
            </button>
          ) : (
            <div
              role="region"
              aria-label="Confirm cleanup"
              className="space-y-2 rounded-sm border border-badge-high-ink/40 p-2"
            >
              <p className="confirm-copy">
                Remove {count} selected stale artifact
                {count === 1 ? "" : "s"}? Present worktree directories are not
                deleted.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    restoreFocus.current = true;
                    setConfirming(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="gf-button gf-button-danger"
                  disabled={disabled}
                  onClick={() => void handleExecute()}
                >
                  Clean selected artifacts
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
