import { FormEvent, useEffect, useState } from "react";
import type {
  ForestConfiguration,
  ForestState,
  LaunchBehavior,
  WorktreeNamingStrategy,
} from "../types/forest";

interface ConfigurationPanelProps {
  state: ForestState;
  busy: boolean;
  onSave: (configuration: ForestConfiguration) => void;
}

export function ConfigurationPanel({
  state,
  busy,
  onSave,
}: ConfigurationPanelProps) {
  const [configuration, setConfiguration] = useState(state.configuration);

  useEffect(() => {
    setConfiguration(state.configuration);
  }, [state.configuration]);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(configuration);
  }

  return (
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
  );
}
