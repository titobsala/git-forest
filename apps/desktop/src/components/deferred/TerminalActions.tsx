/**
 * Inline row actions — docs/design.md section 4.1 ("Instant action buttons").
 *
 * Terminal and agent actions enable when their handlers are supplied.
 */

import type { MouseEvent } from "react";
import { shortcutLabel } from "../../lib/keymap";

interface TerminalActionsProps {
  /** Provider label from `ForestConfiguration.defaultTerminal`. */
  terminalName: string;
  /** Display name of the configured default agent. */
  agentName: string;
  onOpenTerminal?: () => void;
  onLaunchAgent?: () => void;
  /** Hide labels and show icons only, for the dense cockpit row. */
  compact?: boolean;
}

const PENDING_AGENT = "Launch the configured coding agent";

export function TerminalActions({
  terminalName,
  agentName,
  onOpenTerminal,
  onLaunchAgent,
  compact = false,
}: TerminalActionsProps) {
  function handleOpenTerminal(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onOpenTerminal?.();
  }

  function handleLaunchAgent(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onLaunchAgent?.();
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        className="gf-button px-1.5 py-0.5 text-micro"
        disabled={!onOpenTerminal}
        onClick={handleOpenTerminal}
        onKeyDown={(event) => event.stopPropagation()}
        title={
          onOpenTerminal
            ? `Open in ${terminalName} (${shortcutLabel("selection.open")})`
            : "Open a worktree in the configured terminal"
        }
      >
        <span aria-hidden="true">▸</span>
        {compact ? null : <span aria-hidden="true">{terminalName}</span>}
        <span className="sr-only">Open in {terminalName}</span>
      </button>
      <button
        type="button"
        className="gf-button px-1.5 py-0.5 text-micro"
        disabled={!onLaunchAgent}
        onClick={handleLaunchAgent}
        onKeyDown={(event) => event.stopPropagation()}
        title={
          onLaunchAgent
            ? `Launch ${agentName} (${shortcutLabel("selection.agent")})`
            : PENDING_AGENT
        }
      >
        <span aria-hidden="true">✦</span>
        {compact ? null : <span aria-hidden="true">{agentName}</span>}
        <span className="sr-only">Launch {agentName}</span>
      </button>
    </span>
  );
}
