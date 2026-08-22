import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  ForestConfiguration,
  ForestState,
  LaunchBehavior,
  ThemePreference,
  WorktreeNamingStrategy,
} from "../types/forest";

/**
 * True when two persisted snapshots differ in nothing but the theme.
 *
 * The theme is written the moment it is picked, so it is the one field that
 * changes underneath an open form. Every other field waits for Save.
 */
function themeOnlyChange(
  previous: ForestConfiguration,
  next: ForestConfiguration,
): boolean {
  return (
    previous.theme !== next.theme &&
    previous.forestRoot === next.forestRoot &&
    previous.defaultTerminal === next.defaultTerminal &&
    previous.defaultAgentId === next.defaultAgentId &&
    previous.worktreeNamingStrategy === next.worktreeNamingStrategy &&
    previous.launchBehavior === next.launchBehavior
  );
}

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
  const persisted = state.configuration;
  const [configuration, setConfiguration] = useState(persisted);
  const synced = useRef(persisted);

  /**
   * Re-seed the draft from the persisted configuration — except when the only
   * thing that moved is the theme. Persisting a theme returns fresh forest
   * state, and replacing the whole draft there would throw away forest-root,
   * agent, naming or launch edits the user has not saved yet.
   */
  useEffect(() => {
    const previous = synced.current;
    synced.current = persisted;
    setConfiguration((draft) =>
      themeOnlyChange(previous, persisted)
        ? { ...draft, theme: persisted.theme }
        : persisted,
    );
  }, [persisted]);

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
