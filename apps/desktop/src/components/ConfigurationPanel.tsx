import { FormEvent, useEffect, useState } from "react";
import type {
  ForestConfiguration,
  ForestState,
  LaunchBehavior,
  ThemePreference,
  WorktreeNamingStrategy,
} from "../types/forest";

interface ConfigurationPanelProps {
  state: ForestState;
  busy: boolean;
  onSave: (configuration: ForestConfiguration) => void;
  /**
   * Theme is applied and persisted the moment it is picked, unlike the rest of
   * the form, which waits for Save. It is a preview-by-nature setting, and the
   * same control exists in the navigation rail.
   */
  onSelectTheme: (theme: ThemePreference) => void;
}

export function ConfigurationPanel({
  state,
  busy,
  onSave,
  onSelectTheme,
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

        <label className="field">
          <span>Theme</span>
          <select
            value={configuration.theme}
            onChange={(event) => {
              const theme = event.target.value as ThemePreference;
              setConfiguration({ ...configuration, theme });
              onSelectTheme(theme);
            }}
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <button type="submit" disabled={busy}>
          Save configuration
        </button>
      </form>
    </section>
  );
}
