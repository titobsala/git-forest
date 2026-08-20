import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelRepositoryScan, startRepositoryScan } from "./scan";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("scan commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue("scan-1");
  });

  it("starts and cancels a scan", async () => {
    await startRepositoryScan("/tmp/projects", 3);
    expect(invokeCommand).toHaveBeenCalledWith("start_repository_scan", {
      root: "/tmp/projects",
      maxDepth: 3,
    });

    await cancelRepositoryScan("scan-1");
    expect(invokeCommand).toHaveBeenCalledWith("cancel_repository_scan", {
      scanId: "scan-1",
    });
  });
});
