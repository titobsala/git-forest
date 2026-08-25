/**
 * Agent monitor view — docs/design.md section 3.1 (L1 rail "Agent Monitor").
 *
 * Lists configured agent definitions and every persisted session after
 * reconciliation, including exited and unknown rows.
 */

import type {
  AgentDefinition,
  AgentSession,
  ForestConfiguration,
} from "../../types/forest";
import type { RepositoryWorktree } from "../../hooks/useWorktreeIndex";
import { branchLabel } from "../cockpit/telemetry";

interface AgentMonitorViewProps {
  agentDefinitions: AgentDefinition[];
  configuration: ForestConfiguration;
  sessions: AgentSession[];
  worktrees: RepositoryWorktree[];
}

function sessionLocation(
  session: AgentSession,
  worktrees: RepositoryWorktree[],
): string {
  const row = worktrees.find((item) => item.worktree.id === session.worktreeId);
  if (!row) {
    return session.worktreeId;
  }
  return `${row.repository.name} / ${branchLabel(row.worktree)}`;
}

export function AgentMonitorView({
  agentDefinitions,
  configuration,
  sessions,
  worktrees,
}: AgentMonitorViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <section className="gf-surface p-3">
          <h2 className="mb-2 text-heading text-ink">Configured agents</h2>
          <ul className="flex flex-col">
            {agentDefinitions.map((agent) => (
              <li
                key={agent.id}
                className="flex h-row items-center gap-2 border-b border-card-border last:border-b-0"
              >
                <span className="text-body font-semibold text-ink">
                  {agent.name}
                </span>
                {agent.id === configuration.defaultAgentId ? (
                  <span className="gf-badge gf-badge-good">default</span>
                ) : null}
                {agent.isBuiltin ? (
                  <span className="gf-badge gf-badge-neutral">builtin</span>
                ) : null}
                <span className="ml-auto font-mono text-mono-code text-ink-muted">
                  {[agent.command, ...agent.args].join(" ")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="gf-surface p-3">
          <h2 className="mb-2 text-heading text-ink">Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-body text-ink-muted">
              No agent sessions yet. Launch an agent from a worktree to track it
              here.
            </p>
          ) : (
            <ul className="flex flex-col">
              {sessions.map((session) => {
                const agentName =
                  agentDefinitions.find(
                    (agent) => agent.id === session.agentDefinitionId,
                  )?.name ?? session.agentDefinitionId;
                const live =
                  session.status === "running" || session.status === "starting";
                return (
                  <li
                    key={session.id}
                    className="flex h-row items-center gap-2 border-b border-card-border last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        live
                          ? "size-1.5 animate-pulse rounded-full bg-brand"
                          : "size-1.5 rounded-full bg-ink-muted/50"
                      }
                    />
                    <span className="text-body font-semibold text-ink">
                      {agentName}
                    </span>
                    <span className="gf-badge gf-badge-neutral">
                      {session.status}
                    </span>
                    {session.pid !== null ? (
                      <span className="font-mono text-mono-code text-ink-muted">
                        PID {session.pid}
                      </span>
                    ) : null}
                    <span className="ml-auto truncate font-mono text-mono-code text-ink-muted">
                      {sessionLocation(session, worktrees)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
