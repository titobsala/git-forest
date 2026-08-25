import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTauriRuntime } from "./tauri";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  focusWindow,
  hideWindow,
  isWindowFocused,
  isWindowMinimized,
  isWindowVisible,
  showWindow,
  unminimizeWindow,
} from "./window";

vi.mock("./tauri", () => ({
  isTauriRuntime: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

describe("window lifecycle helpers", () => {
  beforeEach(() => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    vi.mocked(getCurrentWindow).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops outside the Tauri runtime", async () => {
    await showWindow();
    await hideWindow();
    await focusWindow();
    await unminimizeWindow();
    expect(getCurrentWindow).not.toHaveBeenCalled();
    await expect(isWindowVisible()).resolves.toBe(true);
    await expect(isWindowMinimized()).resolves.toBe(false);
    await expect(isWindowFocused()).resolves.toBe(true);
  });

  it("forwards show, hide, and focus to the current window", async () => {
    const current = {
      show: vi.fn(),
      hide: vi.fn(),
      setFocus: vi.fn(),
      isMinimized: vi.fn().mockResolvedValue(false),
      unminimize: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      isFocused: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(getCurrentWindow).mockReturnValue(current as never);

    await showWindow();
    await hideWindow();
    await focusWindow();
    await expect(isWindowVisible()).resolves.toBe(true);
    await expect(isWindowFocused()).resolves.toBe(true);

    expect(current.show).toHaveBeenCalledOnce();
    expect(current.hide).toHaveBeenCalledOnce();
    expect(current.setFocus).toHaveBeenCalledOnce();
  });

  it("unminimizes only when the window is minimized", async () => {
    const current = {
      isMinimized: vi.fn().mockResolvedValue(true),
      unminimize: vi.fn(),
    };
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(getCurrentWindow).mockReturnValue(current as never);

    await unminimizeWindow();
    expect(current.unminimize).toHaveBeenCalledOnce();
  });
});
