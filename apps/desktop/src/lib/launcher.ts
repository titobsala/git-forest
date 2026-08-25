import { listen } from "@tauri-apps/api/event";

export const LAUNCHER_GLOBAL_TOGGLE_EVENT = "launcher-global-toggle";

export type GlobalLauncherToggle = "show_and_open" | "open" | "hide_and_close";

export function nextGlobalLauncherState(input: {
  launcherOpen: boolean;
  visible: boolean;
  minimized: boolean;
  focused: boolean;
}): GlobalLauncherToggle {
  if (!input.visible || input.minimized || !input.focused) {
    return "show_and_open";
  }
  if (input.launcherOpen) {
    return "hide_and_close";
  }
  return "open";
}

export async function listenToGlobalLauncherToggle(
  handler: () => void,
): Promise<() => void> {
  try {
    const unlisten = await listen(LAUNCHER_GLOBAL_TOGGLE_EVENT, () => {
      handler();
    });
    return unlisten;
  } catch {
    return () => undefined;
  }
}
