import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("reads a command error payload", () => {
    expect(
      errorMessage({ code: "duplicate_path", message: "already registered" }),
    ).toBe("already registered");
  });

  it("falls back for unknown values", () => {
    expect(errorMessage(undefined)).toBe("Something went wrong.");
  });

  it("reads a typed Tauri unavailable error", () => {
    expect(
      errorMessage({
        code: "tauri_unavailable",
        message:
          "Git Forest native commands are unavailable because the Tauri IPC bridge was not injected.",
      }),
    ).toBe(
      "Git Forest native commands are unavailable because the Tauri IPC bridge was not injected.",
    );
  });
});
