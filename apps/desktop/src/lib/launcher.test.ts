import { describe, expect, it } from "vitest";
import { nextGlobalLauncherState } from "./launcher";

describe("nextGlobalLauncherState", () => {
  it("shows, focuses, and opens when the window is hidden", () => {
    expect(
      nextGlobalLauncherState({
        launcherOpen: false,
        visible: false,
        minimized: false,
        focused: false,
      }),
    ).toBe("show_and_open");
  });

  it("shows and opens when the window is minimized", () => {
    expect(
      nextGlobalLauncherState({
        launcherOpen: true,
        visible: true,
        minimized: true,
        focused: false,
      }),
    ).toBe("show_and_open");
  });

  it("shows and opens when another app is focused", () => {
    expect(
      nextGlobalLauncherState({
        launcherOpen: false,
        visible: true,
        minimized: false,
        focused: false,
      }),
    ).toBe("show_and_open");
  });

  it("opens the overlay when Forest is focused and the launcher is closed", () => {
    expect(
      nextGlobalLauncherState({
        launcherOpen: false,
        visible: true,
        minimized: false,
        focused: true,
      }),
    ).toBe("open");
  });

  it("hides the window when Super+W is pressed with the launcher open", () => {
    expect(
      nextGlobalLauncherState({
        launcherOpen: true,
        visible: true,
        minimized: false,
        focused: true,
      }),
    ).toBe("hide_and_close");
  });
});
