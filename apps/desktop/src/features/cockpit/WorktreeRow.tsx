/**
 * Dense worktree row — docs/design.md section 4.1.
 *
 * Row height stays at or below 40px (`--row-h`, 36px). Rows are options in a
 * composite listbox: exactly one is tabbable (roving tabindex) and ↑/↓ move
 * the selection, so Tab stays free for the panel toggles in section 5.
 */

import { useEffect, useRef } from "react";
import type { AgentSession, Worktree } from "../../types/forest";
import { AgentBadge } from "../../components/deferred/AgentBadge";
import { StashPill } from "../../components/deferred/StashPill";
import { TerminalActions } from "../../components/deferred/TerminalActions";
import {
  branchLabel,
  driftLabel,
  hierarchyMarker,
  telemetryBadges,
} from "./telemetry";

interface WorktreeRowProps {
  worktree: Worktree;
  index: number;
  total: number;
  selected: boolean;
  /** True when this row owns the list's single tab stop. */
  tabbable: boolean;
  onSelect: () => void;
  terminalName: string;
  agentName: string;
  onOpenTerminal?: () => void;
  onLaunchAgent?: () => void;
  session?: AgentSession | null;
  sessionAgentName?: string;
}

export function WorktreeRow({
  worktree,
  index,
  total,
  selected,
  tabbable,
  onSelect,
  terminalName,
  agentName,
  onOpenTerminal,
  onLaunchAgent,
  session = null,
  sessionAgentName,
}: WorktreeRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && tabbable && document.activeElement !== ref.current) {
      ref.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [selected, tabbable]);

  const drift = driftLabel(worktree);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={(event) => {
        // Space selects the focused row. Enter bubbles to the listbox so
        // `selection.open` can launch the terminal.
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "flex h-row items-center gap-2 border-l-2 px-2 text-body transition-colors",
        selected
          ? "border-brand bg-badge-good/30"
          : "border-transparent hover:bg-canvas",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="shrink-0 font-mono text-mono-code text-ink-muted/70"
      >
        {hierarchyMarker(index, total)}
      </span>

      <span
        className="truncate font-mono text-mono-code font-semibold text-ink"
        title={worktree.path}
      >
        {branchLabel(worktree)}
      </span>

      {worktree.isPrimary ? (
        <span className="gf-badge gf-badge-neutral shrink-0">primary</span>
      ) : null}

      {telemetryBadges(worktree).map((badge) => (
        <span
          key={badge.id}
          className={`gf-badge gf-badge-${badge.tone} shrink-0`}
          title={badge.title}
        >
          {badge.label}
        </span>
      ))}

      <StashPill count={null} />
      <AgentBadge session={session} agentName={sessionAgentName} />

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {drift ? (
          <span
            className="gf-badge gf-badge-neutral"
            title={`${worktree.ahead ?? 0} ahead, ${worktree.behind ?? 0} behind upstream`}
          >
            {drift}
          </span>
        ) : null}
        <TerminalActions
          terminalName={terminalName}
          agentName={agentName}
          compact
          onOpenTerminal={onOpenTerminal}
          onLaunchAgent={onLaunchAgent}
        />
      </span>
    </div>
  );
}
