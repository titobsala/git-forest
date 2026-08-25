import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRepository, sampleWorktree } from "../types/forest";
import { useWorktreeIndex } from "./useWorktreeIndex";
import { listWorktrees, refreshWorktrees } from "../lib/worktrees";

vi.mock("../lib/worktrees", () => ({
  listWorktrees: vi.fn(),
  refreshWorktrees: vi.fn(),
}));

describe("useWorktreeIndex", () => {
  beforeEach(() => {
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({ id: "wt-1", lastUsedAt: null }),
    ]);
    vi.mocked(refreshWorktrees).mockResolvedValue([]);
  });

  it("patches lastUsedAt on a cached worktree", async () => {
    const { result } = renderHook(() => useWorktreeIndex([sampleRepository()]));

    act(() => {
      result.current.ensureLoaded("repo-1");
    });
    await waitFor(() => {
      expect(result.current.flat[0]?.worktree.id).toBe("wt-1");
    });

    act(() => {
      result.current.touchWorktree("wt-1", "2026-08-25T10:00:00Z");
    });

    expect(result.current.flat[0]?.worktree.lastUsedAt).toBe(
      "2026-08-25T10:00:00Z",
    );
  });

  it("does not load worktrees for repositories that are not available", async () => {
    renderHook(() =>
      useWorktreeIndex([
        sampleRepository({ health: "missing" }),
        sampleRepository({ id: "repo-2", health: "unknown" }),
      ]),
    );

    await Promise.resolve();
    expect(listWorktrees).not.toHaveBeenCalled();
  });

  it("refreshAll only refreshes available repositories", async () => {
    vi.mocked(refreshWorktrees).mockResolvedValue([sampleWorktree()]);
    const { result } = renderHook(() =>
      useWorktreeIndex([
        sampleRepository(),
        sampleRepository({ id: "repo-2", health: "missing" }),
      ]),
    );

    act(() => {
      result.current.refreshAll(["repo-1", "repo-2"]);
    });

    await waitFor(() => {
      expect(refreshWorktrees).toHaveBeenCalledWith("repo-1");
    });
    expect(refreshWorktrees).not.toHaveBeenCalledWith("repo-2");
  });
});
