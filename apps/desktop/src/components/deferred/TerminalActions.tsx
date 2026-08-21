/**
 * Inline row actions — docs/design.md section 4.1 ("Instant action buttons").
 *
 * AWAITING BACKEND: Release 0.0.5 (Terminal Provider System) for the terminal
 * action, Release 0.0.6 (Agent Runner System) for the agent action. Neither
 * `open_worktree_in_terminal` nor `launch_agent_session` exists yet, so both
 * buttons render disabled with an explanatory title rather than pretending to
 * work.
 *
 * To wire: pass `onOpenTerminal` / `onLaunchAgent` handlers. A supplied
 * handler enables its button automatically.
 */

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

const PENDING_TERMINAL = "Terminal launching arrives in release 0.0.5";
const PENDING_AGENT = "Agent launching arrives in release 0.0.6";

export function TerminalActions({
  terminalName,
  agentName,
  onOpenTerminal,
  onLaunchAgent,
  compact = false,
}: TerminalActionsProps) {
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        className="gf-button px-1.5 py-0.5 text-micro"
        disabled={!onOpenTerminal}
        onClick={onOpenTerminal}
        title={
          onOpenTerminal
            ? `Open in ${terminalName} (${shortcutLabel("selection.open")})`
            : PENDING_TERMINAL
        }
      >
        <span aria-hidden="true">▸</span>
        {compact ? null : terminalName}
        <span className="sr-only">Open in {terminalName}</span>
      </button>
      <button
        type="button"
        className="gf-button px-1.5 py-0.5 text-micro"
        disabled={!onLaunchAgent}
        onClick={onLaunchAgent}
        title={
          onLaunchAgent
            ? `Launch ${agentName} (${shortcutLabel("selection.agent")})`
            : PENDING_AGENT
        }
      >
        <span aria-hidden="true">✦</span>
        {compact ? null : agentName}
        <span className="sr-only">Launch {agentName}</span>
      </button>
    </span>
  );
}
