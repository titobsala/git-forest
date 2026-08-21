import { FormEvent, useEffect, useRef, useState } from "react";
import { pickDirectory } from "../lib/dialog";
import {
  cancelRepositoryScan,
  listenToScanComplete,
  listenToScanProgress,
  startRepositoryScan,
} from "../lib/scan";
import type {
  ImportRepositoriesResult,
  ScanCandidate,
  ScanCompletedPayload,
  ScanProgressPayload,
} from "../types/forest";

interface ScanRepositoriesPanelProps {
  busy: boolean;
  onImport: (paths: string[]) => Promise<ImportRepositoriesResult>;
}

export function ScanRepositoriesPanel({
  busy,
  onImport,
}: ScanRepositoriesPanelProps) {
  const [root, setRoot] = useState("");
  const [maxDepth, setMaxDepth] = useState(4);
  const [scanId, setScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgressPayload | null>(null);
  const [completed, setCompleted] = useState<ScanCompletedPayload | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const completedScanIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    void Promise.resolve(
      listenToScanProgress((payload) => {
        if (!cancelled) {
          setProgress(payload);
        }
      }),
    ).then((unlisten) => {
      if (typeof unlisten === "function") {
        unlistenProgress = unlisten;
      }
    });
    void Promise.resolve(
      listenToScanComplete((payload) => {
        if (!cancelled) {
          completedScanIds.current.add(payload.scanId);
          setCompleted(payload);
          setScanId((current) => {
            if (current === payload.scanId) {
              completedScanIds.current.delete(payload.scanId);
              return null;
            }
            return current;
          });
          setSelected(defaultSelection(payload.candidates));
        }
      }),
    ).then((unlisten) => {
      if (typeof unlisten === "function") {
        unlistenComplete = unlisten;
      }
    });

    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, []);

  async function handleBrowse() {
    const selectedPath = await pickDirectory();
    if (selectedPath) {
      setRoot(selectedPath);
    }
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanError(null);
    setImportSummary(null);
    setCompleted(null);
    setProgress(null);
    try {
      const id = await startRepositoryScan(root.trim(), maxDepth);
      if (!completedScanIds.current.delete(id)) {
        setScanId(id);
      }
    } catch (error) {
      setScanError(errorMessage(error));
    }
  }

  async function handleCancel() {
    if (!scanId) {
      return;
    }
    try {
      await cancelRepositoryScan(scanId);
    } catch (error) {
      setScanError(errorMessage(error));
    }
  }

  async function handleImport() {
    const paths = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([path]) => path);
    if (paths.length === 0) {
      return;
    }
    const result = await onImport(paths);
    setImportSummary(
      `Imported ${result.imported.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.`,
    );
  }

  const scanning = scanId !== null;

  return (
    <section className="panel" aria-labelledby="scan-heading">
      <h2 id="scan-heading">Scan folder</h2>
      <p className="hint">
        Discover Git repositories under a folder. Review candidates before they
        are indexed. Scanning never moves or deletes files.
      </p>
      <form className="stack" onSubmit={(event) => void handleStart(event)}>
        <label className="field">
          <span>Scan root</span>
          <input
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Maximum depth</span>
          <input
            type="number"
            min={0}
            max={8}
            value={maxDepth}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={() => void handleBrowse()}
          >
            Browse…
          </button>
          <button
            type="submit"
            disabled={busy || scanning || root.trim() === ""}
          >
            Start scan
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void handleCancel()}
            disabled={!scanning}
          >
            Cancel scan
          </button>
        </div>
      </form>

      {scanError ? (
        <p className="banner" role="alert">
          {scanError}
        </p>
      ) : null}

      {progress && scanning ? (
        <p className="hint" role="status">
          Scanning {progress.currentPath ?? "…"} — {progress.directoriesVisited}{" "}
          directories, {progress.candidatesFound} repositories found.
        </p>
      ) : null}

      {completed ? (
        <div className="stack">
          <p className="hint" role="status">
            {completed.cancelled ? "Scan cancelled. " : "Scan complete. "}
            {completed.candidates.length} repositories found after{" "}
            {completed.directoriesVisited} directories.
          </p>
          {completed.warnings.length > 0 ? (
            <ul className="warning-list">
              {completed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {completed.candidates.length === 0 ? (
            <p className="hint">No Git repositories found.</p>
          ) : (
            <fieldset className="candidate-list">
              <legend>Candidates</legend>
              {completed.candidates.map((candidate) => (
                <label key={candidate.path} className="candidate-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[candidate.path])}
                    disabled={candidate.alreadyIndexed}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [candidate.path]: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>{candidate.name}</strong> {candidate.path}
                    {candidate.alreadyIndexed ? " (already indexed)" : ""}
                    {candidate.primaryBranch
                      ? ` · ${candidate.primaryBranch}`
                      : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            disabled={busy || selectedPaths(selected).length === 0}
            onClick={() => void handleImport()}
          >
            Import selected
          </button>
        </div>
      ) : null}

      {importSummary ? <p className="hint">{importSummary}</p> : null}
    </section>
  );
}

function defaultSelection(
  candidates: ScanCandidate[],
): Record<string, boolean> {
  return Object.fromEntries(
    candidates.map((candidate) => [candidate.path, !candidate.alreadyIndexed]),
  );
}

function selectedPaths(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, checked]) => checked)
    .map(([path]) => path);
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Scan failed.";
}
