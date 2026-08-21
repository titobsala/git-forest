/**
 * Settings view.
 *
 * Collects the forest status, configuration, link and scan panels that used to
 * occupy the main scroll. They keep their release 0.0.3 behaviour and are
 * re-skinned through the `.panel` primitives in app.css.
 */

import { ConfigurationPanel } from "../../components/ConfigurationPanel";
import { ForestStatusPanel } from "../../components/ForestStatusPanel";
import { LinkRepositoryForm } from "../../components/LinkRepositoryForm";
import { ScanRepositoriesPanel } from "../../components/ScanRepositoriesPanel";
import { RepositoryBrowser } from "../../components/RepositoryBrowser";
import type {
  ForestConfiguration,
  ForestState,
  ImportRepositoriesResult,
  ImportRepositoryInput,
  RepositoryId,
} from "../../types/forest";

interface SettingsViewProps {
  state: ForestState;
  busy: boolean;
  selectedId: RepositoryId | null;
  onSelect: (id: RepositoryId) => void;
  onSaveConfiguration: (configuration: ForestConfiguration) => void;
  onImportRepository: (input: ImportRepositoryInput) => void;
  onImportRepositories: (paths: string[]) => Promise<ImportRepositoriesResult>;
  onRefreshRepository: (id: RepositoryId) => void;
  onRemoveRepository: (id: RepositoryId) => void;
}

export function SettingsView({
  state,
  busy,
  selectedId,
  onSelect,
  onSaveConfiguration,
  onImportRepository,
  onImportRepositories,
  onRefreshRepository,
  onRemoveRepository,
}: SettingsViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <ForestStatusPanel state={state} />
        <ConfigurationPanel
          state={state}
          busy={busy}
          onSave={onSaveConfiguration}
        />
        <LinkRepositoryForm busy={busy} onImport={onImportRepository} />
        <ScanRepositoriesPanel busy={busy} onImport={onImportRepositories} />
        <RepositoryBrowser
          repositories={state.repositories}
          busy={busy}
          selectedId={selectedId}
          onSelect={onSelect}
          onRefresh={onRefreshRepository}
          onRemove={onRemoveRepository}
        />
      </div>
    </div>
  );
}
