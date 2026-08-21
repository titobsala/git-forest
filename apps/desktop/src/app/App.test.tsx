import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getForestState } from "../lib/forest";
import { listWorktrees, refreshWorktrees } from "../lib/worktrees";
import {
  FALLBACK_FOREST_STATE,
  sampleRepository,
  sampleWorktree,
} from "../types/forest";

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
  listenToScanProgress: vi.fn(),
  listenToScanComplete: vi.fn(),
}));

vi.mock("../lib/worktrees", () => ({
  listWorktrees: vi.fn(),
  refreshWorktrees: vi.fn(),
  listLocalBranches: vi.fn(),
  previewCreateWorktree: vi.fn(),
  createWorktree: vi.fn(),
  getWorktreeRemovalPreview: vi.fn(),
  removeWorktree: vi.fn(),
}));

// `restoreMocks: true` resets implementations between tests, so every mock the
// shell depends on has to be re-established here rather than at module scope.
beforeEach(async () => {
  const scan = await import("../lib/scan");
  vi.mocked(scan.listenToScanProgress).mockResolvedValue(() => undefined);
  vi.mocked(scan.listenToScanComplete).mockResolvedValue(() => undefined);
  vi.mocked(listWorktrees).mockResolvedValue([]);
  vi.mocked(refreshWorktrees).mockResolvedValue([]);
});

describe("App", () => {
  it("shows a loading state until forest state arrives", () => {
    vi.mocked(getForestState).mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByText("Loading Forest…")).toBeInTheDocument();
  });

  it("renders the cockpit shell with its four stages", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: "Repositories" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Worktree inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listbox", { name: "Worktrees" }),
    ).toBeInTheDocument();

    // Top bar identity and version badge.
    expect(screen.getByText("Git Forest")).toBeInTheDocument();
    expect(screen.getByText("v0.0.4")).toBeInTheDocument();
  });

  it("groups worktrees under their repository with telemetry badges", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({
        id: "wt-1",
        branch: "feat/risk-483",
        trackedChanges: 2,
      }),
      sampleWorktree({
        id: "wt-2",
        name: "fix-report-export",
        branch: "fix/report-export",
        ahead: 2,
        behind: 1,
      }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    expect(screen.getByText("dirty")).toBeInTheDocument();
    expect(screen.getByText("clean")).toBeInTheDocument();
    expect(screen.getByText("2↑ 1↓")).toBeInTheDocument();
    // The repository name also appears in the L2 sidebar, so scope the
    // accordion assertion to the cockpit list.
    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    expect(cockpit.getByRole("button", { name: /EXOG App/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("opens Quick Launch on the toggle shortcut and closes on Escape", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({ branch: "feat/risk-483" }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");

    const dialog = await screen.findByRole("dialog", { name: "Quick Launch" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("EXOG App / feat/risk-483")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Quick Launch" }),
      ).not.toBeInTheDocument();
    });
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

    expect(screen.getByText("v0.0.4")).toBeInTheDocument();
  });
});
