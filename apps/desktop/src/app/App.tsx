import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfigurationPanel } from "../components/ConfigurationPanel";
import { ForestStatusPanel } from "../components/ForestStatusPanel";
import { LinkRepositoryForm } from "../components/LinkRepositoryForm";
import { RepositoryBrowser } from "../components/RepositoryBrowser";
import { ScanRepositoriesPanel } from "../components/ScanRepositoriesPanel";
import { WorktreePanel } from "../components/WorktreePanel";
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
  RepositoryId,
} from "../types/forest";
import { FALLBACK_FOREST_STATE } from "../types/forest";
import "./app.css";

type LoadStatus = "loading" | "ready" | "error";

export function App() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [state, setState] = useState<ForestState>(FALLBACK_FOREST_STATE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<RepositoryId | null>(null);

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

  async function handleRefresh(id: RepositoryId) {
    await runMutation(() => refreshRepository(id));
  }

  async function handleRemove(id: RepositoryId) {
    await runMutation(() => removeRepository(id));
    setSelectedId((current) => (current === id ? null : current));
  }

  const selectedRepository =
    state.repositories.find((repository) => repository.id === selectedId) ??
    null;

  if (status === "loading") {
    return (
      <main className="milestone">
        <p>Loading Forest…</p>
      </main>
    );
  }

  return (
    <AppShell state={state} error={error}>
      <ForestStatusPanel state={state} />
      <ConfigurationPanel
        state={state}
        busy={busy}
        onSave={(configuration) => {
          void handleSaveConfiguration(configuration);
        }}
      />
      <LinkRepositoryForm
        busy={busy}
        onImport={(input) => {
          void handleImportRepository(input);
        }}
      />
      <ScanRepositoriesPanel
        busy={busy}
        onImport={(paths) => handleImportRepositories(paths)}
      />
      <RepositoryBrowser
        repositories={state.repositories}
        busy={busy}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRefresh={(id) => {
          void handleRefresh(id);
        }}
        onRemove={(id) => {
          void handleRemove(id);
        }}
      />
      {selectedRepository ? (
        <WorktreePanel repository={selectedRepository} busy={busy} />
      ) : null}
    </AppShell>
  );
}
