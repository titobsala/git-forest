/**
 * Theme application.
 *
 * The palette lives entirely in CSS custom properties (see
 * `src/styles/tokens.css`), so switching themes is a single attribute write on
 * the document element. Nothing else in the UI needs to know which theme is
 * active.
 *
 * "system" follows `prefers-color-scheme`, which the Tauri webview forwards
 * from the desktop environment.
 */

import { useEffect, useState } from "react";
import type { ThemePreference } from "../types/forest";

export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }
  return preference;
}

/**
 * `matchMedia` is absent in jsdom and in older webviews; treating that as
 * "no dark preference" keeps the light theme as the fallback.
 */
function darkMediaQuery(): MediaQueryList | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  return window.matchMedia(DARK_QUERY);
}

export function systemPrefersDark(): boolean {
  return darkMediaQuery()?.matches ?? false;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/** Applies `preference` to the document and returns the theme in force. */
export function useTheme(preference: ThemePreference): ResolvedTheme {
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = darkMediaQuery();
    if (!query) {
      return;
    }
    setPrefersDark(query.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return theme;
}
