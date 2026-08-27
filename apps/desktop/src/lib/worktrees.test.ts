import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorktree,
  fetchBranchCatalog,
  getWorktreeRemovalPreview,
  listBranchCatalog,
  listWorktrees,
  removeWorktree,
} from "./worktrees";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("worktree commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue([]);
  });

  it("invokes list, create, preview, and remove commands", async () => {
    await listWorktrees("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("list_worktrees", {
      repositoryId: "repo-1",
    });

    await listBranchCatalog("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("list_branch_catalog", {
      repositoryId: "repo-1",
    });

    await fetchBranchCatalog("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("fetch_branch_catalog", {
      repositoryId: "repo-1",
    });

    await createWorktree({
      repositoryId: "repo-1",
      baseRef: "main",
      branch: "feat/demo",
      copyLocalEnvFiles: true,
    });
    expect(invokeCommand).toHaveBeenCalledWith("create_worktree", {
      input: {
        repositoryId: "repo-1",
        baseRef: "main",
        branch: "feat/demo",
        copyLocalEnvFiles: true,
      },
    });

    await getWorktreeRemovalPreview("wt-1");
    expect(invokeCommand).toHaveBeenCalledWith("get_worktree_removal_preview", {
      worktreeId: "wt-1",
    });

    await removeWorktree("wt-1", true);
    expect(invokeCommand).toHaveBeenCalledWith("remove_worktree", {
      worktreeId: "wt-1",
      force: true,
    });
  });
});
