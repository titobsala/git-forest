import type { ReactNode } from "react";
import type { ForestState } from "../types/forest";

interface ForestStatusPanelProps {
  state: ForestState;
}

interface StatTileProps {
  label: string;
  children: ReactNode;
}

function StatTile({ label, children }: StatTileProps) {
  return (
    <div className="rounded-sm border border-card-border bg-canvas px-2 py-1.5">
      <dt className="text-micro tracking-wide text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 flex items-center text-display text-ink">
        {children}
      </dd>
    </div>
  );
}

/**
 * Forest status.
 *
 * Counts read as tiles; paths read as a label/value list. Paths are the widest
 * values on the page, so they are monospaced and truncated with the full value
 * on the element's title, rather than wrapping the panel out of shape.
 */
export function ForestStatusPanel({ state }: ForestStatusPanelProps) {
  const paths = [
    { label: "Forest root", value: state.paths.forestRoot },
    { label: "App data", value: state.paths.appDataDir },
    { label: "Database", value: state.paths.databasePath },
  ];

  return (
    <section className="panel" aria-labelledby="forest-status-heading">
      <h2 id="forest-status-heading">Forest status</h2>

      <dl className="mb-3 grid grid-cols-4 gap-2">
        <StatTile label="Version">v{state.appInfo.version}</StatTile>
        <StatTile label="Repositories">{state.repositories.length}</StatTile>
        <StatTile label="Schema">v{state.schemaVersion}</StatTile>
        <StatTile label="Database">
          <span
            className={
              state.databaseInitialized
                ? "gf-badge gf-badge-good"
                : "gf-badge gf-badge-high"
            }
          >
            {state.databaseInitialized ? "Initialized" : "Not initialized"}
          </span>
        </StatTile>
      </dl>

      <dl className="flex flex-col gap-1">
        {paths.map((path) => (
          <div
            key={path.label}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2"
          >
            <dt className="text-body text-ink-muted">{path.label}</dt>
            <dd
              className="m-0 truncate font-mono text-mono-code text-ink"
              title={path.value}
            >
              {path.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
