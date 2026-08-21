import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getForestState } from "../lib/forest";
import { FALLBACK_FOREST_STATE, sampleRepository } from "../types/forest";

const nativeState = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 2,
  appInfo: {
    name: "Git Forest",
    version: "0.0.4",
    tagline: "Worktrees in reach.",
  },
  repositories: [sampleRepository()],
};

vi.mock("../lib/forest", () => ({
  getForestState: vi.fn(),
  updateForestConfiguration: vi.fn(),
}));

vi.mock("../lib/repositories", () => ({
  importRepository: vi.fn(),
  importRepositories: vi.fn(),
  refreshRepository: vi.fn(),
  removeRepository: vi.fn(),
}));

vi.mock("../lib/scan", () => ({
  startRepositoryScan: vi.fn(),
  cancelRepositoryScan: vi.fn(),
  listenToScanProgress: vi.fn().mockResolvedValue(() => undefined),
  listenToScanComplete: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("../lib/worktrees", () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  refreshWorktrees: vi.fn().mockResolvedValue([]),
  listLocalBranches: vi.fn().mockResolvedValue([]),
  previewCreateWorktree: vi.fn(),
  createWorktree: vi.fn(),
  getWorktreeRemovalPreview: vi.fn(),
  removeWorktree: vi.fn(),
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

    expect(screen.getByText("Version 0.0.4")).toBeInTheDocument();
    expect(screen.getByText("Schema version")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
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

    expect(screen.getByText("Version 0.0.4")).toBeInTheDocument();
    expect(
      screen.getByText(FALLBACK_FOREST_STATE.paths.appDataDir),
    ).toBeInTheDocument();
  });
});
