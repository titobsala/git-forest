import type { ForestState } from "../types/forest";

interface ForestStatusPanelProps {
  state: ForestState;
}

export function ForestStatusPanel({ state }: ForestStatusPanelProps) {
  return (
    <section className="panel" aria-labelledby="forest-status-heading">
      <h2 id="forest-status-heading">Forest status</h2>
      <dl className="status-grid">
        <div>
          <dt>Forest root</dt>
          <dd>{state.paths.forestRoot}</dd>
        </div>
        <div>
          <dt>App data</dt>
          <dd>{state.paths.appDataDir}</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>{state.paths.databasePath}</dd>
        </div>
        <div>
          <dt>Database initialized</dt>
          <dd>{state.databaseInitialized ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Schema version</dt>
          <dd>{state.schemaVersion}</dd>
        </div>
        <div>
          <dt>Repositories</dt>
          <dd>{state.repositories.length}</dd>
        </div>
      </dl>
    </section>
  );
}
