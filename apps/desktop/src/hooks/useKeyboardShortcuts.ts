/**
 * Window-level shortcut dispatch.
 *
 * Components pass the scopes they participate in plus handlers keyed by
 * `ShortcutId`; the physical key mapping lives entirely in lib/keymap.
 */

import { useEffect, useRef } from "react";
import {
  isTextEntryTarget,
  resolveShortcut,
  SHORTCUTS,
  type ShortcutId,
  type ShortcutScope,
} from "../lib/keymap";

export type ShortcutHandlers = Partial<
  Record<ShortcutId, (event: KeyboardEvent) => void>
>;

export function useKeyboardShortcuts(
  scopes: readonly ShortcutScope[],
  handlers: ShortcutHandlers,
): void {
  // Keep the latest handlers without re-binding the listener every render.
  const latest = useRef(handlers);
  latest.current = handlers;

  const scopeKey = scopes.join("|");

  useEffect(() => {
    const activeScopes = scopeKey.split("|").filter(Boolean) as ShortcutScope[];

    function onKeyDown(event: KeyboardEvent) {
      const id = resolveShortcut(event, activeScopes);
      if (!id) {
        return;
      }

      // While the user is typing, only modified chords and Escape may fire;
      // plain letters and arrows belong to the field.
      const binding = SHORTCUTS.find((candidate) => candidate.id === id);
      if (
        isTextEntryTarget(event.target) &&
        binding?.mod !== true &&
        binding?.key !== "Escape"
      ) {
        return;
      }

      const handler = latest.current[id];
      if (!handler) {
        return;
      }

      event.preventDefault();
      handler(event);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scopeKey]);
}
