import { FormEvent, useEffect, useState } from "react";
import {
  createWorktree,
  getWorktreeRemovalPreview,
  listLocalBranches,
  listWorktrees,
  previewCreateWorktree,
  refreshWorktrees,
  removeWorktree,
} from "../lib/worktrees";
import { errorMessage } from "../lib/errors";
import type {
  LocalBranch,
  Repository,
  Worktree,
  WorktreeId,
  WorktreeRemovalPreview,
} from "../types/forest";

interface WorktreePanelProps {
  repository: Repository;
  busy: boolean;
}

export function WorktreePanel({ repository, busy }: WorktreePanelProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseRef, setBaseRef] = useState("main");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorktreeRemovalPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    void Promise.all([
      listWorktrees(repository.id),
      listLocalBranches(repository.id),
    ])
      .then(([nextWorktrees, nextBranches]) => {
        if (cancelled) {
          return;
        }
        setWorktrees(nextWorktrees);
        setBranches(nextBranches);
        if (nextBranches.some((item) => item.name === "main")) {
          setBaseRef("main");
        } else if (nextBranches[0]) {
          setBaseRef(nextBranches[0].name);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository.id]);

  useEffect(() => {
    if (!branch.trim()) {
      setDestination(null);
      return;
    }
    let cancelled = false;
    void previewCreateWorktree({
      repositoryId: repository.id,
      baseRef,
      branch: branch.trim(),
      name: name.trim() || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setDestination(result.destination);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDestination(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository.id, baseRef, branch, name]);

  async function handleRefresh() {
    setError(null);
    const next = await refreshWorktrees(repository.id);
    setWorktrees(next);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await createWorktree({
        repositoryId: repository.id,
        baseRef,
        branch: branch.trim(),
        name: name.trim() || undefined,
      });
      setWorktrees(result.worktrees);
      setBranch("");
      setName("");
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  }

  async function handlePreviewRemove(id: WorktreeId) {
    setError(null);
    try {
      setPreview(await getWorktreeRemovalPreview(id));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  }

  async function handleRemove(force: boolean) {
    if (!preview) {
      return;
    }
    setError(null);
    try {
      const result = await removeWorktree(preview.worktree.id, force);
      setWorktrees(result.worktrees);
      if (result.removed) {
        setPreview(null);
      } else if (result.blockers.length > 0) {
        setPreview({
          ...preview,
          allowed: false,
          requiresForce: result.requiresForce,
          blockers: result.blockers,
        });
      }
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section className="panel" aria-labelledby="worktrees-heading">
      <h2 id="worktrees-heading">Worktrees · {repository.name}</h2>
      {error ? (
        <p className="banner" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="hint">Loading worktrees…</p>
      ) : (
        <>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void handleRefresh()}
            >
              Refresh worktrees
            </button>
          </div>
          {worktrees.length === 0 ? (
            <p className="hint">No worktrees found.</p>
          ) : (
            <ul className="worktree-list">
              {worktrees.map((worktree) => (
                <li key={worktree.id}>
                  <div>
                    <strong>{worktree.name}</strong>{" "}
                    <span className="repository-path">{worktree.path}</span>
                  </div>
                  <div className="worktree-badges">
                    {statusLabels(worktree).map((label) => (
                      <span key={label} className="mode-badge">
                        {label}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void handlePreviewRemove(worktree.id)}
                  >
                    Remove worktree
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="stack"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create worktree</h3>
            <p className="hint">
              Creates a new branch from a local base. Attaching an existing
              branch is not supported yet.
            </p>
            <label className="field">
              <span>Base ref</span>
              <select
                value={baseRef}
                onChange={(event) => setBaseRef(event.target.value)}
              >
                {branches.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>New branch</span>
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Directory name (optional)</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {destination ? (
              <p className="hint">Destination: {destination}</p>
            ) : null}
            <button type="submit" disabled={busy || branch.trim() === ""}>
              Create worktree
            </button>
          </form>

          {preview ? (
            <div
              className="stack confirm-box"
              role="region"
              aria-label="Remove worktree"
            >
              <h3>Remove {preview.worktree.name}?</h3>
              <p className="hint">
                {preview.worktree.trackedChanges} modified,{" "}
                {preview.worktree.untrackedFiles} untracked.
                {preview.blockers.length > 0
                  ? ` Blocked: ${preview.blockers.join(", ")}.`
                  : " This worktree is clean."}{" "}
                The branch is kept.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </button>
                {preview.allowed ? (
                  <button
                    type="button"
                    onClick={() => void handleRemove(false)}
                  >
                    Remove worktree
                  </button>
                ) : null}
                {preview.requiresForce ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void handleRemove(true)}
                  >
                    Force remove
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function statusLabels(worktree: Worktree): string[] {
  const labels: string[] = [];
  if (worktree.isPrimary) {
    labels.push("primary");
  }
  if (!worktree.present) {
    labels.push("missing");
  }
  if (worktree.detached) {
    labels.push("detached");
  }
  if (worktree.locked) {
    labels.push("locked");
  }
  if (worktree.prunable) {
    labels.push("prunable");
  }
  if (worktree.trackedChanges > 0 || worktree.untrackedFiles > 0) {
    labels.push("dirty");
  } else if (worktree.present) {
    labels.push("clean");
  }
  if (worktree.branch) {
    labels.push(worktree.branch);
  }
  if (worktree.ahead !== null || worktree.behind !== null) {
    labels.push(`+${worktree.ahead ?? 0}/-${worktree.behind ?? 0}`);
  }
  return labels;
}
