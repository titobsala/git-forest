import { describe, expect, it, vi } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import { buildActions, filterActions, type ActionContext } from "./actions";
import type { LaunchResult } from "./results";

const repository = sampleRepository();
const worktree = sampleWorktree();

const repositoryResult: LaunchResult = {
  id: "repository:repo-1",
  kind: "repository",
  title: "EXOG App",
  subtitle: repository.path,
  repository,
  worktree: null,
};

const worktreeResult: LaunchResult = {
  id: "worktree:wt-1",
  kind: "worktree",
  title: "EXOG App / feat/risk-483",
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
    canCopy: true,
    ...overrides,
  };
}

describe("buildActions", () => {
  it("offers worktree actions with terminal and agent still deferred", () => {
    const actions = buildActions(worktreeResult, context());

    expect(actions.map((action) => action.id)).toEqual([
      "reveal",
      "copy-path",
      "terminal",
      "agent",
      "remove",
    ]);
    expect(actions.find((a) => a.id === "terminal")?.disabledReason).toBe(
      "Release 0.0.5",
    );
    expect(actions.find((a) => a.id === "agent")?.disabledReason).toBe(
      "Release 0.0.6",
    );
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
});

describe("filterActions", () => {
  const actions = buildActions(worktreeResult, context());

  it("keeps every action before anything is typed", () => {
    expect(filterActions(actions, "")).toHaveLength(actions.length);
  });

  it("ranks deferred actions last", () => {
    const shown = filterActions(actions, "e");

    expect(shown.at(-1)?.disabledReason).toBeDefined();
  });

  it("narrows to a single action", () => {
    expect(filterActions(actions, "copy").map((a) => a.id)).toEqual([
      "copy-path",
    ]);
  });
});
