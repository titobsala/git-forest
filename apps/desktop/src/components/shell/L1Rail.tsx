/**
 * L1 icon navigation rail — docs/design.md section 3.1.
 *
 * Fixed 56px rail: Cockpit, sidebar collapse toggle, Quick Launch trigger,
 * Agent monitor, Settings.
 */

import type { ReactNode } from "react";
import { shortcutLabel } from "../../lib/keymap";
import type { ViewId } from "../../app/views";
import {
  CockpitIcon,
  PulseIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
} from "./icons";

interface RailButtonProps {
  label: string;
  hint?: string;
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function RailButton({
  label,
  hint,
  active = false,
  pressed,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      className={[
        "grid size-9 place-items-center rounded-md transition-colors",
        active
          ? "bg-badge-good text-badge-good-ink"
          : "text-rail-icon hover:bg-canvas hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

interface L1RailProps {
  view: ViewId;
  onSelectView: (view: ViewId) => void;
  repositoriesCollapsed: boolean;
  onToggleRepositories: () => void;
  onOpenLauncher: () => void;
}

export function L1Rail({
  view,
  onSelectView,
  repositoriesCollapsed,
  onToggleRepositories,
  onOpenLauncher,
}: L1RailProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex w-rail shrink-0 flex-col items-center gap-1 border-r border-rail-divider bg-rail py-2"
    >
      <RailButton
        label="Cockpit"
        hint={shortcutLabel("view.cockpit")}
        active={view === "cockpit"}
        onClick={() => onSelectView("cockpit")}
      >
        <CockpitIcon />
      </RailButton>

      <RailButton
        label={
          repositoriesCollapsed
            ? "Expand repositories sidebar"
            : "Collapse repositories sidebar"
        }
        hint={shortcutLabel("panel.repositories")}
        pressed={!repositoriesCollapsed}
        onClick={onToggleRepositories}
      >
        <SidebarIcon />
      </RailButton>

      <RailButton
        label="Quick Launch"
        hint={shortcutLabel("launcher.toggle")}
        onClick={onOpenLauncher}
      >
        <SearchIcon />
      </RailButton>

      <RailButton
        label="Agent monitor"
        active={view === "agents"}
        onClick={() => onSelectView("agents")}
      >
        <PulseIcon />
      </RailButton>

      <div className="mt-auto">
        <RailButton
          label="Settings"
          active={view === "settings"}
          onClick={() => onSelectView("settings")}
        >
          <SettingsIcon />
        </RailButton>
      </div>
    </nav>
  );
}
