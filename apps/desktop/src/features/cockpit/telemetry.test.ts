import { describe, expect, it } from "vitest";
import { sampleWorktree } from "../../types/forest";
import {
  branchLabel,
  driftLabel,
  hierarchyMarker,
  isDirty,
  telemetryBadges,
} from "./telemetry";

describe("isDirty", () => {
  it("is true for tracked or untracked changes", () => {
    expect(isDirty(sampleWorktree({ trackedChanges: 1 }))).toBe(true);
    expect(isDirty(sampleWorktree({ untrackedFiles: 1 }))).toBe(true);
    expect(isDirty(sampleWorktree())).toBe(false);
  });
});

describe("driftLabel", () => {
  it("renders both directions", () => {
    expect(driftLabel(sampleWorktree({ ahead: 2, behind: 1 }))).toBe("2↑ 1↓");
  });

  it("omits the zero side", () => {
    expect(driftLabel(sampleWorktree({ ahead: 3, behind: 0 }))).toBe("3↑");
    expect(driftLabel(sampleWorktree({ ahead: 0, behind: 4 }))).toBe("4↓");
  });

  it("is null with no upstream or when in sync", () => {
    expect(
      driftLabel(sampleWorktree({ ahead: null, behind: null })),
    ).toBeNull();
    expect(driftLabel(sampleWorktree({ ahead: 0, behind: 0 }))).toBeNull();
  });
});

describe("telemetryBadges", () => {
  it("marks a clean worktree clean", () => {
    expect(telemetryBadges(sampleWorktree()).map((badge) => badge.id)).toEqual([
      "clean",
    ]);
  });

  it("marks a modified worktree dirty rather than clean", () => {
    const badges = telemetryBadges(
      sampleWorktree({ trackedChanges: 2, untrackedFiles: 1 }),
    );

    expect(badges.map((badge) => badge.id)).toEqual(["dirty"]);
    expect(badges[0]?.tone).toBe("high");
    expect(badges[0]?.title).toContain("2 tracked");
    expect(badges[0]?.title).toContain("1 untracked");
  });

  it("puts blocking conditions before status", () => {
    const badges = telemetryBadges(
      sampleWorktree({ present: false, locked: true, trackedChanges: 1 }),
    );

    expect(badges.map((badge) => badge.id)).toEqual([
      "missing",
      "locked",
      "dirty",
    ]);
  });

  it("does not claim a missing worktree is clean", () => {
    const badges = telemetryBadges(sampleWorktree({ present: false }));

    expect(badges.map((badge) => badge.id)).not.toContain("clean");
  });

  it("surfaces a status error instead of claiming the worktree is clean", () => {
    const badges = telemetryBadges(
      sampleWorktree({
        statusError: {
          code: "git_command_failed",
          message: "index unreadable",
        },
      }),
    );

    expect(badges.map((badge) => badge.id)).toEqual(["status"]);
    expect(badges[0]?.title).toBe("index unreadable");
  });

  it("includes the git prunable reason in the badge title", () => {
    const badges = telemetryBadges(
      sampleWorktree({ prunable: true, prunableReason: "git dir gone" }),
    );

    expect(badges.map((badge) => badge.id)).toContain("prunable");
    expect(badges.find((badge) => badge.id === "prunable")?.title).toBe(
      "git dir gone",
    );
  });
});

describe("hierarchyMarker", () => {
  it("terminates the last row", () => {
    expect(hierarchyMarker(0, 3)).toBe("├──");
    expect(hierarchyMarker(2, 3)).toBe("└──");
  });
});

describe("branchLabel", () => {
  it("prefers the branch name", () => {
    expect(branchLabel(sampleWorktree({ branch: "feat/x" }))).toBe("feat/x");
  });

  it("shortens a detached head", () => {
    expect(
      branchLabel(
        sampleWorktree({
          branch: null,
          detached: true,
          head: "abcdef1234567890",
        }),
      ),
    ).toBe("detached @ abcdef1");
  });

  it("falls back to the worktree name", () => {
    expect(
      branchLabel(
        sampleWorktree({ branch: null, detached: false, name: "wt" }),
      ),
    ).toBe("wt");
  });
});
