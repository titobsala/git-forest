/**
 * Tray menu contents — docs/design.md section 3.1, ROADMAP release 0.5.0.
 *
 * AWAITING BACKEND: release 0.5.0 registers a real system tray icon via the
 * Tauri tray-icon plugin and adds background lifecycle (hide instead of quit).
 * This component is the menu body, rendered today as an in-app dropdown from
 * the top bar so the surface exists and can be wired to the native menu
 * without a redesign.
 */

import { shortcutLabel } from "../../lib/keymap";

export interface TrayCounts {
  /** Worktrees currently known to the index. */
  worktrees: number;
  /** Worktrees with uncommitted changes. */
  dirty: number;
  /**
   * Running agent sessions (`starting` and `running`).
   */
  agents: number;
}

interface TrayPanelProps {
  counts: TrayCounts;
  onOpenLauncher: () => void;
  onNewWorktree: () => void;
  onOpenSettings: () => void;
  canCreateWorktree: boolean;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1">
      <span className="text-body text-ink-muted">{label}</span>
      <span className="font-mono text-mono-code text-ink">{value}</span>
    </div>
  );
}

export function TrayPanel({
  counts,
  onOpenLauncher,
  onNewWorktree,
  onOpenSettings,
  canCreateWorktree,
}: TrayPanelProps) {
  return (
    <div
      className="gf-surface absolute top-full right-0 z-40 mt-1 w-64 overflow-hidden shadow-lg"
      role="menu"
      aria-label="Forest status"
    >
      <div className="border-b border-card-border py-1">
        <Row label="Worktrees" value={String(counts.worktrees)} />
        <Row label="Dirty" value={String(counts.dirty)} />
        <Row label="Active agents" value={String(counts.agents)} />
      </div>

      <div className="flex flex-col py-1">
        <button
          type="button"
          role="menuitem"
          onClick={onOpenLauncher}
          className="flex items-center justify-between px-3 py-1.5 text-left text-body text-ink hover:bg-canvas"
        >
          Quick Launch
          <span className="gf-keyhint">{shortcutLabel("launcher.toggle")}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onNewWorktree}
          disabled={!canCreateWorktree}
          title={canCreateWorktree ? undefined : "Select a repository first"}
          className="px-3 py-1.5 text-left text-body text-ink hover:bg-canvas disabled:opacity-50"
        >
          New worktree
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onOpenSettings}
          className="px-3 py-1.5 text-left text-body text-ink hover:bg-canvas"
        >
          Settings
        </button>
      </div>

      <p className="border-t border-card-border px-3 py-1.5 text-micro text-ink-muted">
        System tray and background lifecycle arrive in release 0.5.0.
      </p>
    </div>
  );
}
