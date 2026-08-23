/**
 * Top-bar tray trigger — docs/design.md section 3.1.
 *
 * Shows the live worktree and background-process counts and opens the tray
 * menu. Real system-tray registration lands in release 0.5.0; see TrayPanel.
 */

import { useEffect, useRef, useState } from "react";
import { TrayIcon } from "../../components/shell/icons";
import { TrayPanel, type TrayCounts } from "./TrayPanel";

interface TrayIndicatorProps {
  counts: TrayCounts;
  onOpenLauncher: () => void;
  onNewWorktree: () => void;
  onOpenSettings: () => void;
  canCreateWorktree: boolean;
}

export function TrayIndicator({
  counts,
  onOpenLauncher,
  onNewWorktree,
  onOpenSettings,
  canCreateWorktree,
}: TrayIndicatorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape, like a native menu.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Forest status"
        className="flex items-center gap-1.5 rounded-sm border border-card-border px-2 py-0.5 text-ink-muted transition-colors hover:border-brand hover:text-ink"
      >
        <TrayIcon />
        <span className="font-mono text-micro">
          {counts.worktrees} wt · {counts.agents === null ? "—" : counts.agents}{" "}
          proc
        </span>
      </button>

      {open ? (
        <TrayPanel
          counts={counts}
          canCreateWorktree={canCreateWorktree}
          onOpenLauncher={() => {
            setOpen(false);
            onOpenLauncher();
          }}
          onNewWorktree={() => {
            setOpen(false);
            onNewWorktree();
          }}
          onOpenSettings={() => {
            setOpen(false);
            onOpenSettings();
          }}
        />
      ) : null}
    </div>
  );
}
