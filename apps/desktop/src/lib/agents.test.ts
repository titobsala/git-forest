import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectAgents, launchAgent, listAgentSessions } from "./agents";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("agent commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue([]);
  });

  it("invokes detect_agents", async () => {
    await detectAgents();
    expect(invokeCommand).toHaveBeenCalledWith("detect_agents");
  });

  it("invokes launch_agent with the worktree and optional agent id", async () => {
    vi.mocked(invokeCommand).mockResolvedValue({
      provider: "warp",
      agentId: "codex",
      command: "codex",
      lastUsedAt: "2026-08-25T10:00:00Z",
      sessionId: "session-1",
    });

    await launchAgent("wt-1");
    expect(invokeCommand).toHaveBeenCalledWith("launch_agent", {
      worktreeId: "wt-1",
      agentDefinitionId: null,
    });

    await launchAgent("wt-1", "claude");
    expect(invokeCommand).toHaveBeenCalledWith("launch_agent", {
      worktreeId: "wt-1",
      agentDefinitionId: "claude",
    });
  });

  it("invokes list_agent_sessions", async () => {
    await listAgentSessions();
    expect(invokeCommand).toHaveBeenCalledWith("list_agent_sessions");
  });
});
