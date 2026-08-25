import { beforeEach, describe, expect, it, vi } from "vitest";
import { openWorktreeInTerminal } from "./terminals";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("terminal commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue({
      provider: "warp",
      lastUsedAt: "2026-08-25T10:00:00Z",
    });
  });

  it("invokes open_worktree with the worktree id", async () => {
    await expect(openWorktreeInTerminal("wt-1")).resolves.toEqual({
      provider: "warp",
      lastUsedAt: "2026-08-25T10:00:00Z",
    });
    expect(invokeCommand).toHaveBeenCalledWith("open_worktree", {
      worktreeId: "wt-1",
    });
  });
});
