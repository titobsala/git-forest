/**
 * Central shortcut registry.
 *
 * AGENTS.md section 27: shortcut handling must not be scattered across
 * arbitrary components. Components declare intent by handling a `ShortcutId`;
 * only this module knows which physical keys produce it.
 *
 * Key map: docs/design.md section 5.
 */

export type ShortcutId =
  | "launcher.toggle"
  | "launcher.global"
  | "launcher.actions"
  | "view.cockpit"
  | "overlay.close"
  | "selection.previous"
  | "selection.next"
  | "selection.open"
  | "selection.agent"
  | "panel.repositories"
  | "panel.inspector";

export type ShortcutScope = "global" | "overlay" | "cockpitList";

export interface ShortcutBinding {
  id: ShortcutId;
  scope: ShortcutScope;
  /** Human-readable form shown in help surfaces and keyhint chips. */
  label: string;
  description: string;
  key: string;
  /** Platform-independent "meta on macOS, ctrl elsewhere". */
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Shown in labels only; never resolved from a key event. */
  displayOnly?: boolean;
}

export const SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: "launcher.toggle",
    scope: "global",
    label: "Super W / Cmd K",
    description: "Toggle Quick Launch overlay",
    key: "k",
    mod: true,
  },
  {
    id: "launcher.global",
    scope: "global",
    label: "Super W",
    description: "OS-global Quick Launch toggle",
    key: "w",
    displayOnly: true,
  },
  {
    id: "view.cockpit",
    scope: "global",
    label: "Cmd O",
    description: "Switch to Cockpit view",
    key: "o",
    mod: true,
  },
  {
    id: "launcher.actions",
    scope: "overlay",
    label: "Tab",
    description: "Show actions for the highlighted result",
    key: "Tab",
  },
  {
    id: "overlay.close",
    scope: "overlay",
    label: "Esc",
    description: "Close active overlay",
    key: "Escape",
  },
  {
    id: "selection.previous",
    scope: "cockpitList",
    label: "↑",
    description: "Select previous worktree",
    key: "ArrowUp",
  },
  {
    id: "selection.next",
    scope: "cockpitList",
    label: "↓",
    description: "Select next worktree",
    key: "ArrowDown",
  },
  {
    id: "selection.open",
    scope: "cockpitList",
    label: "↵",
    description: "Open worktree in the default terminal",
    key: "Enter",
  },
  {
    id: "selection.agent",
    scope: "cockpitList",
    label: "⌥ A",
    description: "Launch the configured coding agent",
    key: "a",
    alt: true,
  },
  {
    id: "panel.repositories",
    scope: "cockpitList",
    label: "Tab",
    description: "Toggle the repositories sidebar",
    key: "Tab",
  },
  {
    id: "panel.inspector",
    scope: "cockpitList",
    label: "Shift Tab",
    description: "Toggle the inspector panel",
    key: "Tab",
    shift: true,
  },
] as const;

export function shortcutLabel(id: ShortcutId): string {
  return SHORTCUTS.find((binding) => binding.id === id)?.label ?? "";
}

interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function matches(binding: ShortcutBinding, event: KeyEventLike): boolean {
  if (binding.displayOnly) {
    return false;
  }
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }

  const wantsMod = binding.mod === true;
  const hasMod = event.metaKey || event.ctrlKey;
  if (wantsMod !== hasMod) {
    return false;
  }

  if ((binding.alt === true) !== event.altKey) {
    return false;
  }

  return (binding.shift === true) === event.shiftKey;
}

/**
 * Resolve a key event to a shortcut within the given scopes.
 *
 * Scopes are checked in the order supplied so the innermost surface wins:
 * an overlay consumes Escape before the cockpit list sees it.
 */
export function resolveShortcut(
  event: KeyEventLike,
  scopes: readonly ShortcutScope[],
): ShortcutId | null {
  for (const scope of scopes) {
    const binding = SHORTCUTS.find(
      (candidate) => candidate.scope === scope && matches(candidate, event),
    );
    if (binding) {
      return binding.id;
    }
  }

  return null;
}

/**
 * True when the event originated in a control that owns its own key handling
 * (text entry, select, contenteditable). Global shortcuts using bare letters
 * must not fire while the user is typing.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * True when a nested control should keep the key instead of a list shortcut.
 *
 * Cockpit row actions are buttons inside the listbox. Enter on a focused
 * Launch button must activate that button, not `selection.open`.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (isTextEntryTarget(target)) {
    return true;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("button, a, [href], [role='button']"));
}
