import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorktreePanel } from "./WorktreePanel";
import {
  createWorktree,
  getWorktreeRemovalPreview,
  listLocalBranches,
  listWorktrees,
  previewCreateWorktree,
  removeWorktree,
} from "../lib/worktrees";
import { sampleRepository, sampleWorktree } from "../types/forest";

vi.mock("../lib/worktrees", () => ({
  listWorktrees: vi.fn(),
  refreshWorktrees: vi.fn(),
  listLocalBranches: vi.fn(),
  previewCreateWorktree: vi.fn(),
  createWorktree: vi.fn(),
  getWorktreeRemovalPreview: vi.fn(),
  removeWorktree: vi.fn(),
}));

const repository = sampleRepository();
const primary = sampleWorktree({
  id: "wt-main",
  name: "exog-app",
  path: "/tmp/exog-app",
  branch: "main",
  isPrimary: true,
});
const feature = sampleWorktree();

describe("WorktreePanel", () => {
  it("loads worktrees lazily and renders status badges", async () => {
    vi.mocked(listWorktrees).mockResolvedValue([primary, feature]);
    vi.mocked(listLocalBranches).mockResolvedValue([{ name: "main" }]);
    vi.mocked(previewCreateWorktree).mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app/feat-demo",
      repositorySlug: "exog-app",
      worktreeSlug: "feat-demo",
    });

    render(<WorktreePanel repository={repository} busy={false} />);

    expect(screen.getByText("Loading worktrees…")).toBeInTheDocument();
    expect(await screen.findByText("feat-risk-483")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(screen.getAllByText("clean").length).toBeGreaterThan(0);
    expect(listWorktrees).toHaveBeenCalledWith("repo-1");
  });

  it("creates a worktree and shows the destination preview", async () => {
    vi.mocked(listWorktrees).mockResolvedValue([primary]);
    vi.mocked(listLocalBranches).mockResolvedValue([{ name: "main" }]);
    vi.mocked(previewCreateWorktree).mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app/feat-demo",
      repositorySlug: "exog-app",
      worktreeSlug: "feat-demo",
    });
    const created = sampleWorktree({
      id: "wt-2",
      name: "feat-demo",
      branch: "feat/demo",
    });
    vi.mocked(createWorktree).mockResolvedValue({
      worktree: created,
      worktrees: [primary, created],
    });

    render(<WorktreePanel repository={repository} busy={false} />);
    await screen.findByText("exog-app");

    fireEvent.change(screen.getByLabelText("New branch"), {
      target: { value: "feat/demo" },
    });
    expect(
      await screen.findByText(
        "Destination: /tmp/forest/worktrees/exog-app/feat-demo",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create worktree" }));

    await waitFor(() => {
      expect(createWorktree).toHaveBeenCalledWith({
        repositoryId: "repo-1",
        baseRef: "main",
        branch: "feat/demo",
        name: undefined,
      });
    });
    expect(await screen.findByText("feat-demo")).toBeInTheDocument();
  });

  it("confirms clean removal", async () => {
    vi.mocked(listWorktrees).mockResolvedValue([primary, feature]);
    vi.mocked(listLocalBranches).mockResolvedValue([{ name: "main" }]);
    vi.mocked(getWorktreeRemovalPreview).mockResolvedValue({
      worktree: feature,
      allowed: true,
      requiresForce: false,
      blockers: [],
    });
    vi.mocked(removeWorktree).mockResolvedValue({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [primary],
    });

    render(<WorktreePanel repository={repository} busy={false} />);
    await screen.findByText("feat-risk-483");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove worktree" })[1]!,
    );
    expect(
      await screen.findByText(/This worktree is clean/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove worktree" })[2]!,
    );
    await waitFor(() => {
      expect(removeWorktree).toHaveBeenCalledWith("wt-1", false);
    });
  });

  it("shows force confirmation for dirty worktrees and blocked primary state", async () => {
    const dirty = sampleWorktree({
      trackedChanges: 3,
      untrackedFiles: 1,
    });
    vi.mocked(listWorktrees).mockResolvedValue([primary, dirty]);
    vi.mocked(listLocalBranches).mockResolvedValue([{ name: "main" }]);
    vi.mocked(getWorktreeRemovalPreview)
      .mockResolvedValueOnce({
        worktree: dirty,
        allowed: false,
        requiresForce: true,
        blockers: ["dirty", "untracked"],
      })
      .mockResolvedValueOnce({
        worktree: primary,
        allowed: false,
        requiresForce: false,
        blockers: ["primary"],
      });
    vi.mocked(removeWorktree).mockResolvedValue({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [primary],
    });

    render(<WorktreePanel repository={repository} busy={false} />);
    await screen.findByText("dirty");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove worktree" })[1]!,
    );
    expect(
      await screen.findByText(/Blocked: dirty, untracked/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Force remove" }));
    await waitFor(() => {
      expect(removeWorktree).toHaveBeenCalledWith("wt-1", true);
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove worktree" })[0]!,
    );
    expect(await screen.findByText(/Blocked: primary/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Force remove" }),
    ).not.toBeInTheDocument();
  });
});
