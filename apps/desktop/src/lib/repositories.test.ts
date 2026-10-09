import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  importRepositories,
  importRepository,
  listRepositories,
  reconcileRepositories,
  refreshRepository,
  relocateRepository,
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
      name: "Acme App",
      path: "/tmp/acme-app",
    });

    expect(invokeCommand).toHaveBeenCalledWith("import_repository", {
      name: "Acme App",
      path: "/tmp/acme-app",
    });
  });

  it("invokes import_repositories, refresh, and remove", async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ imported: [] });
    await importRepositories(["/tmp/acme-app"]);
    expect(invokeCommand).toHaveBeenCalledWith("import_repositories", {
      paths: ["/tmp/acme-app"],
    });

    await refreshRepository("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("refresh_repository", {
      id: "repo-1",
    });

    await removeRepository("repo-1");
    expect(invokeCommand).toHaveBeenCalledWith("remove_repository", {
      id: "repo-1",
    });

    await reconcileRepositories();
    expect(invokeCommand).toHaveBeenCalledWith("reconcile_repositories");

    await relocateRepository("repo-1", "/tmp/moved");
    expect(invokeCommand).toHaveBeenCalledWith("relocate_repository", {
      id: "repo-1",
      path: "/tmp/moved",
    });
  });
});
