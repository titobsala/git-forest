/**
 * Create-worktree dialog.
 *
 * Carries over the release 0.0.4 creation flow (base ref, new branch,
 * optional directory name, live destination preview) into the cockpit as a
 * modal, so the central stage stays a list rather than a form.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/errors";
import {
  createWorktree,
  listLocalBranches,
  previewCreateWorktree,
} from "../../lib/worktrees";
import type { LocalBranch, Repository, Worktree } from "../../types/forest";

interface CreateWorktreeDialogProps {
  repository: Repository;
  onClose: () => void;
  onCreated: (worktrees: Worktree[], created: Worktree) => void;
}

export function CreateWorktreeDialog({
  repository,
  onClose,
  onCreated,
}: CreateWorktreeDialogProps) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [baseRef, setBaseRef] = useState("main");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const branchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listLocalBranches(repository.id)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setBranches(next);
        if (next.some((item) => item.name === "main")) {
          setBaseRef("main");
        } else if (next[0]) {
          setBaseRef(next[0].name);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository.id]);

  useEffect(() => {
    branchRef.current?.focus();
  }, []);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await createWorktree({
        repositoryId: repository.id,
        baseRef,
        branch: branch.trim(),
        name: name.trim() || undefined,
      });
      onCreated(result.worktrees, result.worktree);
      onClose();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[14vh] backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-worktree-heading"
        className="panel w-full max-w-md shadow-xl"
      >
        <h2 id="create-worktree-heading">
          Create worktree · {repository.name}
        </h2>
        <p className="hint">
          Creates a new branch from a local base. Attaching an existing branch
          is not supported yet.
        </p>

        {error ? (
          <p className="banner" role="alert">
            {error}
          </p>
        ) : null}

        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
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
              ref={branchRef}
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
            <p className="hint font-mono">Destination: {destination}</p>
          ) : null}

          <div className="button-row">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy || branch.trim() === ""}>
              Create worktree
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
