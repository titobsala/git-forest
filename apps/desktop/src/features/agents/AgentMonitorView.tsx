/**
 * Agent monitor view — docs/design.md section 3.1 (L1 rail "Agent Monitor").
 *
 * AWAITING BACKEND: live sessions need releases 0.0.6 (Agent Runner System)
 * and 0.0.8 (Sessions & Process Tracking). Until then this lists the
 * configured agent definitions, which are real state, and says plainly that
 * no session tracking exists yet rather than inventing rows.
 */

import type { AgentDefinition, ForestConfiguration } from "../../types/forest";

interface AgentMonitorViewProps {
  agentDefinitions: AgentDefinition[];
  configuration: ForestConfiguration;
}

export function AgentMonitorView({
  agentDefinitions,
  configuration,
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
          <h2 className="mb-2 text-heading text-ink">Running sessions</h2>
          <p className="text-body text-ink-muted">
            No session tracking yet. Launching agents arrives in release 0.0.6
            and live process state in release 0.0.8; this view will list running
            sessions, their worktree and their PID.
          </p>
        </section>
      </div>
    </div>
  );
}
