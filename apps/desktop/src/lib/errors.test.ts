import { describe, expect, it } from "vitest";
import { errorMessage, toCommandError } from "./errors";

describe("toCommandError", () => {
  it("preserves a command error payload", () => {
    expect(
      toCommandError({
        code: "duplicate_path",
        message: "already registered",
      }),
    ).toEqual({
      code: "duplicate_path",
      message: "already registered",
    });
  });

  it("falls back for unknown values", () => {
    expect(toCommandError(undefined)).toEqual({
      code: "unknown_error",
      message: "Something went wrong.",
    });
  });

  it("keeps a string message under unknown_error", () => {
    expect(toCommandError("disk is full")).toEqual({
      code: "unknown_error",
      message: "disk is full",
    });
  });
});

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
