/**
 * Agent session pill — docs/design.md section 4.1.
 *
 * Renders nothing when there is no primary active session for the worktree.
 */

import type { AgentSession } from "../../types/forest";

interface AgentBadgeProps {
  session: AgentSession | null;
  /** Display name from the matching `AgentDefinition`. */
  agentName?: string;
}

export function AgentBadge({ session, agentName }: AgentBadgeProps) {
  if (!session) {
    return null;
  }

  const live = session.status === "running" || session.status === "starting";
  const name = agentName ?? session.agentDefinitionId;
  const pid = session.pid === null ? null : `PID ${session.pid}`;

  return (
    <span
      className={live ? "gf-badge gf-badge-good" : "gf-badge gf-badge-neutral"}
      title={`${name} — ${session.status}${pid ? ` (${pid})` : ""}`}
    >
      <span
        aria-hidden="true"
        className={
          live
            ? "size-1.5 animate-pulse rounded-full bg-brand"
            : "size-1.5 rounded-full bg-ink-muted/50"
        }
      />
      {name}
      {pid ? <span className="opacity-75">{pid}</span> : null}
    </span>
  );
}
