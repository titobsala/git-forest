import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalLauncherShortcut } from "./useGlobalLauncherShortcut";
import { listenToGlobalLauncherToggle } from "../lib/launcher";
import {
  focusWindow,
  hideWindow,
  isWindowFocused,
  isWindowMinimized,
  isWindowVisible,
  showWindow,
  unminimizeWindow,
} from "../lib/window";

vi.mock("../lib/launcher", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/launcher")>("../lib/launcher");
  return {
    ...actual,
    listenToGlobalLauncherToggle: vi.fn(),
  };
});

vi.mock("../lib/window", () => ({
  showWindow: vi.fn(),
  hideWindow: vi.fn(),
  focusWindow: vi.fn(),
  unminimizeWindow: vi.fn(),
  isWindowVisible: vi.fn(),
  isWindowMinimized: vi.fn(),
  isWindowFocused: vi.fn(),
}));

describe("useGlobalLauncherShortcut", () => {
  let handler: (() => void) | undefined;
  const stop = vi.fn();

  beforeEach(() => {
    handler = undefined;
    stop.mockReset();
    vi.mocked(listenToGlobalLauncherToggle).mockImplementation(async (next) => {
      handler = next;
      return stop;
    });
    vi.mocked(isWindowVisible).mockResolvedValue(true);
    vi.mocked(isWindowMinimized).mockResolvedValue(false);
    vi.mocked(isWindowFocused).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("unregisters the native listener on unmount", async () => {
    const { unmount } = renderHook(() =>
      useGlobalLauncherShortcut({
        launcherOpen: false,
        setLauncherOpen: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(listenToGlobalLauncherToggle).toHaveBeenCalledOnce();
    });

    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("opens the launcher when Forest is focused and the overlay is closed", async () => {
    const setLauncherOpen = vi.fn();
    renderHook(() =>
      useGlobalLauncherShortcut({
        launcherOpen: false,
        setLauncherOpen,
      }),
    );
    await waitFor(() => {
      expect(handler).toBeTypeOf("function");
    });

    await act(async () => {
      handler?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(setLauncherOpen).toHaveBeenCalledWith(true);
    });
    expect(hideWindow).not.toHaveBeenCalled();
    expect(focusWindow).toHaveBeenCalled();
  });

  it("hides the window when Super+W fires with the launcher open", async () => {
    const setLauncherOpen = vi.fn();
    renderHook(() =>
      useGlobalLauncherShortcut({
        launcherOpen: true,
        setLauncherOpen,
      }),
    );
    await waitFor(() => {
      expect(handler).toBeTypeOf("function");
    });

    await act(async () => {
      handler?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(setLauncherOpen).toHaveBeenCalledWith(false);
    });
    expect(hideWindow).toHaveBeenCalled();
  });

  it("shows a hidden window and opens the launcher", async () => {
    vi.mocked(isWindowVisible).mockResolvedValue(false);
    const setLauncherOpen = vi.fn();
    renderHook(() =>
      useGlobalLauncherShortcut({
        launcherOpen: false,
        setLauncherOpen,
      }),
    );
    await waitFor(() => {
      expect(handler).toBeTypeOf("function");
    });

    await act(async () => {
      handler?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(showWindow).toHaveBeenCalled();
      expect(unminimizeWindow).toHaveBeenCalled();
      expect(focusWindow).toHaveBeenCalled();
      expect(setLauncherOpen).toHaveBeenCalledWith(true);
    });
  });
});
