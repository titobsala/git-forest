/**
 * Window buttons for the custom title bar.
 *
 * The OS decorations are off, so minimize / maximize / close live at the right
 * edge of the application top bar. `isMaximized` is tracked so the middle
 * button shows the correct affordance; the window can also be maximized by
 * double-clicking the drag region, which Tauri handles natively, hence the
 * resize listener rather than a one-shot read.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from "../../lib/window";
import { isTauriRuntime } from "../../lib/tauri";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "./icons";

interface ControlButtonProps {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ControlButton({
  label,
  danger = false,
  onClick,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "grid size-6 place-items-center rounded-sm text-ink-muted transition-colors",
        danger
          ? "hover:bg-badge-high hover:text-badge-high-ink"
          : "hover:bg-canvas hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      setMaximized(await appWindow.isMaximized());
      const stop = await appWindow.onResized(() => {
        void appWindow.isMaximized().then(setMaximized);
      });
      if (cancelled) {
        stop();
      } else {
        unlisten = stop;
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex items-center gap-0.5">
      <ControlButton
        label="Minimize window"
        onClick={() => void minimizeWindow()}
      >
        <MinimizeIcon />
      </ControlButton>
      <ControlButton
        label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void toggleMaximizeWindow()}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </ControlButton>
      <ControlButton
        label="Close window"
        danger
        onClick={() => void closeWindow()}
      >
        <CloseIcon />
      </ControlButton>
    </div>
  );
}
