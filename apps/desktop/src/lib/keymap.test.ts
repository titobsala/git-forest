import { describe, expect, it } from "vitest";
import {
  isInteractiveTarget,
  isTextEntryTarget,
  resolveShortcut,
  shortcutLabel,
} from "./keymap";

function event(overrides: Partial<KeyboardEvent> & { key: string }) {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("resolveShortcut", () => {
  it("accepts either modifier for mod-based chords", () => {
    expect(
      resolveShortcut(event({ key: "k", ctrlKey: true }), ["global"]),
    ).toBe("launcher.toggle");
    expect(
      resolveShortcut(event({ key: "k", metaKey: true }), ["global"]),
    ).toBe("launcher.toggle");
  });

  it("rejects the bare key when a modifier is required", () => {
    expect(resolveShortcut(event({ key: "k" }), ["global"])).toBeNull();
  });

  it("only resolves within the given scopes", () => {
    expect(resolveShortcut(event({ key: "Escape" }), ["global"])).toBeNull();
    expect(resolveShortcut(event({ key: "Escape" }), ["overlay"])).toBe(
      "overlay.close",
    );
  });

  it("separates Tab from Shift+Tab", () => {
    expect(resolveShortcut(event({ key: "Tab" }), ["cockpitList"])).toBe(
      "panel.repositories",
    );
    expect(
      resolveShortcut(event({ key: "Tab", shiftKey: true }), ["cockpitList"]),
    ).toBe("panel.inspector");
  });

  it("requires alt for the agent shortcut", () => {
    expect(
      resolveShortcut(event({ key: "a", altKey: true }), ["cockpitList"]),
    ).toBe("selection.agent");
    expect(resolveShortcut(event({ key: "a" }), ["cockpitList"])).toBeNull();
  });

  it("honours scope precedence, innermost first", () => {
    expect(
      resolveShortcut(event({ key: "Escape" }), ["overlay", "global"]),
    ).toBe("overlay.close");
  });
});

describe("shortcutLabel", () => {
  it("returns the display form", () => {
    expect(shortcutLabel("launcher.toggle")).toBe("Super W / Cmd K");
    expect(shortcutLabel("launcher.global")).toBe("Super W");
  });

  it("does not resolve the OS-global Super+W chord from in-app key events", () => {
    expect(resolveShortcut(event({ key: "w" }), ["global"])).toBeNull();
  });
});

describe("isInteractiveTarget", () => {
  it("treats nested buttons as owning their keys", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.append(label);

    expect(isInteractiveTarget(button)).toBe(true);
    expect(isInteractiveTarget(label)).toBe(true);
    expect(isInteractiveTarget(document.createElement("div"))).toBe(false);
  });
});

describe("isTextEntryTarget", () => {
  it("detects fields that own their keys", () => {
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("select"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
