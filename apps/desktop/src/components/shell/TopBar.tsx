/**
 * Top OS bar — docs/design.md section 3.1.
 *
 * App identity, version badge, current view badge, and the tray trigger on the
 * right carrying live worktree / background process counts.
 */

import type { ReactNode } from "react";
import type { AppInfo } from "../../types/forest";
import type { ViewId } from "../../app/views";
import { VIEW_LABELS } from "../../app/views";

interface TopBarProps {
  appInfo: AppInfo;
  view: ViewId;
  /** Tray trigger, rendered by the tray feature. */
  tray: ReactNode;
}

export function TopBar({ appInfo, view, tray }: TopBarProps) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-card-border bg-card px-3">
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-brand"
        title="Git Forest"
      />
      <h1 className="text-display text-ink">{appInfo.name}</h1>
      <span className="gf-badge gf-badge-neutral" title="Application version">
        v{appInfo.version}
      </span>
      <span className="gf-badge gf-badge-good">{VIEW_LABELS[view]}</span>
      <p className="truncate text-body text-ink-muted">{appInfo.tagline}</p>
      <div className="ml-auto flex items-center gap-2">{tray}</div>
    </header>
  );
}
