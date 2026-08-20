import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeCommand } from "./tauri";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: { invoke: ReturnType<typeof vi.fn> };
  __TAURI__?: { core?: { invoke: ReturnType<typeof vi.fn> } };
};

function tauriWindow(): TauriWindow {
  return window as TauriWindow;
}

describe("invokeCommand", () => {
  beforeEach(() => {
    const runtime = tauriWindow();
    runtime.__TAURI_INTERNALS__ = undefined;
    runtime.__TAURI__ = undefined;
  });

  it("throws a typed error when the IPC bridge is missing", async () => {
    await expect(invokeCommand("get_forest_state")).rejects.toEqual({
      code: "tauri_unavailable",
      message:
        "Git Forest native commands are unavailable because the Tauri IPC bridge was not injected.",
    });
  });

  it("forwards to the Tauri internals invoke function", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    tauriWindow().__TAURI_INTERNALS__ = { invoke };

    await expect(invokeCommand("get_forest_state")).resolves.toEqual({
      ok: true,
    });
    expect(invoke).toHaveBeenCalledWith("get_forest_state");
  });
});
