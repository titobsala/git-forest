/**
 * Top bar — docs/design.md section 3.1.
 *
 * This is the window's title bar: the OS decorations are disabled, so the bar
 * carries the drag region and the window buttons alongside app identity, the
 * current view and the tray trigger. `data-tauri-drag-region` is Tauri's own
 * hook — it makes a mousedown start a window drag and a double-click toggle
 * maximize — and has to sit on every element that should be draggable, since
 * the event target is what gets checked.
 */

import type { ReactNode } from "react";
import type { AppInfo } from "../../types/forest";
import type { ViewId } from "../../app/views";
import { VIEW_LABELS } from "../../app/views";
import { WindowControls } from "./WindowControls";

interface TopBarProps {
  appInfo: AppInfo;
  view: ViewId;
  /** Tray trigger, rendered by the tray feature. */
  tray: ReactNode;
}

export function TopBar({ appInfo, view, tray }: TopBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-topbar shrink-0 items-center gap-2 border-b border-card-border bg-card pr-1 pl-3"
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-brand"
      />
      <h1 data-tauri-drag-region className="text-display text-ink">
        {appInfo.name}
      </h1>
      <span className="gf-badge gf-badge-good shrink-0">
        {VIEW_LABELS[view]}
      </span>
      <p
        data-tauri-drag-region
        className="truncate text-body text-ink-muted"
        title={appInfo.tagline}
      >
        {appInfo.tagline}
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {tray}
        <span aria-hidden="true" className="h-4 w-px bg-card-border" />
        <WindowControls />
      </div>
    </header>
  );
}
