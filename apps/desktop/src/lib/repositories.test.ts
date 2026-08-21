import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  importRepositories,
  importRepository,
  listRepositories,
  refreshRepository,
  removeRepository,
} from "./repositories";
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

  it("invokes import_repository with the payload", async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ repositories: [] });

    await importRepository({
      name: "EXOG App",
      path: "/tmp/exog-app",
    });

    expect(invokeCommand).toHaveBeenCalledWith("import_repository", {
      name: "EXOG App",
      path: "/tmp/exog-app",
    });
  });

  it("invokes import_repositories, refresh, and remove", async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ imported: [] });
    await importRepositories(["/tmp/exog-app"]);
    expect(invokeCommand).toHaveBeenCalledWith("import_repositories", {
      paths: ["/tmp/exog-app"],
    });

    await refreshRepository("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("refresh_repository", {
      id: "repo-1",
    });

    await removeRepository("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("remove_repository", {
      id: "repo-1",
    });
  });
});
