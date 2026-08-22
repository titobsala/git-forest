import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/shell/AppShell";
import { InspectorPanel } from "../components/shell/InspectorPanel";
import { L1Rail } from "../components/shell/L1Rail";
import { L2RepositoryPanel } from "../components/shell/L2RepositoryPanel";
import { TopBar } from "../components/shell/TopBar";
import { AgentMonitorView } from "../features/agents/AgentMonitorView";
import { CockpitView } from "../features/cockpit/CockpitView";
import { CreateWorktreeDialog } from "../features/cockpit/CreateWorktreeDialog";
import { isDirty } from "../features/cockpit/telemetry";
import { QuickLaunch } from "../features/launcher/QuickLaunch";
import { SettingsView } from "../features/settings/SettingsView";
import { TrayIndicator } from "../features/tray/TrayIndicator";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTheme } from "../hooks/useTheme";
import { useWorktreeIndex } from "../hooks/useWorktreeIndex";
import { errorMessage } from "../lib/errors";
import { getForestState, updateForestConfiguration } from "../lib/forest";
import {
  importRepositories,
  importRepository,
  refreshRepository,
  removeRepository,
} from "../lib/repositories";
import type {
  ForestConfiguration,
  ForestState,
  ImportRepositoryInput,
  ImportRepositoriesResult,
  Repository,
  RepositoryId,
  ThemePreference,
  Worktree,
  WorktreeId,
} from "../types/forest";
import { FALLBACK_FOREST_STATE } from "../types/forest";
import type { ViewId } from "./views";
import "./app.css";

type LoadStatus = "loading" | "ready" | "error";

