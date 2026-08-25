/**
 * OS-global Super+W listener. The shortcut is registered in Rust; this hook
 * only reacts to the emitted event and applies window show/hide/focus.
 */

import { useEffect, useRef } from "react";
import {
  listenToGlobalLauncherToggle,
  nextGlobalLauncherState,
} from "../lib/launcher";
import {
  focusWindow,
  hideWindow,
  isWindowFocused,
  isWindowMinimized,
  isWindowVisible,
  showWindow,
  unminimizeWindow,
} from "../lib/window";

interface GlobalLauncherShortcutOptions {
  launcherOpen: boolean;
  setLauncherOpen: (open: boolean) => void;
}

export function useGlobalLauncherShortcut({
  launcherOpen,
  setLauncherOpen,
}: GlobalLauncherShortcutOptions): void {
  const launcherOpenRef = useRef(launcherOpen);
  launcherOpenRef.current = launcherOpen;
  const setLauncherOpenRef = useRef(setLauncherOpen);
  setLauncherOpenRef.current = setLauncherOpen;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listenToGlobalLauncherToggle(() => {
      void applyGlobalLauncherToggle(
        launcherOpenRef.current,
        setLauncherOpenRef.current,
      );
    }).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

async function applyGlobalLauncherToggle(
  launcherOpen: boolean,
  setLauncherOpen: (open: boolean) => void,
): Promise<void> {
  const [visible, minimized, focused] = await Promise.all([
    isWindowVisible(),
    isWindowMinimized(),
    isWindowFocused(),
  ]);
  const next = nextGlobalLauncherState({
    launcherOpen,
    visible,
    minimized,
    focused,
  });

  if (next === "show_and_open") {
    await showWindow();
    await unminimizeWindow();
    await focusWindow();
    setLauncherOpen(true);
    return;
  }

  if (next === "hide_and_close") {
    setLauncherOpen(false);
    await hideWindow();
    return;
  }

  setLauncherOpen(true);
  await focusWindow();
}
