/**
 * Native window controls.
 *
 * The OS title bar is disabled (`decorations: false` in tauri.conf.json), so
 * the application top bar *is* the title bar: it owns dragging, the window
 * buttons, and — via `WindowResizeGrips` — the resize edges the window manager
 * no longer draws.
 *
 * Every call resolves to a no-op outside the Tauri runtime so the UI still
 * renders and can be exercised in a plain browser and in tests.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "./tauri";

/** The eight directions `startWindowResize` accepts. */
export type ResizeEdge =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

function currentWindow() {
  return isTauriRuntime() ? getCurrentWindow() : null;
}

export async function minimizeWindow(): Promise<void> {
  await currentWindow()?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await currentWindow()?.toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  await currentWindow()?.close();
}

export async function startWindowDrag(): Promise<void> {
  await currentWindow()?.startDragging();
}

export async function startWindowResize(edge: ResizeEdge): Promise<void> {
  await currentWindow()?.startResizeDragging(edge);
}

export async function showWindow(): Promise<void> {
  await currentWindow()?.show();
}

export async function hideWindow(): Promise<void> {
  await currentWindow()?.hide();
}

export async function focusWindow(): Promise<void> {
  await currentWindow()?.setFocus();
}

export async function unminimizeWindow(): Promise<void> {
  const window = currentWindow();
  if (!window) {
    return;
  }
  if (await window.isMinimized()) {
    await window.unminimize();
  }
}

/** Missing native window: treat the UI as visible for browser/test hosts. */
export async function isWindowVisible(): Promise<boolean> {
  const window = currentWindow();
  if (!window) {
    return true;
  }
  return window.isVisible();
}

export async function isWindowMinimized(): Promise<boolean> {
  const window = currentWindow();
  if (!window) {
    return false;
  }
  return window.isMinimized();
}

export async function isWindowFocused(): Promise<boolean> {
  const window = currentWindow();
  if (!window) {
    return true;
  }
  return window.isFocused();
}
