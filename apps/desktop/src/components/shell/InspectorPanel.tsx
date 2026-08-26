/**
 * Right inspector panel — docs/design.md section 3.1.
 *
 * Metadata for the selected worktree: root path, drift and stash telemetry,
 * agent attach actions, and the safe deletion control (which keeps the
 * blocker/force confirmation flow required by AGENTS.md section 44).
 */

import { useEffect, useRef, useState } from "react";
import { toCommandError } from "../../lib/errors";
import { getWorktreeRemovalPreview, removeWorktree } from "../../lib/worktrees";
import type {
  ForestConfiguration,
  AgentDefinition,
  AgentSession,
  Repository,
  Worktree,
  WorktreeId,
  WorktreeRemovalPreview,
} from "../../types/forest";
import { AgentBadge } from "../deferred/AgentBadge";
import { StashPill } from "../deferred/StashPill";
import { TerminalActions } from "../deferred/TerminalActions";
import {
  branchLabel,
  driftLabel,
  telemetryBadges,
} from "../../features/cockpit/telemetry";
import { ChevronIcon } from "./icons";

interface InspectorPanelProps {
  repository: Repository | null;
  worktree: Worktree | null;
  configuration: ForestConfiguration;
  agentDefinitions: AgentDefinition[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onWorktreesChanged: (worktrees: Worktree[]) => void;
  onRemoved: () => void;
  onOpenTerminal?: (worktree: Worktree) => void;
  onLaunchAgent?: (worktree: Worktree) => void;
  session?: AgentSession | null;
}

function removalPreviewCopy(preview: WorktreeRemovalPreview): string {
  const { worktree, blockers } = preview;
  if (blockers.length > 0) {
    return `${worktree.trackedChanges} modified, ${worktree.untrackedFiles} untracked. Blocked: ${blockers.join(", ")}.`;
  }
  if (worktree.ignoredFiles > 0) {
    return `${worktree.ignoredFiles} ignored local files will be deleted with this worktree.`;
  }
  return `${worktree.trackedChanges} modified, ${worktree.untrackedFiles} untracked. This worktree is clean.`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-micro font-semibold tracking-wide text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="font-mono text-mono-code break-all text-ink">{value}</dd>
    </div>
  );
}

