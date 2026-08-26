/**
 * Create-worktree dialog.
 *
 * Carries over the release 0.0.4 creation flow (base ref, new branch,
 * optional directory name, live destination preview) into the cockpit as a
 * modal, so the central stage stays a list rather than a form. After a
 * successful create, an optional agent launch uses the existing launch
 * command; a launch failure never retries creation.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { detectAgents, launchAgent } from "../../lib/agents";
import { toCommandError } from "../../lib/errors";
import {
  createWorktree,
  fetchBranchCatalog,
  listBranchCatalog,
  previewCreateWorktree,
} from "../../lib/worktrees";
import type {
  AgentAvailability,
  AgentDefinition,
  AgentDefinitionId,
  BranchCatalog,
  LocalFileCandidate,
  LocalFileCopyResult,
  Repository,
  Worktree,
} from "../../types/forest";

const CREATE_ONLY = "";

const EMPTY_CATALOG: BranchCatalog = {
  localBranches: [],
  remoteBranches: [],
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type CreatedOutcome = {
  worktree: Worktree;
  copy: LocalFileCopyResult;
  agentId: AgentDefinitionId | null;
  launchError: string | null;
};

interface CreateWorktreeDialogProps {
  repository: Repository;
  agentDefinitions: AgentDefinition[];
  defaultAgentId: AgentDefinitionId;
  onClose: () => void;
  onCreated: (worktrees: Worktree[], created: Worktree) => void;
  onAgentLaunched?: () => void;
}

function catalogContains(catalog: BranchCatalog, baseRef: string): boolean {
  return (
    catalog.localBranches.some((item) => item.name === baseRef) ||
    catalog.remoteBranches.some((item) => item.reference === baseRef)
  );
}

function defaultBaseRef(catalog: BranchCatalog, current: string): string {
  if (catalogContains(catalog, current)) {
    return current;
  }
  if (catalog.localBranches.some((item) => item.name === "main")) {
    return "main";
  }
  return (
    catalog.localBranches[0]?.name ??
    catalog.remoteBranches[0]?.reference ??
    current
  );
}

export function CreateWorktreeDialog({
  repository,
  agentDefinitions,
  defaultAgentId,
  onClose,
  onCreated,
  onAgentLaunched,
}: CreateWorktreeDialogProps) {
  const [catalog, setCatalog] = useState<BranchCatalog>(EMPTY_CATALOG);
  const [baseRef, setBaseRef] = useState("main");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [localEnvFiles, setLocalEnvFiles] = useState<LocalFileCandidate[]>([]);
  const [copyLocalEnvFiles, setCopyLocalEnvFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [availability, setAvailability] = useState<AgentAvailability[]>([]);
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(
    null,
  );
  const [afterCreation, setAfterCreation] = useState(CREATE_ONLY);
  const [createdOutcome, setCreatedOutcome] = useState<CreatedOutcome | null>(
    null,
  );
  const branchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const afterTouched = useRef(false);
  const branchTouched = useRef(false);

  const creationLocked = createdOutcome !== null;
  const copyFailed =
    createdOutcome !== null && createdOutcome.copy.failures.length > 0;
  const launchFailed =
    createdOutcome !== null && createdOutcome.launchError !== null;
  const catalogBusy = fetching || creationLocked;

  function suggestBranchFromBase(nextCatalog: BranchCatalog, nextBase: string) {
    if (branchTouched.current) {
      return;
    }
    const remote = nextCatalog.remoteBranches.find(
      (item) => item.reference === nextBase,
    );
    if (remote) {
      setBranch(remote.name);
    }
  }

  function handleBaseRefChange(nextBase: string) {
    setBaseRef(nextBase);
    suggestBranchFromBase(catalog, nextBase);
  }

  async function handleFetchRemotes() {
    if (catalogBusy) {
      return;
    }
    setError(null);
    setFetching(true);
    try {
      const next = await fetchBranchCatalog(repository.id);
      const nextBase = defaultBaseRef(next, baseRef);
      setCatalog(next);
      setBaseRef(nextBase);
      suggestBranchFromBase(next, nextBase);
    } catch (caught: unknown) {
      setError(toCommandError(caught).message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      previousFocus.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listBranchCatalog(repository.id)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setCatalog(next);
        setBaseRef(defaultBaseRef(next, "main"));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(toCommandError(caught).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository.id]);

  useEffect(() => {
    let cancelled = false;
    void detectAgents()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setAvailability(next);
        const configured = next.find((item) => item.id === defaultAgentId);
        if (configured?.installed && !afterTouched.current) {
          setAfterCreation(defaultAgentId);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setAvailabilityWarning(toCommandError(caught).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [defaultAgentId]);

  useEffect(() => {
    if (launchFailed) {
      retryRef.current?.focus();
      return;
    }
    branchRef.current?.focus();
  }, [launchFailed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const nodes = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      );
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!branch.trim() || creationLocked) {
      if (!branch.trim()) {
        setDestination(null);
        setLocalEnvFiles([]);
      }
      return;
    }
    let cancelled = false;
    void previewCreateWorktree({
      repositoryId: repository.id,
      baseRef,
      branch: branch.trim(),
      name: name.trim() || undefined,
      copyLocalEnvFiles: false,
    })
      .then((result) => {
        if (!cancelled) {
          setDestination(result.destination);
          setLocalEnvFiles(result.localEnvFiles);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDestination(null);
          setLocalEnvFiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository.id, baseRef, branch, name, creationLocked]);

  async function launchCreatedAgent(outcome: CreatedOutcome) {
    if (!outcome.agentId) {
      return;
    }
    const agentId = outcome.agentId;
    try {
      await launchAgent(outcome.worktree.id, agentId);
      onAgentLaunched?.();
      onClose();
    } catch (caught: unknown) {
      const agentName =
        agentDefinitions.find((agent) => agent.id === agentId)?.name ?? agentId;
      setCreatedOutcome((current) =>
        current
          ? {
              ...current,
              launchError: `Worktree created, but ${agentName} did not launch. ${toCommandError(caught).message}`,
            }
          : current,
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creationLocked || fetching) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await createWorktree({
        repositoryId: repository.id,
        baseRef,
        branch: branch.trim(),
        name: name.trim() || undefined,
        copyLocalEnvFiles: localEnvFiles.length > 0 && copyLocalEnvFiles,
      });
      const outcome: CreatedOutcome = {
        worktree: result.worktree,
        copy: result.localEnvCopy,
        agentId: afterCreation || null,
        launchError: null,
      };
      setCreatedOutcome(outcome);
      onCreated(result.worktrees, result.worktree);
      if (outcome.copy.failures.length > 0) {
        return;
      }
      if (outcome.agentId) {
        await launchCreatedAgent(outcome);
      } else {
        onClose();
      }
    } catch (caught: unknown) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePostCreateLaunch() {
    if (!createdOutcome?.agentId) {
      return;
    }
    setBusy(true);
    try {
      await launchCreatedAgent(createdOutcome);
    } finally {
      setBusy(false);
    }
  }

  function agentInstalled(id: AgentDefinitionId): boolean {
    return availability.some((item) => item.id === id && item.installed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[14vh] backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-worktree-heading"
        className="panel w-full max-w-md shadow-xl"
      >
        <h2 id="create-worktree-heading">
          Create worktree · {repository.name}
        </h2>
        <p className="hint">
          Creates a new local branch from the selected base. Selecting a remote
          branch configures the new branch to track that remote-tracking ref.
          Attaching an existing local branch is not supported.
        </p>

        {availabilityWarning ? (
          <p className="hint">{availabilityWarning}</p>
        ) : null}

        {error ? (
          <p className="banner" role="alert">
            {error}
          </p>
        ) : null}

        {copyFailed ? (
          <p className="banner" role="alert">
            Worktree created, but local environment files did not copy
          </p>
        ) : null}

        {createdOutcome?.launchError ? (
          <p className="banner" role="alert">
            {createdOutcome.launchError}
          </p>
        ) : null}

        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <span id="base-ref-label">Base ref</span>
            <div className="field-row">
              <select
                aria-labelledby="base-ref-label"
                value={baseRef}
                onChange={(event) => handleBaseRefChange(event.target.value)}
                disabled={catalogBusy}
              >
                <optgroup label="Local branches">
                  {catalog.localBranches.map((item) => (
                    <option key={`local:${item.name}`} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Remote branches">
                  {catalog.remoteBranches.map((item) => (
                    <option
                      key={`remote:${item.reference}`}
                      value={item.reference}
                    >
                      {`${item.remote}/${item.name}`}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button
                type="button"
                className="secondary"
                disabled={catalogBusy}
                aria-busy={fetching}
                onClick={() => void handleFetchRemotes()}
              >
                {fetching ? "Fetching…" : "Fetch remotes"}
              </button>
            </div>
          </div>

          <label className="field">
            <span>New branch</span>
            <input
              ref={branchRef}
              value={branch}
              onChange={(event) => {
                branchTouched.current = true;
                setBranch(event.target.value);
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={creationLocked}
            />
          </label>

          <label className="field">
            <span>Directory name (optional)</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={creationLocked}
            />
          </label>

          <label className="field">
            <span>After creation</span>
            <select
              value={afterCreation}
              onChange={(event) => {
                afterTouched.current = true;
                setAfterCreation(event.target.value);
              }}
              disabled={creationLocked}
            >
              <option value={CREATE_ONLY}>Create only</option>
              {agentDefinitions.map((agent) => {
                const installed = agentInstalled(agent.id);
                return (
                  <option key={agent.id} value={agent.id} disabled={!installed}>
                    {installed ? agent.name : `${agent.name} (Missing)`}
                  </option>
                );
              })}
            </select>
          </label>

          {destination ? (
            <p className="hint font-mono">Destination: {destination}</p>
          ) : null}

          {localEnvFiles.length > 0 ? (
            <div className="field">
              <label className="flex items-center gap-1.5 text-body">
                <input
                  type="checkbox"
                  checked={copyLocalEnvFiles}
                  disabled={creationLocked}
                  onChange={(event) => {
                    setCopyLocalEnvFiles(event.target.checked);
                  }}
                />
                Copy local environment files
              </label>
              <ul className="hint font-mono">
                {localEnvFiles.map((file) => (
                  <li key={file.path}>{file.path}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {copyFailed && createdOutcome ? (
            <div className="stack">
              {createdOutcome.copy.copied.length > 0 ? (
                <p className="hint font-mono">
                  Copied: {createdOutcome.copy.copied.join(", ")}
                </p>
              ) : null}
              <ul className="hint font-mono">
                {createdOutcome.copy.failures.map((failure) => (
                  <li key={failure.path}>
                    {failure.path}: {failure.error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {creationLocked ? (
            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
              {launchFailed ? (
                <button
                  ref={retryRef}
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePostCreateLaunch()}
                >
                  Retry launch
                </button>
              ) : copyFailed && createdOutcome?.agentId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePostCreateLaunch()}
                >
                  Launch anyway
                </button>
              ) : null}
            </div>
          ) : (
            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || fetching || branch.trim() === ""}
              >
                Create worktree
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
