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
