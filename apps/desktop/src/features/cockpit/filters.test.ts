import { describe, expect, it } from "vitest";
import { sampleWorktree } from "../../types/forest";
import { matchesFilter, worktreeMatches } from "./filters";

describe("worktreeMatches", () => {
  it("matches every worktree on an empty query", () => {
    expect(worktreeMatches(sampleWorktree(), "  ")).toBe(true);
  });

  it("matches branch, name and path", () => {
    const worktree = sampleWorktree({ branch: "feat/auth-142" });

    expect(worktreeMatches(worktree, "auth")).toBe(true);
    expect(worktreeMatches(worktree, "feat-auth")).toBe(true);
    expect(worktreeMatches(worktree, "forest/worktrees")).toBe(true);
  });

  it("requires every whitespace-separated term", () => {
    const worktree = sampleWorktree({ branch: "feat/auth-142" });

    expect(worktreeMatches(worktree, "auth 142")).toBe(true);
    expect(worktreeMatches(worktree, "auth nope")).toBe(false);
  });
});

describe("matchesFilter", () => {
  it("passes everything under All", () => {
    expect(matchesFilter(sampleWorktree(), "all")).toBe(true);
  });

  it("keeps only modified worktrees under Dirty", () => {
    expect(matchesFilter(sampleWorktree({ trackedChanges: 1 }), "dirty")).toBe(
      true,
    );
    expect(matchesFilter(sampleWorktree(), "dirty")).toBe(false);
  });

  it("yields nothing under Agents when no predicate matches", () => {
    expect(matchesFilter(sampleWorktree(), "agents")).toBe(false);
  });

  it("uses the supplied session predicate when one is given", () => {
    expect(matchesFilter(sampleWorktree(), "agents", () => true)).toBe(true);
  });
});