export function InspectorPanel({
  repository,
  worktree,
  configuration,
  agentDefinitions,
  collapsed,
  onToggleCollapsed,
  onWorktreesChanged,
  onRemoved,
  onOpenTerminal,
  onLaunchAgent,
  session = null,
}: InspectorPanelProps) {
  const [preview, setPreview] = useState<WorktreeRemovalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restoreFocus = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * The worktree every in-flight request was issued for.
   *
   * Preview and removal are slow enough for the selection to move on before
   * they answer. A late answer belongs to the worktree that was selected when
   * it was asked for, never to whatever is selected when it arrives.
   */
  const requestedFor = useRef<WorktreeId | null>(null);

  // Any change of selection invalidates a pending destructive confirmation.
  useEffect(() => {
    requestedFor.current = worktree?.id ?? null;
    setPreview(null);
    setError(null);
    setBusy(false);
    restoreFocus.current = false;
  }, [worktree?.id]);

  useEffect(() => {
    if (preview) {
      function onKey(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          restoreFocus.current = true;
          setPreview(null);
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
  }, [preview]);

  if (collapsed) {
    return (
      <div className="flex w-collapsed shrink-0 flex-col items-center border-l border-card-border bg-card py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand inspector panel"
          aria-expanded={false}
          title="Expand inspector panel"
          className="grid size-7 place-items-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <ChevronIcon className="rotate-180" />
        </button>
        <span className="mt-3 font-mono text-micro text-ink-muted [writing-mode:vertical-rl]">
          Inspector
        </span>
      </div>
    );
  }

  const agentName =
    agentDefinitions.find((agent) => agent.id === configuration.defaultAgentId)
      ?.name ?? configuration.defaultAgentId;

  async function handlePreviewRemove() {
    if (!worktree) {
      return;
    }
    const requested = worktree.id;
    setError(null);
    setBusy(true);
    try {
      const result = await getWorktreeRemovalPreview(requested);
      if (requestedFor.current !== requested) {
        return;
      }
      setPreview(result);
    } catch (caught: unknown) {
      if (requestedFor.current !== requested) {
        return;
      }
      setError(toCommandError(caught).message);
    } finally {
      if (requestedFor.current === requested) {
        setBusy(false);
      }
    }
  }

  async function handleRemove(force: boolean) {
    if (!preview) {
      return;
    }
    const requested = preview.worktree.id;
    setError(null);
    setBusy(true);
    try {
      const result = await removeWorktree(requested, force);
      if (requestedFor.current !== requested) {
        return;
      }
      onWorktreesChanged(result.worktrees);
      if (result.removed) {
        setPreview(null);
        onRemoved();
      } else if (result.blockers.length > 0) {
        setPreview({
          ...preview,
          allowed: false,
          requiresForce: result.requiresForce,
          blockers: result.blockers,
        });
      }
    } catch (caught: unknown) {
      if (requestedFor.current !== requested) {
        return;
      }
      setError(toCommandError(caught).message);
    } finally {
      if (requestedFor.current === requested) {
        setBusy(false);
      }
    }
  }

  return (
    <aside
      aria-label="Worktree inspector"
      className="flex w-inspector shrink-0 flex-col border-l border-card-border bg-card"
    >
      <div className="flex items-center gap-1 border-b border-card-border px-3 py-1.5">
        <h2 className="text-heading text-ink">Inspector</h2>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Collapse inspector panel"
          aria-expanded
          title="Collapse inspector panel"
          className="ml-auto grid size-6 place-items-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <ChevronIcon />
        </button>
      </div>

      {!worktree || !repository ? (
        <p className="px-3 py-4 text-body text-ink-muted">
          Select a worktree to inspect its telemetry.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <div>
            <p className="font-mono text-heading break-all text-ink">
              {branchLabel(worktree)}
            </p>
            <p className="text-body text-ink-muted">{repository.name}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {telemetryBadges(worktree).map((badge) => (
              <span
                key={badge.id}
                className={`gf-badge gf-badge-${badge.tone}`}
                title={badge.title}
              >
                {badge.label}
              </span>
            ))}
            {worktree.isPrimary ? (
              <span className="gf-badge gf-badge-neutral">primary</span>
            ) : null}
            <StashPill count={null} />
            <AgentBadge
              session={session}
              agentName={
                session
                  ? (agentDefinitions.find(
                      (agent) => agent.id === session.agentDefinitionId,
                    )?.name ?? session.agentDefinitionId)
                  : undefined
              }
            />
          </div>

          <dl className="space-y-2">
            <Field label="Root path" value={worktree.path} />
            <Field label="Repository" value={repository.path} />
            <Field label="Head" value={worktree.head ?? "—"} />
            <Field
              label="Drift"
              value={driftLabel(worktree) ?? "in sync with upstream"}
            />
            <Field
              label="Changes"
              value={`${worktree.trackedChanges} tracked · ${worktree.untrackedFiles} untracked · ${worktree.ignoredFiles} ignored`}
            />
            {worktree.statusError ? (
              <Field label="Status" value={worktree.statusError.message} />
            ) : null}
            {worktree.prunable && worktree.prunableReason ? (
              <Field label="Prunable" value={worktree.prunableReason} />
            ) : null}
            {worktree.locked ? (
              <Field
                label="Lock reason"
                value={worktree.lockReason ?? "locked"}
              />
            ) : null}
            <Field label="Updated" value={worktree.updatedAt} />
          </dl>

          <div className="space-y-1.5">
            <p className="gf-label">Session</p>
            <TerminalActions
              terminalName={configuration.defaultTerminal}
              agentName={agentName}
              onOpenTerminal={
                worktree.present && onOpenTerminal
                  ? () => onOpenTerminal(worktree)
                  : undefined
              }
              onLaunchAgent={
                worktree.present && onLaunchAgent
                  ? () => onLaunchAgent(worktree)
                  : undefined
              }
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-sm bg-badge-high px-2 py-1 text-body text-badge-high-ink"
            >
              {error}
            </p>
          ) : null}

          {worktree.gitKnown && !worktree.statusError ? (
            <div className="space-y-1.5 border-t border-card-border pt-3">
              <p className="gf-label">Danger zone</p>
              {!preview ? (
                <button
                  ref={triggerRef}
                  type="button"
                  className="gf-button gf-button-danger"
                  disabled={busy}
                  onClick={() => void handlePreviewRemove()}
                >
                  Remove worktree
                </button>
              ) : (
                <div
                  role="region"
                  aria-label="Remove worktree"
                  className="space-y-2 rounded-sm border border-badge-high-ink/40 p-2"
                >
                  <p className="text-body text-ink">
                    Remove {preview.worktree.name}?
                  </p>
                  <p className="text-body text-ink-muted">
                    {removalPreviewCopy(preview)} The branch is kept.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="gf-button"
                      onClick={() => {
                        restoreFocus.current = true;
                        setPreview(null);
                      }}
                    >
                      Cancel
                    </button>
                    {preview.allowed ? (
                      <button
                        type="button"
                        className="gf-button gf-button-danger"
                        disabled={busy}
                        onClick={() => void handleRemove(false)}
                      >
                        Remove worktree
                      </button>
                    ) : null}
                    {preview.requiresForce ? (
                      <button
                        type="button"
                        className="gf-button gf-button-force"
                        disabled={busy}
                        onClick={() => void handleRemove(true)}
                      >
                        Force remove
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
