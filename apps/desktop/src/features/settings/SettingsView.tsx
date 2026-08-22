/**
 * Settings view.
 *
 * Collects the forest status, configuration, link and scan panels that used to
 * occupy the main scroll. They keep their release 0.0.3 behaviour and are
 * re-skinned through the `.panel` primitives in app.css.
 *
 * `focus` lets a Quick Launch command land on a specific panel — "Link
 * repository…" should do more than drop the user at the top of the page. The
 * scrolling is done from here through wrapper refs so the panels themselves
 * stay untouched.
 */

import { useEffect, useRef } from "react";
import { ConfigurationPanel } from "../../components/ConfigurationPanel";
import { ForestStatusPanel } from "../../components/ForestStatusPanel";
import { LinkRepositoryForm } from "../../components/LinkRepositoryForm";
import { ScanRepositoriesPanel } from "../../components/ScanRepositoriesPanel";
import { RepositoryBrowser } from "../../components/RepositoryBrowser";
import type { SettingsFocus } from "../launcher/commands";
import type {
  ForestConfiguration,
  ForestState,
  ImportRepositoriesResult,
  ImportRepositoryInput,
  RepositoryId,
  ThemePreference,
} from "../../types/forest";

interface SettingsViewProps {
  state: ForestState;
  busy: boolean;
  selectedId: RepositoryId | null;
  /** Panel to scroll to and focus once, set by a Quick Launch command. */
  focus: SettingsFocus | null;
  onFocusHandled: () => void;
  onSelect: (id: RepositoryId) => void;
  onSaveConfiguration: (configuration: ForestConfiguration) => void;
  onSelectTheme: (theme: ThemePreference) => void;
  onImportRepository: (input: ImportRepositoryInput) => void;
  onImportRepositories: (paths: string[]) => Promise<ImportRepositoriesResult>;
  onRefreshRepository: (id: RepositoryId) => void;
  onRemoveRepository: (id: RepositoryId) => void;
}

export function SettingsView({
  state,
  busy,
  selectedId,
  focus,
  onFocusHandled,
  onSelect,
  onSaveConfiguration,
  onSelectTheme,
  onImportRepository,
  onImportRepositories,
  onRefreshRepository,
  onRemoveRepository,
}: SettingsViewProps) {
  const panels = {
    link: useRef<HTMLDivElement>(null),
    scan: useRef<HTMLDivElement>(null),
    repositories: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    if (!focus) {
      return;
    }

    const panel = panels[focus].current;
    if (panel) {
      // Optional-called: jsdom has no layout, so it does not implement this.
      panel.scrollIntoView?.({ block: "start" });
      panel.querySelector<HTMLElement>("input, button")?.focus();
    }

    onFocusHandled();
    // Re-running on ref identity is meaningless; the focus request is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <ForestStatusPanel state={state} />
        <ConfigurationPanel
          state={state}
          busy={busy}
          onSave={onSaveConfiguration}
          onSelectTheme={onSelectTheme}
        />
        <div ref={panels.link}>
          <LinkRepositoryForm busy={busy} onImport={onImportRepository} />
        </div>
        <div ref={panels.scan}>
          <ScanRepositoriesPanel busy={busy} onImport={onImportRepositories} />
        </div>
        <div ref={panels.repositories}>
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
    </div>
  );
}
