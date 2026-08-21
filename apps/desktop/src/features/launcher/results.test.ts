import { describe, expect, it } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import { buildResults } from "./results";

const repository = sampleRepository({
  id: "repo-1",
  name: "EXOG App",
  path: "/tmp/exog-app",
});
const other = sampleRepository({
  id: "repo-2",
  name: "Game",
  path: "/tmp/game",
});

const worktrees = [
  {
    repository,
    worktree: sampleWorktree({
      id: "wt-1",
      name: "feat-risk-483",
      branch: "feat/risk-483",
      path: "/tmp/forest/exog-app/feat-risk-483",
    }),
  },
  {
    repository: other,
    worktree: sampleWorktree({
      id: "wt-2",
      repositoryId: "repo-2",
      name: "feat-map-generation",
      branch: "feat/map-generation",
      path: "/tmp/forest/game/feat-map-generation",
    }),
  },
];

describe("buildResults", () => {
  it("lists everything when the query is empty", () => {
    const results = buildResults([repository, other], worktrees, "");

    expect(results).toHaveLength(4);
  });

  it("labels worktrees with their repository", () => {
    const results = buildResults([repository, other], worktrees, "risk-483");

    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("worktree");
    expect(results[0]?.title).toBe("EXOG App / feat/risk-483");
    expect(results[0]?.worktree?.id).toBe("wt-1");
  });

  it("ranks a branch prefix match first", () => {
    const results = buildResults([repository, other], worktrees, "feat/map");

    expect(results[0]?.kind).toBe("worktree");
    expect(results[0]?.worktree?.id).toBe("wt-2");
  });

  it("ranks a repository whose name prefixes the query above its worktrees", () => {
    const results = buildResults([repository, other], worktrees, "exog");

    expect(results[0]?.kind).toBe("repository");
    expect(results[0]?.repository.id).toBe("repo-1");
    // The worktree still appears, just below its repository.
    expect(results.map((result) => result.id)).toContain("worktree:wt-1");
  });

  it("matches on path as well as name", () => {
    const results = buildResults([repository, other], worktrees, "tmp/game");

    expect(results.map((result) => result.repository.id)).toContain("repo-2");
  });

  it("returns nothing when there is no match", () => {
    expect(buildResults([repository], worktrees, "zzzz")).toEqual([]);
  });
});