export function App() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [state, setState] = useState<ForestState>(FALLBACK_FOREST_STATE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<ViewId>("cockpit");
  const [selectedId, setSelectedId] = useState<RepositoryId | null>(null);
  const [selectedWorktreeId, setSelectedWorktreeId] =
    useState<WorktreeId | null>(null);
  const [repositoriesCollapsed, setRepositoriesCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [creatingIn, setCreatingIn] = useState<Repository | null>(null);

  const index = useWorktreeIndex(state.repositories);

  useTheme(state.configuration.theme);

  useEffect(() => {
    let cancelled = false;

    void getForestState()
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setStatus("ready");
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState(FALLBACK_FOREST_STATE);
          setStatus("error");
          setError(errorMessage(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useKeyboardShortcuts(launcherOpen ? ["overlay", "global"] : ["global"], {
    "launcher.toggle": () => setLauncherOpen((current) => !current),
    "view.cockpit": () => setView("cockpit"),
    "overlay.close": () => setLauncherOpen(false),
  });

  async function runMutation(operation: () => Promise<ForestState>) {
    setBusy(true);
    try {
      const next = await operation();
      setState(next);
      setError(null);
      setStatus("ready");
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveConfiguration(configuration: ForestConfiguration) {
    await runMutation(() => updateForestConfiguration(configuration));
  }

  /**
   * The theme applies as soon as it is picked, from the rail or from Settings,
   * and is persisted in the same step — there is no unsaved theme state.
   */
  async function handleSelectTheme(theme: ThemePreference) {
    if (theme === state.configuration.theme) {
      return;
    }
    await runMutation(() =>
      updateForestConfiguration({ ...state.configuration, theme }),
    );
  }

  async function handleImportRepository(input: ImportRepositoryInput) {
    await runMutation(() => importRepository(input));
  }

  async function handleImportRepositories(
    paths: string[],
  ): Promise<ImportRepositoriesResult> {
    setBusy(true);
    try {
      const result = await importRepositories(paths);
      setState(result.state);
      setError(null);
      setStatus("ready");
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshRepository(id: RepositoryId) {
    await runMutation(() => refreshRepository(id));
    index.refresh(id);
  }

  async function handleRemoveRepository(id: RepositoryId) {
    await runMutation(() => removeRepository(id));
    index.forget(id);
    setSelectedId((current) => (current === id ? null : current));
  }

  function selectWorktree(worktree: Worktree, repository: Repository) {
    setSelectedId(repository.id);
    setSelectedWorktreeId(worktree.id);
  }

  const selectedRepository =
    state.repositories.find((repository) => repository.id === selectedId) ??
    null;

  const selectedWorktree = useMemo(() => {
    if (!selectedWorktreeId) {
      return null;
    }
    return (
      index.flat.find((row) => row.worktree.id === selectedWorktreeId)
        ?.worktree ?? null
    );
  }, [index.flat, selectedWorktreeId]);

  const trayCounts = useMemo(
    () => ({
      worktrees: index.flat.length,
      dirty: index.flat.filter((row) => isDirty(row.worktree)).length,
      // Awaiting agent session tracking (releases 0.0.6 / 0.0.8).
      agents: null,
    }),
    [index.flat],
  );

  if (status === "loading") {
    return (
      <div className="grid h-full place-items-center bg-canvas">
        <p className="text-body text-ink-muted">Loading Forest…</p>
      </div>
    );
  }

  return (
    <AppShell
      error={error}
      topBar={
        <TopBar
          appInfo={state.appInfo}
          view={view}
          tray={
            <TrayIndicator
              counts={trayCounts}
              canCreateWorktree={selectedRepository !== null}
              onOpenLauncher={() => setLauncherOpen(true)}
              onNewWorktree={() => setCreatingIn(selectedRepository)}
              onOpenSettings={() => setView("settings")}
            />
          }
        />
      }
      rail={
        <L1Rail
          view={view}
          onSelectView={setView}
          repositoriesCollapsed={repositoriesCollapsed}
          onToggleRepositories={() =>
            setRepositoriesCollapsed((current) => !current)
          }
          onOpenLauncher={() => setLauncherOpen(true)}
          theme={state.configuration.theme}
          onSelectTheme={(theme) => {
            void handleSelectTheme(theme);
          }}
        />
      }
      sidebar={
        <L2RepositoryPanel
          repositories={state.repositories}
          selectedId={selectedId}
          onSelect={setSelectedId}
          collapsed={repositoriesCollapsed}
          onToggleCollapsed={() =>
            setRepositoriesCollapsed((current) => !current)
          }
          index={index}
          onAddRepository={() => setView("settings")}
        />
      }
      inspector={
        <InspectorPanel
          repository={selectedRepository}
          worktree={selectedWorktree}
          configuration={state.configuration}
          agentDefinitions={state.agentDefinitions}
          collapsed={inspectorCollapsed}
          onToggleCollapsed={() => setInspectorCollapsed((current) => !current)}
          onWorktreesChanged={(worktrees) => {
            if (selectedRepository) {
              index.setWorktrees(selectedRepository.id, worktrees);
            }
          }}
          onRemoved={() => setSelectedWorktreeId(null)}
        />
      }
      overlays={
        <>
          <QuickLaunch
            open={launcherOpen}
            onClose={() => setLauncherOpen(false)}
            repositories={state.repositories}
            worktrees={index.flat}
            onOpenRepository={(repository) => {
              setSelectedId(repository.id);
              setView("cockpit");
            }}
            onOpenWorktree={(worktree, repository) => {
              selectWorktree(worktree, repository);
              setView("cockpit");
            }}
          />
          {creatingIn ? (
            <CreateWorktreeDialog
              repository={creatingIn}
              onClose={() => setCreatingIn(null)}
              onCreated={(worktrees, created) => {
                index.setWorktrees(creatingIn.id, worktrees);
                selectWorktree(created, creatingIn);
              }}
            />
          ) : null}
        </>
      }
    >
      {view === "cockpit" ? (
        <CockpitView
          repositories={state.repositories}
          index={index}
          configuration={state.configuration}
          agentDefinitions={state.agentDefinitions}
          selectedRepositoryId={selectedId}
          selectedWorktreeId={selectedWorktreeId}
          onSelectWorktree={selectWorktree}
          onToggleRepositories={() =>
            setRepositoriesCollapsed((current) => !current)
          }
          onToggleInspector={() => setInspectorCollapsed((current) => !current)}
          onNewWorktree={() => setCreatingIn(selectedRepository)}
        />
      ) : view === "agents" ? (
        <AgentMonitorView
          agentDefinitions={state.agentDefinitions}
          configuration={state.configuration}
        />
      ) : (
        <SettingsView
          state={state}
          busy={busy}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSaveConfiguration={(configuration) => {
            void handleSaveConfiguration(configuration);
          }}
          onSelectTheme={(theme) => {
            void handleSelectTheme(theme);
          }}
          onImportRepository={(input) => {
            void handleImportRepository(input);
          }}
          onImportRepositories={(paths) => handleImportRepositories(paths)}
          onRefreshRepository={(id) => {
            void handleRefreshRepository(id);
          }}
          onRemoveRepository={(id) => {
            void handleRemoveRepository(id);
          }}
        />
      )}
    </AppShell>
  );
}
