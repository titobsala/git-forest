/**
 * Four-tier application stage — docs/design.md section 3.
 *
 *   top OS bar
 *   L1 rail │ L2 repositories │ central workspace │ right inspector
 *
 * Purely structural: every tier is supplied as a slot so the shell has no
 * knowledge of forest state. The window is undecorated, so the shell also
 * carries the resize edges the window manager no longer draws.
 */

import type { ReactNode } from "react";
import { WindowResizeGrips } from "./WindowResizeGrips";

interface AppShellProps {
  topBar: ReactNode;
  rail: ReactNode;
  sidebar: ReactNode;
  inspector: ReactNode;
  /** Application-level error banner, rendered above the workspace. */
  error: ReactNode;
  children: ReactNode;
  /** Overlays (quick launch, dialogs) rendered above the whole stage. */
  overlays?: ReactNode;
}

export function AppShell({
  topBar,
  rail,
  sidebar,
  inspector,
  error,
  children,
  overlays,
}: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {rail}
        {sidebar}
        <main className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center border-b border-badge-high-ink/30 bg-badge-high px-3 py-1.5 text-body text-badge-high-ink"
            >
              {error}
            </div>
          ) : null}
          {children}
        </main>
        {inspector}
      </div>
      {overlays}
      <WindowResizeGrips />
    </div>
  );
}
