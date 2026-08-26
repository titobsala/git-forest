import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenancePanel } from "./MaintenancePanel";
import {
  FALLBACK_FOREST_STATE,
  sampleWorktree,
  type CleanupPreview,
  type CleanupResult,
} from "../../types/forest";
import { previewCleanup, runCleanup } from "../../lib/cleanup";

vi.mock("../../lib/cleanup", () => ({
  previewCleanup: vi.fn(),
  runCleanup: vi.fn(),
}));

const previewMock = vi.mocked(previewCleanup);
const runMock = vi.mocked(runCleanup);

function samplePreview(
  overrides: Partial<CleanupPreview> = {},
): CleanupPreview {
  return {
    prunableGitWorktrees: [
      {
        repositoryId: "repo-1",
        worktreeId: "wt-old",
        name: "old-branch",
        path: "/tmp/old",
        reason: "prunable",
        sessionRecordCount: 0,
      },
    ],
    staleForestWorktrees: [],
    staleWarpConfigs: [{ fileName: "git-forest-stale.toml", ageSeconds: 120 }],
    finishedSessions: [],
    blockedForestWorktrees: [
      {
        repositoryId: "repo-1",
        worktreeId: sampleWorktree().id,
        name: "present-unknown",
        path: "/tmp/present",
        reason: "present on disk but unknown to git",
        sessionRecordCount: 0,
      },
    ],
    sourceErrors: [],
    ...overrides,
  };
}

function sampleResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return {
    operations: [
      { category: "git_worktrees", removed: 1, error: null },
      { category: "forest_metadata", removed: 0, error: null },
      { category: "warp_configs", removed: 1, error: null },
      { category: "finished_sessions", removed: 0, error: null },
    ],
    preview: samplePreview({
      prunableGitWorktrees: [],
      staleWarpConfigs: [],
    }),
    state: FALLBACK_FOREST_STATE,
    ...overrides,
  };
}

describe("MaintenancePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue(samplePreview());
    runMock.mockResolvedValue(sampleResult());
  });

  it("refreshes the forest without confirmation", async () => {
    const user = userEvent.setup();
    const onRefreshForest = vi.fn();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={onRefreshForest}
        onCleanupComplete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Refresh Forest" }));
    expect(onRefreshForest).toHaveBeenCalledTimes(1);
    expect(previewMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("cannot execute cleanup before preview and confirmation", async () => {
    const user = userEvent.setup();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={vi.fn()}
        onCleanupComplete={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Clean selected…" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview cleanup" }));
    const trigger = await screen.findByRole("button", {
      name: "Clean selected…",
    });
    expect(runMock).not.toHaveBeenCalled();

    await user.click(trigger);
    expect(runMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Confirm cleanup" }),
    ).toBeInTheDocument();
  });

  it("executes selected categories after confirmation and shows results", async () => {
    const user = userEvent.setup();
    const onCleanupComplete = vi.fn();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={vi.fn()}
        onCleanupComplete={onCleanupComplete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview cleanup" }));
    expect(
      await screen.findByText("old-branch — prunable"),
    ).toBeInTheDocument();
    expect(screen.getByText(/present-unknown/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clean selected…" }));
    await user.click(
      screen.getByRole("button", { name: "Clean selected artifacts" }),
    );

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });
    expect(onCleanupComplete).toHaveBeenCalledWith(FALLBACK_FOREST_STATE);
    expect(screen.getByText(/git_worktrees: removed 1/)).toBeInTheDocument();
    expect(screen.getByText(/warp_configs: removed 1/)).toBeInTheDocument();
  });

  it("cancels confirmation on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={vi.fn()}
        onCleanupComplete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview cleanup" }));
    const trigger = await screen.findByRole("button", {
      name: "Clean selected…",
    });
    await user.click(trigger);
    expect(
      screen.getByRole("region", { name: "Confirm cleanup" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Confirm cleanup" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Clean selected…" }),
    ).toHaveFocus();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("disarms confirmation when the selection changes", async () => {
    const user = userEvent.setup();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={vi.fn()}
        onCleanupComplete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview cleanup" }));
    await user.click(
      await screen.findByRole("button", { name: "Clean selected…" }),
    );
    const warp = screen.getByRole("checkbox", {
      name: /Stale Warp configs/,
    });
    await user.click(warp);

    expect(
      screen.queryByRole("region", { name: "Confirm cleanup" }),
    ).not.toBeInTheDocument();
  });

  it("disables empty categories", async () => {
    const user = userEvent.setup();
    render(
      <MaintenancePanel
        busy={false}
        onRefreshForest={vi.fn()}
        onCleanupComplete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview cleanup" }));
    const metadata = await screen.findByRole("checkbox", {
      name: /Stale Forest metadata/,
    });
    expect(metadata).toBeDisabled();
    expect(metadata).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Prunable Git worktrees/ }),
    ).toBeChecked();
  });
});
