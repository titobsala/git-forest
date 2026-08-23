/**
 * Resize edges for the undecorated window.
 *
 * With `decorations: false` the window manager stops drawing the frame, and
 * with it the invisible resize border. These eight zones hand the drag back to
 * the compositor through Tauri's `startResizeDragging`.
 *
 * They are buttons rather than bare divs so the mouse handler sits on an
 * interactive element, and are removed from the accessibility tree and the tab
 * order: a pointer-drag affordance has no keyboard equivalent to offer, and
 * window managers already expose resizing to the keyboard.
 */

import { startWindowResize, type ResizeEdge } from "../../lib/window";

/** Edge thickness. Wide enough to hit, narrow enough not to steal clicks. */
const GRIPS: { edge: ResizeEdge; className: string }[] = [
  { edge: "North", className: "top-0 right-1 left-1 h-1 cursor-n-resize" },
  { edge: "South", className: "right-1 bottom-0 left-1 h-1 cursor-s-resize" },
  { edge: "West", className: "top-1 bottom-1 left-0 w-1 cursor-w-resize" },
  { edge: "East", className: "top-1 right-0 bottom-1 w-1 cursor-e-resize" },
  { edge: "NorthWest", className: "top-0 left-0 size-2 cursor-nw-resize" },
  { edge: "NorthEast", className: "top-0 right-0 size-2 cursor-ne-resize" },
  { edge: "SouthWest", className: "bottom-0 left-0 size-2 cursor-sw-resize" },
  { edge: "SouthEast", className: "right-0 bottom-0 size-2 cursor-se-resize" },
];

export function WindowResizeGrips() {
  return (
    <>
      {GRIPS.map((grip) => (
        <button
          key={grip.edge}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onMouseDown={() => void startWindowResize(grip.edge)}
          className={`fixed z-100 bg-transparent ${grip.className}`}
        />
      ))}
    </>
  );
}
