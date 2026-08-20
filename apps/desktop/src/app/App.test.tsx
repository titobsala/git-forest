import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getForestState } from "../lib/forest";
import { FALLBACK_FOREST_STATE } from "../types/forest";

const nativeState = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 1,
  appInfo: {
    name: "Git Forest",
    version: "0.0.2",
    tagline: "Configuration rooted.",
  },
  repositories: [
    {
      id: "repo-1",
      name: "EXOG App",
      path: "/tmp/exog-app",
      mode: "linked" as const,
      createdAt: "2026-08-20T09:00:00Z",
      updatedAt: "2026-08-20T09:00:00Z",
    },
  ],
};

vi.mock("../lib/forest", () => ({
  getForestState: vi.fn(),
  updateForestConfiguration: vi.fn(),
}));

vi.mock("../lib/repositories", () => ({
  registerRepository: vi.fn(),
}));

describe("App", () => {
  it("shows a loading state until forest state arrives", () => {
    vi.mocked(getForestState).mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByText("Loading Forest…")).toBeInTheDocument();
  });

  it("shows forest state from the native command", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("EXOG App")).toBeInTheDocument();
    });

    expect(screen.getByText("Version 0.0.2")).toBeInTheDocument();
    expect(screen.getByText("Schema version")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("shows an error and the fallback snapshot when loading fails", async () => {
    vi.mocked(getForestState).mockRejectedValue({
      code: "database",
      message: "database error: locked",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "database error: locked",
      );
    });

    expect(screen.getByText("Version 0.0.2")).toBeInTheDocument();
    expect(
      screen.getByText(FALLBACK_FOREST_STATE.paths.appDataDir),
    ).toBeInTheDocument();
  });
});
