import { useMemo, useState } from "react";
import { repositoryMatches } from "../lib/search";
import type { Repository, RepositoryId } from "../types/forest";

interface RepositoryBrowserProps {
  repositories: Repository[];
  busy: boolean;
  selectedId: RepositoryId | null;
  onSelect: (id: RepositoryId) => void;
  onRefresh: (id: RepositoryId) => void;
  onRemove: (id: RepositoryId) => void;
}

export function RepositoryBrowser({
  repositories,
  busy,
  selectedId,
  onSelect,
  onRefresh,
  onRemove,
}: RepositoryBrowserProps) {
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<RepositoryId | null>(null);
  const visible = useMemo(
    () =>
      repositories.filter((repository) => repositoryMatches(repository, query)),
    [repositories, query],
  );

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
                  {repository.primaryBranch ?? "no primary branch"}
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
                {confirmId === repository.id ? (
                  <>
                    <p className="hint confirm-copy">
                      Remove from Forest? The directory stays on disk.
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setConfirmId(null)}
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
                      Confirm remove
                    </button>
                  </>
                ) : (
                  <button
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
