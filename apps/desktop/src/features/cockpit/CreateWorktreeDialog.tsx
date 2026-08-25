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
  listLocalBranches,
  previewCreateWorktree,
} from "../../lib/worktrees";
import type {
  AgentAvailability,
  AgentDefinition,
  AgentDefinitionId,
  LocalBranch,
  LocalFileCandidate,
  LocalFileCopyFailure,
  Repository,
  Worktree,
} from "../../types/forest";

const CREATE_ONLY = "";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CreateWorktreeDialogProps {
  repository: Repository;
  agentDefinitions: AgentDefinition[];
  defaultAgentId: AgentDefinitionId;
  onClose: () => void;
  onCreated: (worktrees: Worktree[], created: Worktree) => void;
  onAgentLaunched?: () => void;
}

export function CreateWorktreeDialog({
  repository,
  agentDefinitions,
  defaultAgentId,
  onClose,
  onCreated,
  onAgentLaunched,
}: CreateWorktreeDialogProps) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [baseRef, setBaseRef] = useState("main");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [localEnvFiles, setLocalEnvFiles] = useState<LocalFileCandidate[]>([]);
  const [copyLocalEnvFiles, setCopyLocalEnvFiles] = useState(true);
  const [copiedEnvFiles, setCopiedEnvFiles] = useState<string[]>([]);
  const [copyFailures, setCopyFailures] = useState<LocalFileCopyFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<AgentAvailability[]>([]);
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(
    null,
  );
  const [afterCreation, setAfterCreation] = useState(CREATE_ONLY);
  const [created, setCreated] = useState<Worktree | null>(null);
  const [pendingAgentId, setPendingAgentId] =
    useState<AgentDefinitionId | null>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const afterTouched = useRef(false);
  const copyChoiceTouched = useRef(false);

  const copyFailed = created !== null && copyFailures.length > 0;
  const launchFailed = created !== null && pendingAgentId !== null;
  const creationLocked = created !== null;

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
      copyLocalEnvFiles,
    })
      .then((result) => {
        if (!cancelled) {
          setDestination(result.destination);
          setLocalEnvFiles(result.localEnvFiles);
          if (result.localEnvFiles.length > 0 && !copyChoiceTouched.current) {
            setCopyLocalEnvFiles(true);
          }
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
  }, [repository.id, baseRef, branch, name, creationLocked, copyLocalEnvFiles]);

  async function launchSelected(
    worktree: Worktree,
    agentId: AgentDefinitionId,
  ) {
    try {
      await launchAgent(worktree.id, agentId);
      onAgentLaunched?.();
      onClose();
    } catch (caught: unknown) {
      const agentName =
        agentDefinitions.find((agent) => agent.id === agentId)?.name ?? agentId;
      setPendingAgentId(agentId);
      setError(
        `Worktree created, but ${agentName} did not launch. ${toCommandError(caught).message}`,
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creationLocked) {
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
        copyLocalEnvFiles,
      });
      setCreated(result.worktree);
      setCopiedEnvFiles(result.localEnvCopy.copied);
      setCopyFailures(result.localEnvCopy.failures);
      onCreated(result.worktrees, result.worktree);
      if (result.localEnvCopy.failures.length > 0) {
        return;
      }
      if (afterCreation) {
        await launchSelected(result.worktree, afterCreation);
      } else {
        onClose();
      }
    } catch (caught: unknown) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryLaunch() {
    if (!created || !pendingAgentId) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await launchSelected(created, pendingAgentId);
    } finally {
      setBusy(false);
    }
  }

  async function handleLaunchAnyway() {
    if (!created || !afterCreation) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await launchSelected(created, afterCreation);
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
          Creates a new branch from a local base. Attaching an existing branch
          is not supported yet.
        </p>

        {availabilityWarning ? (
          <p className="hint">{availabilityWarning}</p>
        ) : null}

        {error ? (
          <p className="banner" role="alert">
            {error}
          </p>
        ) : copyFailed ? (
          <p className="banner" role="alert">
            Worktree created, but local environment files did not copy
          </p>
        ) : null}

        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Base ref</span>
            <select
              value={baseRef}
              onChange={(event) => setBaseRef(event.target.value)}
              disabled={creationLocked}
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
                    copyChoiceTouched.current = true;
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

          {copyFailed && !launchFailed ? (
            <div className="stack">
              {copiedEnvFiles.length > 0 ? (
                <p className="hint font-mono">
                  Copied: {copiedEnvFiles.join(", ")}
                </p>
              ) : null}
              <ul className="hint font-mono">
                {copyFailures.map((failure) => (
                  <li key={failure.path}>
                    {failure.path}: {failure.error.message}
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <button type="button" className="secondary" onClick={onClose}>
                  Close
                </button>
                {afterCreation ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLaunchAnyway()}
                  >
                    Launch anyway
                  </button>
                ) : null}
              </div>
            </div>
          ) : launchFailed ? (
            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
              <button
                ref={retryRef}
                type="button"
                disabled={busy}
                onClick={() => void handleRetryLaunch()}
              >
                Retry launch
              </button>
            </div>
          ) : (
            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={busy || branch.trim() === ""}>
                Create worktree
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
