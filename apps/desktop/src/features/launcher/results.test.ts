import { describe, expect, it } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import { buildResults } from "./results";

const repository = sampleRepository({
  id: "repo-1",
  name: "Acme App",
  path: "/tmp/acme-app",
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
      name: "feat-auth-142",
      branch: "feat/auth-142",
      path: "/tmp/forest/acme-app/feat-auth-142",
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
    const results = buildResults([repository, other], worktrees, "auth-142");

    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("worktree");
    expect(results[0]?.title).toBe("Acme App / feat/auth-142");
    expect(results[0]?.worktree?.id).toBe("wt-1");
  });

  it("ranks a branch prefix match first", () => {
    const results = buildResults([repository, other], worktrees, "feat/map");

    expect(results[0]?.kind).toBe("worktree");
    expect(results[0]?.worktree?.id).toBe("wt-2");
  });

  it("ranks a repository whose name prefixes the query above its worktrees", () => {
    const results = buildResults([repository, other], worktrees, "acme");

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

  it("orders empty-query worktrees by recency then title", () => {
    const recent = [
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-old",
          name: "alpha",
          branch: "alpha",
          lastUsedAt: "2026-08-20T09:00:00Z",
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-new",
          name: "zeta",
          branch: "zeta",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-never",
          name: "beta",
          branch: "beta",
          lastUsedAt: null,
        }),
      },
    ];

    const results = buildResults([repository], recent, "");

    expect(
      results
        .filter((result) => result.kind === "worktree")
        .map((result) => result.worktree?.id),
    ).toEqual(["wt-new", "wt-old", "wt-never"]);
  });

  it("breaks equal search scores with recency", () => {
    const tied = [
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-older",
          name: "feat-auth",
          branch: "feat/auth-a",
          path: "/tmp/a",
          lastUsedAt: "2026-08-20T09:00:00Z",
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-newer",
          name: "feat-auth",
          branch: "feat/auth-b",
          path: "/tmp/b",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
    ];

    const results = buildResults([repository], tied, "feat/auth");

    expect(results.map((result) => result.worktree?.id)).toEqual([
      "wt-newer",
      "wt-older",
    ]);
  });

  it("sorts never-used worktrees after used ones at equal rank", () => {
    const mixed = [
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-unused",
          name: "feat-auth",
          branch: "feat/auth-x",
          path: "/tmp/x",
          lastUsedAt: null,
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-used",
          name: "feat-auth",
          branch: "feat/auth-y",
          path: "/tmp/y",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
    ];

    const results = buildResults([repository], mixed, "feat/auth");

    expect(results.map((result) => result.worktree?.id)).toEqual([
      "wt-used",
      "wt-unused",
    ]);
  });

  it("breaks equal recency with title then path", () => {
    const tied = [
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-z",
          name: "zeta",
          branch: "zeta",
          path: "/tmp/z",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-a-late",
          name: "alpha",
          branch: "alpha",
          path: "/tmp/a-late",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
      {
        repository,
        worktree: sampleWorktree({
          id: "wt-a-early",
          name: "alpha",
          branch: "alpha",
          path: "/tmp/a-early",
          lastUsedAt: "2026-08-25T10:00:00Z",
        }),
      },
    ];

    const results = buildResults([repository], tied, "");

    expect(
      results
        .filter((result) => result.kind === "worktree")
        .map((result) => result.worktree?.id),
    ).toEqual(["wt-a-early", "wt-a-late", "wt-z"]);
  });
});
