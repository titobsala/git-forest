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

  it("drops cached worktrees when a repository becomes unavailable", async () => {
    const { result, rerender } = renderHook(
      ({ repositories }) => useWorktreeIndex(repositories),
      { initialProps: { repositories: [sampleRepository()] } },
    );

    act(() => {
      result.current.ensureLoaded("repo-1");
    });
    await waitFor(() => {
      expect(result.current.flat[0]?.worktree.id).toBe("wt-1");
    });
    expect(result.current.entryFor("repo-1").status).toBe("ready");

    rerender({
      repositories: [sampleRepository({ health: "missing" })],
    });

    expect(result.current.flat).toEqual([]);
    expect(result.current.entryFor("repo-1")).toEqual({
      status: "idle",
      worktrees: [],
      error: null,
    });
  });

  it("reloads worktrees after an unavailable repository becomes available", async () => {
    const { result, rerender } = renderHook(
      ({ repositories }) => useWorktreeIndex(repositories),
      { initialProps: { repositories: [sampleRepository()] } },
    );

    act(() => {
      result.current.ensureLoaded("repo-1");
    });
    await waitFor(() => {
      expect(result.current.flat[0]?.worktree.id).toBe("wt-1");
    });
    const loadsAfterReady = vi.mocked(listWorktrees).mock.calls.length;

    rerender({
      repositories: [sampleRepository({ health: "invalid" })],
    });
    expect(result.current.flat).toEqual([]);

    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({ id: "wt-fresh" }),
    ]);
    rerender({
      repositories: [sampleRepository()],
    });

    await waitFor(() => {
      expect(result.current.flat[0]?.worktree.id).toBe("wt-fresh");
    });
    expect(vi.mocked(listWorktrees).mock.calls.length).toBeGreaterThan(
      loadsAfterReady,
    );
  });
});
