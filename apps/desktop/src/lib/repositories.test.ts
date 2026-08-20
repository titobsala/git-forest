import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRepositories, registerRepository } from "./repositories";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("repository commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue([]);
  });

  it("invokes list_repositories", async () => {
    await listRepositories();
    expect(invokeCommand).toHaveBeenCalledWith("list_repositories");
  });

  it("invokes register_repository with the payload", async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ repositories: [] });

    await registerRepository({
      name: "EXOG App",
      path: "/tmp/exog-app",
      mode: "linked",
    });

    expect(invokeCommand).toHaveBeenCalledWith("register_repository", {
      name: "EXOG App",
      path: "/tmp/exog-app",
      mode: "linked",
    });
  });
});
