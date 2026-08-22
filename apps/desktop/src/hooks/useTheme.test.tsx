import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTheme, useTheme } from "./useTheme";
import type { ThemePreference } from "../types/forest";

function Probe({ preference }: { preference: ThemePreference }) {
  useTheme(preference);
  return null;
}

/** jsdom has no `matchMedia`, so tests that need one install a stub. */
function stubPrefersDark(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches,
    addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return query;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("resolveTheme", () => {
  it("follows the system preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the system preference when a theme is pinned", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("useTheme", () => {
  it("writes the resolved theme onto the document element", () => {
    render(<Probe preference="dark" />);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("resolves the system preference from the media query", () => {
    stubPrefersDark(true);

    render(<Probe preference="system" />);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("falls back to light when the webview has no matchMedia", () => {
    render(<Probe preference="system" />);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("repaints when the preference changes", () => {
    const { rerender } = render(<Probe preference="light" />);
    expect(document.documentElement.dataset.theme).toBe("light");

    rerender(<Probe preference="dark" />);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
