import { describe, expect, it, vi } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import { buildActions, filterActions, type ActionContext } from "./actions";
import type { LaunchResult } from "./results";

const repository = sampleRepository();
const worktree = sampleWorktree();

const repositoryResult: LaunchResult = {
  id: "repository:repo-1",
  kind: "repository",
  title: "Acme App",
  subtitle: repository.path,
  repository,
  worktree: null,
};

const worktreeResult: LaunchResult = {
  id: "worktree:wt-1",
  kind: "worktree",
  title: "Acme App / feat/auth-142",
  subtitle: worktree.path,
  repository,
  worktree,
};

function context(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    reveal: vi.fn(),
    newWorktree: vi.fn(),
    refreshRepository: vi.fn(),
    copyPath: vi.fn(),
    removeWorktree: vi.fn(),
    removeRepository: vi.fn(),
    openTerminal: vi.fn(),
    launchAgent: vi.fn(),
    canCopy: true,
    ...overrides,
  };
}

describe("buildActions", () => {
  it("offers worktree actions including terminal and agent", () => {
    const actions = buildActions(worktreeResult, context());

    expect(actions.map((action) => action.id)).toEqual([
      "reveal",
      "copy-path",
      "terminal",
      "agent",
      "remove",
    ]);
    expect(
      actions.find((a) => a.id === "terminal")?.disabledReason,
    ).toBeUndefined();
    expect(
      actions.find((a) => a.id === "agent")?.disabledReason,
    ).toBeUndefined();
  });

  it("offers repository actions", () => {
    const actions = buildActions(repositoryResult, context());

    expect(actions.map((action) => action.id)).toEqual([
      "reveal",
      "new-worktree",
      "refresh",
      "copy-path",
      "remove",
    ]);
  });

  it("drops the copy action when the platform has no clipboard", () => {
    const actions = buildActions(worktreeResult, context({ canCopy: false }));

    expect(actions.map((action) => action.id)).not.toContain("copy-path");
  });

  it("copies the result path", () => {
    const ctx = context();
    buildActions(worktreeResult, ctx)
      .find((action) => action.id === "copy-path")
      ?.run();

    expect(ctx.copyPath).toHaveBeenCalledWith(worktree.path);
  });

  it("creates a worktree in the repository it was opened from", () => {
    const ctx = context();
    buildActions(repositoryResult, ctx)
      .find((action) => action.id === "new-worktree")
      ?.run();

    expect(ctx.newWorktree).toHaveBeenCalledWith(repository);
  });

  it("opens the worktree in the terminal", () => {
    const ctx = context();
    buildActions(worktreeResult, ctx)
      .find((action) => action.id === "terminal")
      ?.run();

    expect(ctx.openTerminal).toHaveBeenCalledWith(worktree);
  });

  it("launches the configured agent in the worktree", () => {
    const ctx = context();
    buildActions(worktreeResult, ctx)
      .find((action) => action.id === "agent")
      ?.run();

    expect(ctx.launchAgent).toHaveBeenCalledWith(worktree);
  });
});

describe("filterActions", () => {
  const actions = buildActions(worktreeResult, context());

  it("keeps every action before anything is typed", () => {
    expect(filterActions(actions, "")).toHaveLength(actions.length);
  });

  it("ranks a matching action first", () => {
    const shown = filterActions(actions, "agent");

    expect(shown[0]?.id).toBe("agent");
    expect(shown[0]?.disabledReason).toBeUndefined();
  });

  it("narrows to a single action", () => {
    expect(filterActions(actions, "copy").map((a) => a.id)).toEqual([
      "copy-path",
    ]);
  });
});
