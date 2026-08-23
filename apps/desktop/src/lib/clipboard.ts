/**
 * Clipboard access.
 *
 * `navigator.clipboard` exists only in secure contexts. The Tauri webview is
 * one, but the API is absent under jsdom and is not guaranteed across every
 * WebKitGTK build, so callers feature-check and hide the affordance instead of
 * offering an action that silently does nothing.
 */

export function clipboardAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  );
}

/** Resolves to whether the text actually reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  if (!clipboardAvailable()) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
