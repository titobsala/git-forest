import { describe, expect, it } from "vitest";
import { sampleAgentSession } from "../types/forest";
import {
  activeSessionCount,
  compareSessionsNewestFirst,
  hasActiveSession,
  isActiveSession,
  primarySessionForWorktree,
} from "./agent-sessions";

describe("agent session selectors", () => {
  it("treats only starting and running as active", () => {
    expect(isActiveSession(sampleAgentSession({ status: "starting" }))).toBe(
      true,
    );
    expect(isActiveSession(sampleAgentSession({ status: "running" }))).toBe(
      true,
    );
    expect(isActiveSession(sampleAgentSession({ status: "exited" }))).toBe(
      false,
    );
    expect(isActiveSession(sampleAgentSession({ status: "unknown" }))).toBe(
      false,
    );
    expect(isActiveSession(sampleAgentSession({ status: "failed" }))).toBe(
      false,
    );
  });

  it("counts active sessions across worktrees", () => {
    const sessions = [
      sampleAgentSession({ id: "s-1", status: "running" }),
      sampleAgentSession({
        id: "s-2",
        worktreeId: "wt-2",
        status: "starting",
      }),
      sampleAgentSession({ id: "s-3", status: "exited" }),
    ];
    expect(activeSessionCount(sessions)).toBe(2);
    expect(hasActiveSession(sessions, "wt-1")).toBe(true);
    expect(hasActiveSession(sessions, "wt-2")).toBe(true);
    expect(hasActiveSession(sessions, "wt-3")).toBe(false);
  });

  it("picks the newest active session as the primary badge", () => {
    const older = sampleAgentSession({
      id: "older",
      launchedAt: "2026-08-25T09:00:00Z",
    });
    const newer = sampleAgentSession({
      id: "newer",
      launchedAt: "2026-08-25T11:00:00Z",
    });
    const exited = sampleAgentSession({
      id: "done",
      status: "exited",
      launchedAt: "2026-08-25T12:00:00Z",
    });
    expect(primarySessionForWorktree([older, newer, exited], "wt-1")?.id).toBe(
      "newer",
    );
  });

  it("breaks equal launch times with the session id", () => {
    const first = sampleAgentSession({
      id: "aaa",
      launchedAt: "2026-08-25T10:00:00Z",
    });
    const second = sampleAgentSession({
      id: "zzz",
      launchedAt: "2026-08-25T10:00:00Z",
    });
    expect(compareSessionsNewestFirst(first, second)).toBeGreaterThan(0);
    expect(primarySessionForWorktree([first, second], "wt-1")?.id).toBe("zzz");
  });

  it("returns null when a worktree has no active session", () => {
    expect(
      primarySessionForWorktree(
        [sampleAgentSession({ status: "unknown" })],
        "wt-1",
      ),
    ).toBeNull();
  });
});
