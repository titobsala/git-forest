import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppInfo } from "./app-info";
import { invokeCommand } from "./tauri";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

describe("getAppInfo", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue({
      name: "Git Forest",
      version: "0.0.2",
      tagline: "Configuration rooted.",
    });
  });

  it("invokes the get_app_info command", async () => {
    const info = await getAppInfo();

    expect(invokeCommand).toHaveBeenCalledWith("get_app_info");
    expect(info).toEqual({
      name: "Git Forest",
      version: "0.0.2",
      tagline: "Configuration rooted.",
    });
  });
});
