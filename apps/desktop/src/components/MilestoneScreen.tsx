import { FormEvent, useEffect, useState } from "react";
import type {
  ForestConfiguration,
  ForestState,
  LaunchBehavior,
  RegisterRepositoryInput,
  RepositoryMode,
  WorktreeNamingStrategy,
} from "../types/forest";

interface MilestoneScreenProps {
  state: ForestState;
  error: string | null;
  busy: boolean;
  onSaveConfiguration: (configuration: ForestConfiguration) => void;
  onRegisterRepository: (input: RegisterRepositoryInput) => void;
}

export function MilestoneScreen({
  state,
  error,
  busy,
  onSaveConfiguration,
  onRegisterRepository,
}: MilestoneScreenProps) {
  const [configuration, setConfiguration] = useState(state.configuration);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<RepositoryMode>("linked");

  useEffect(() => {
    setConfiguration(state.configuration);
  }, [state.configuration]);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveConfiguration(configuration);
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRegisterRepository({
      name: name.trim(),
      path: path.trim(),
      mode,
    });
  }

  return (
    <main className="milestone">
      <header className="milestone-header">
        <h1>{state.appInfo.name}</h1>
        <p className="version">Version {state.appInfo.version}</p>
        <p className="tagline">{state.appInfo.tagline}</p>
      </header>

      {error ? (
        <p className="banner" role="alert">
          {error}
        </p>
      ) : null}

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

      <section className="panel" aria-labelledby="configuration-heading">
        <h2 id="configuration-heading">Configuration</h2>
        <form className="stack" onSubmit={handleSave}>
          <label className="field">
            <span>Forest root path</span>
            <input
              value={configuration.forestRoot}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  forestRoot: event.target.value,
                })
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Default terminal</span>
            <select
              value={configuration.defaultTerminal}
              onChange={() =>
                setConfiguration({
                  ...configuration,
                  defaultTerminal: "warp",
                })
              }
            >
              <option value="warp">Warp</option>
            </select>
          </label>

          <label className="field">
            <span>Default agent</span>
            <select
              value={configuration.defaultAgentId}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  defaultAgentId: event.target.value,
                })
              }
            >
              {state.agentDefinitions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Worktree naming</span>
            <select
              value={configuration.worktreeNamingStrategy}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  worktreeNamingStrategy: event.target
                    .value as WorktreeNamingStrategy,
                })
              }
            >
              <option value="branch_slug">Branch slug</option>
              <option value="branch_as_is">Branch as-is</option>
            </select>
          </label>

          <label className="field">
            <span>Launch behavior</span>
            <select
              value={configuration.launchBehavior}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  launchBehavior: event.target.value as LaunchBehavior,
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="tab">Tab</option>
              <option value="window">Window</option>
            </select>
          </label>

          <button type="submit" disabled={busy}>
            Save configuration
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="register-heading">
        <h2 id="register-heading">Register repository</h2>
        <p className="hint">
          Record an existing directory as Linked or Managed. Forest does not
          move, create, or delete repositories in this release.
        </p>
        <form className="stack" onSubmit={handleRegister}>
          <label className="field">
            <span>Repository name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Directory path</span>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <fieldset className="mode-fieldset">
            <legend>Mode</legend>
            <label>
              <input
                type="radio"
                name="repository-mode"
                value="linked"
                checked={mode === "linked"}
                onChange={() => setMode("linked")}
              />
              Linked
            </label>
            <label>
              <input
                type="radio"
                name="repository-mode"
                value="managed"
                checked={mode === "managed"}
                onChange={() => setMode("managed")}
              />
              Managed
            </label>
          </fieldset>
          <button type="submit" disabled={busy}>
            Register repository
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="repositories-heading">
        <h2 id="repositories-heading">Repositories</h2>
        {state.repositories.length === 0 ? (
          <p className="hint">No repositories indexed yet.</p>
        ) : (
          <ul className="repository-list">
            {state.repositories.map((repository) => (
              <li key={repository.id}>
                <span className="repository-name">{repository.name}</span>
                <span className={`mode-badge mode-${repository.mode}`}>
                  {repository.mode === "linked" ? "Linked" : "Managed"}
                </span>
                <span className="repository-path">{repository.path}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
