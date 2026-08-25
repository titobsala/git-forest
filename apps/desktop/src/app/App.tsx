import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "../components/shell/AppShell";
import { InspectorPanel } from "../components/shell/InspectorPanel";
import { L1Rail } from "../components/shell/L1Rail";
import { L2RepositoryPanel } from "../components/shell/L2RepositoryPanel";
import { TopBar } from "../components/shell/TopBar";
import { AgentMonitorView } from "../features/agents/AgentMonitorView";
import { CockpitView } from "../features/cockpit/CockpitView";
import { CreateWorktreeDialog } from "../features/cockpit/CreateWorktreeDialog";
import { isDirty } from "../features/cockpit/telemetry";
import type { ActionContext } from "../features/launcher/actions";
import {
  buildCommands,
  type CommandActions,
  type SettingsFocus,
} from "../features/launcher/commands";
import { QuickLaunch } from "../features/launcher/QuickLaunch";
import { SettingsView } from "../features/settings/SettingsView";
import { TrayIndicator } from "../features/tray/TrayIndicator";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useGlobalLauncherShortcut } from "../hooks/useGlobalLauncherShortcut";
import { useTheme } from "../hooks/useTheme";
import { useWorktreeIndex } from "../hooks/useWorktreeIndex";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { clipboardAvailable, copyText } from "../lib/clipboard";
import { pickDirectory } from "../lib/dialog";
import { toCommandError } from "../lib/errors";
import { getForestState, updateForestConfiguration } from "../lib/forest";
import { isRepositoryAvailable } from "../lib/repository-health";
import { openWorktreeInTerminal } from "../lib/terminals";
import { launchAgent } from "../lib/agents";
import {
  importRepositories,
  importRepository,
  reconcileRepositories,
  refreshRepository,
  relocateRepository,
  removeRepository,
} from "../lib/repositories";
import type {
  CommandError,
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

/**
 * Repository and worktree selection travel together.
 *
 * A worktree is only meaningful inside its repository, so the two ids live in
 * one value instead of two independent states. Held apart, picking another
 * repository left the previous repository's worktree selected, and the
 * inspector then showed — and removed — that worktree under the wrong
 * repository, filing its rows back under the new one.
 */
interface Selection {
  repositoryId: RepositoryId | null;
  worktreeId: WorktreeId | null;
}

const EMPTY_SELECTION: Selection = { repositoryId: null, worktreeId: null };

const SETTINGS_RECOVERY_CODES = new Set([
  "terminal_unavailable",
  "agent_unavailable",
]);

function availableRepositoryIds(state: ForestState): RepositoryId[] {
  return state.repositories
    .filter((repository) => isRepositoryAvailable(repository))
    .map((repository) => repository.id);
}

export function App() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [state, setState] = useState<ForestState>(FALLBACK_FOREST_STATE);
  const [error, setError] = useState<CommandError | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const [view, setView] = useState<ViewId>("cockpit");
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const { repositoryId: selectedId, worktreeId: selectedWorktreeId } =
    selection;
  const [repositoriesCollapsed, setRepositoriesCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [creatingIn, setCreatingIn] = useState<Repository | null>(null);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus | null>(
    null,
  );

  const index = useWorktreeIndex(state.repositories, {
    paused: busy || reconciling,
  });
  const indexRef = useRef(index);
  indexRef.current = index;
  const wasReconciling = useRef(false);
  const sessions = useAgentSessions();

  useEffect(() => {
    if (wasReconciling.current && !reconciling) {
      indexRef.current.refreshAll(availableRepositoryIds(state));
    }
    wasReconciling.current = reconciling;
  }, [reconciling, state]);

  useTheme(state.configuration.theme);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const cached = await getForestState();
        if (cancelled) {
          return;
        }
        setState(cached);
        setStatus("ready");
        setError(null);
        setReconciling(true);
        try {
          const reconciled = await reconcileRepositories();
          if (cancelled) {
            return;
          }
          setState(reconciled);
        } catch (caught: unknown) {
          if (!cancelled) {
            setError(toCommandError(caught));
          }
        } finally {
          if (!cancelled) {
            setReconciling(false);
          }
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setState(FALLBACK_FOREST_STATE);
          setStatus("error");
          setError(toCommandError(caught));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useKeyboardShortcuts(launcherOpen ? ["overlay", "global"] : ["global"], {
    "launcher.toggle": () => setLauncherOpen((current) => !current),
    "view.cockpit": () => setView("cockpit"),
    "overlay.close": () => setLauncherOpen(false),
  });

  useGlobalLauncherShortcut({
    launcherOpen,
    setLauncherOpen,
  });

  async function runMutation(operation: () => Promise<ForestState>) {
    setBusy(true);
    try {
      const next = await operation();
      setState(next);
      setError(null);
      setStatus("ready");
    } catch (caught: unknown) {
      setError(toCommandError(caught));
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
      setError(toCommandError(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshRepository(id: RepositoryId) {
    await runMutation(() => refreshRepository(id));
    index.refresh(id);
  }

  async function handleRefreshForest() {
    setReconciling(true);
    try {
      const next = await reconcileRepositories();
      setState(next);
      setError(null);
      index.refreshAll(availableRepositoryIds(next));
    } catch (caught: unknown) {
      setError(toCommandError(caught));
    } finally {
      setReconciling(false);
    }
  }

  async function handleLocateRepository(id: RepositoryId) {
    const path = await pickDirectory();
    if (!path) {
      return;
    }
    await runMutation(() => relocateRepository(id, path));
    index.refresh(id);
  }

  function handleCleanupComplete(next: ForestState) {
    setState(next);
    setError(null);
    index.refreshAll(availableRepositoryIds(next));
  }

  async function handleRemoveRepository(id: RepositoryId) {
    await runMutation(() => removeRepository(id));
    index.forget(id);
    setSelection((current) =>
      current.repositoryId === id ? EMPTY_SELECTION : current,
    );
  }

  /** Move to a repository, dropping any worktree that belonged to another. */
  function selectRepository(id: RepositoryId) {
    setSelection((current) =>
      current.repositoryId === id
        ? current
        : { repositoryId: id, worktreeId: null },
    );
  }

  function selectWorktree(worktree: Worktree, repository: Repository) {
    setSelection({ repositoryId: repository.id, worktreeId: worktree.id });
  }

  function clearWorktreeSelection() {
    setSelection((current) => ({ ...current, worktreeId: null }));
  }

  async function handleOpenTerminal(worktree: Worktree) {
    if (!worktree.present) {
      return;
    }
    try {
      const result = await openWorktreeInTerminal(worktree.id);
      if (result.lastUsedAt) {
        index.touchWorktree(worktree.id, result.lastUsedAt);
      }
      setError(null);
    } catch (caught: unknown) {
      setError(toCommandError(caught));
    }
  }

  async function handleLaunchAgent(worktree: Worktree) {
    if (!worktree.present) {
      return;
    }
    try {
      const result = await launchAgent(worktree.id);
      if (result.lastUsedAt) {
        index.touchWorktree(worktree.id, result.lastUsedAt);
      }
      await sessions.refresh();
      setError(null);
    } catch (caught: unknown) {
      setError(toCommandError(caught));
    }
  }

  const selectedRepository =
    state.repositories.find((repository) => repository.id === selectedId) ??
    null;

  const selectedWorktree = useMemo(() => {
    if (!selectedId || !selectedWorktreeId) {
      return null;
    }
    return (
      index.flat.find(
        (row) =>
          row.repository.id === selectedId &&
          row.worktree.id === selectedWorktreeId,
      )?.worktree ?? null
    );
  }, [index.flat, selectedId, selectedWorktreeId]);

  /**
   * Command palette wiring.
   *
   * `App` already owns every piece of state the commands mutate, so the
   * registry is assembled here and the overlay stays presentational. Built
   * plainly rather than memoised: the arrays are tiny, and `QuickLaunch`
   * skips all ranking work while it is closed.
   */
  const commandActions: CommandActions = {
    setView,
    toggleRepositories: () => setRepositoriesCollapsed((current) => !current),
    toggleInspector: () => setInspectorCollapsed((current) => !current),
    selectTheme: (theme) => {
      void handleSelectTheme(theme);
    },
    newWorktree: () => setCreatingIn(selectedRepository),
    refreshRepository: (repository) => {
      void handleRefreshRepository(repository.id);
    },
    openSettings: (focus) => {
      setView("settings");
      setSettingsFocus(focus);
    },
    revealInspector: () => {
      setView("cockpit");
      setInspectorCollapsed(false);
    },
    openTerminal: (worktree) => {
      void handleOpenTerminal(worktree);
    },
    launchAgent: (worktree) => {
      void handleLaunchAgent(worktree);
    },
  };

  const commands = buildCommands({
    view,
    theme: state.configuration.theme,
    selectedRepository,
    selectedWorktree,
    repositoriesCollapsed,
    inspectorCollapsed,
    actions: commandActions,
  });

  function revealResult(repository: Repository, worktree: Worktree | null) {
    if (worktree) {
      selectWorktree(worktree, repository);
    } else {
      selectRepository(repository.id);
    }
    setView("cockpit");
  }

  const actionContext: ActionContext = {
    reveal: (result) => revealResult(result.repository, result.worktree),
    newWorktree: (repository) => setCreatingIn(repository),
    refreshRepository: (repository) => {
      void handleRefreshRepository(repository.id);
    },
    copyPath: (path) => {
      void copyText(path);
    },
    removeWorktree: (result) => {
      revealResult(result.repository, result.worktree);
      setInspectorCollapsed(false);
    },
    removeRepository: (repository) => {
      selectRepository(repository.id);
      setView("settings");
      setSettingsFocus("repositories");
    },
    canCopy: clipboardAvailable(),
    openTerminal: (worktree) => {
      void handleOpenTerminal(worktree);
    },
    launchAgent: (worktree) => {
      void handleLaunchAgent(worktree);
    },
  };

  const trayCounts = useMemo(
    () => ({
      worktrees: index.flat.length,
      dirty: index.flat.filter((row) => isDirty(row.worktree)).length,
      agents: sessions.activeCount,
    }),
    [index.flat, sessions.activeCount],
  );

  if (status === "loading") {
    return (
      <div className="grid h-full place-items-center bg-canvas">
        <p className="text-body text-ink-muted">Loading Forest…</p>
      </div>
    );
  }

  const errorBanner: ReactNode = error ? (
    <>
      <span>{error.message}</span>
      {SETTINGS_RECOVERY_CODES.has(error.code) ? (
        <button
          type="button"
          className="gf-button ml-2"
          onClick={() => setView("settings")}
        >
          Open Settings
        </button>
      ) : null}
    </>
  ) : null;

  const settingsBusy = busy || reconciling;

  return (
    <AppShell
      error={errorBanner}
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
          onSelect={selectRepository}
          collapsed={repositoriesCollapsed}
          onToggleCollapsed={() =>
            setRepositoriesCollapsed((current) => !current)
          }
          index={index}
          onAddRepository={() => setView("settings")}
          onLocate={handleLocateRepository}
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
          onRemoved={clearWorktreeSelection}
          onOpenTerminal={(worktree) => {
            void handleOpenTerminal(worktree);
          }}
          onLaunchAgent={(worktree) => {
            void handleLaunchAgent(worktree);
          }}
          session={
            selectedWorktree
              ? sessions.primarySession(selectedWorktree.id)
              : null
          }
        />
      }
      overlays={
        <>
          <QuickLaunch
            open={launcherOpen}
            onClose={() => setLauncherOpen(false)}
            repositories={state.repositories}
            worktrees={index.flat}
            commands={commands}
            actionContext={actionContext}
            onOpenRepository={(repository) => {
              selectRepository(repository.id);
              setView("cockpit");
            }}
            onOpenWorktreeInTerminal={(worktree, repository) => {
              selectWorktree(worktree, repository);
              void handleOpenTerminal(worktree);
            }}
          />
          {creatingIn ? (
            <CreateWorktreeDialog
              repository={creatingIn}
              agentDefinitions={state.agentDefinitions}
              defaultAgentId={state.configuration.defaultAgentId}
              onClose={() => setCreatingIn(null)}
              onCreated={(worktrees, created) => {
                index.setWorktrees(creatingIn.id, worktrees);
                selectWorktree(created, creatingIn);
              }}
              onAgentLaunched={() => {
                void sessions.refresh();
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
          onOpenTerminal={(worktree) => {
            void handleOpenTerminal(worktree);
          }}
          onLaunchAgent={(worktree) => {
            void handleLaunchAgent(worktree);
          }}
          onLocateRepository={(id) => {
            void handleLocateRepository(id);
          }}
          hasActiveSession={(worktree) =>
            sessions.hasActiveSession(worktree.id)
          }
          primarySession={(worktreeId) => sessions.primarySession(worktreeId)}
        />
      ) : view === "agents" ? (
        <AgentMonitorView
          agentDefinitions={state.agentDefinitions}
          configuration={state.configuration}
          sessions={sessions.sessions}
          worktrees={index.flat}
        />
      ) : (
        <SettingsView
          state={state}
          busy={settingsBusy}
          selectedId={selectedId}
          focus={settingsFocus}
          onFocusHandled={() => setSettingsFocus(null)}
          onSelect={selectRepository}
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
          onLocateRepository={(id) => {
            void handleLocateRepository(id);
          }}
          onRefreshForest={() => {
            void handleRefreshForest();
          }}
          onCleanupComplete={handleCleanupComplete}
        />
      )}
    </AppShell>
  );
}
