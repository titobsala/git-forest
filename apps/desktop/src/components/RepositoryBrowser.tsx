import { useEffect, useMemo, useRef, useState } from "react";
import {
  canLocateRepository,
  repositoryHealthBadgeClass,
  repositoryHealthText,
} from "../lib/repository-health";
import { repositoryMatches } from "../lib/search";
import type { Repository, RepositoryId } from "../types/forest";

interface RepositoryBrowserProps {
  repositories: Repository[];
  busy: boolean;
  selectedId: RepositoryId | null;
  onSelect: (id: RepositoryId) => void;
  onRefresh: (id: RepositoryId) => void;
  onRemove: (id: RepositoryId) => void;
  onLocate?: (id: RepositoryId) => void;
}

export function RepositoryBrowser({
  repositories,
  busy,
  selectedId,
  onSelect,
  onRefresh,
  onRemove,
  onLocate,
}: RepositoryBrowserProps) {
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<RepositoryId | null>(null);
  const restoreId = useRef<RepositoryId | null>(null);
  const visible = useMemo(
    () =>
      repositories.filter((repository) => repositoryMatches(repository, query)),
    [repositories, query],
  );

  useEffect(() => {
    setConfirmId(null);
  }, [query, selectedId]);

  useEffect(() => {
    if (!confirmId) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreId.current = confirmId;
        setConfirmId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmId]);

  function disarm(id: RepositoryId) {
    restoreId.current = id;
    setConfirmId(null);
  }

  return (
    <section className="panel" aria-labelledby="repositories-heading">
      <h2 id="repositories-heading">Repositories</h2>
      <label className="field">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, path, branch, or remote"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      {repositories.length === 0 ? (
        <p className="hint">No repositories indexed yet.</p>
      ) : visible.length === 0 ? (
        <p className="hint">No repositories match that search.</p>
      ) : (
        <ul className="repository-list">
          {visible.map((repository) => (
            <li key={repository.id}>
              <button
                type="button"
                className={
                  repository.id === selectedId
                    ? "repository-select selected"
                    : "repository-select"
                }
                onClick={() => onSelect(repository.id)}
              >
                <span className="repository-name">{repository.name}</span>
                <span className={`mode-badge mode-${repository.mode}`}>
                  {repository.mode === "linked" ? "Linked" : "Managed"}
                </span>
                <span className="repository-path">{repository.path}</span>
                <span className="repository-meta">
                  <span
                    className={repositoryHealthBadgeClass(repository.health)}
                  >
                    {repositoryHealthText(repository)}
                  </span>
                  {` · ${repository.primaryBranch ?? "no primary branch"}`}
                  {repository.remoteUrl ? ` · ${repository.remoteUrl}` : ""}
                  {` · refreshed ${formatTimestamp(repository.lastRefreshedAt)}`}
                </span>
              </button>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => onRefresh(repository.id)}
                >
                  Refresh
                </button>
                {canLocateRepository(repository) && onLocate ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => onLocate(repository.id)}
                  >
                    Locate repository…
                  </button>
                ) : null}
                {confirmId === repository.id ? (
                  <div
                    role="region"
                    aria-label="Remove repository"
                    className="button-row"
                  >
                    <p className="hint confirm-copy">
                      Remove from Forest? The directory stays on disk.
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => disarm(repository.id)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmId(null);
                        onRemove(repository.id);
                      }}
                    >
                      Remove from Forest
                    </button>
                  </div>
                ) : (
                  <button
                    ref={(node) => {
                      if (node && restoreId.current === repository.id) {
                        node.focus();
                        restoreId.current = null;
                      }
                    }}
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmId(repository.id)}
                  >
                    Remove from Forest
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "never";
  }
  return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
