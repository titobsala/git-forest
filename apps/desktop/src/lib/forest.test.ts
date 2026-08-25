import { beforeEach, describe, expect, it, vi } from "vitest";
import { getForestState, updateForestConfiguration } from "./forest";
import { invokeCommand } from "./tauri";
import type { ForestState } from "../types/forest";

vi.mock("./tauri", () => ({
  invokeCommand: vi.fn(),
}));

const sampleState: ForestState = {
  appInfo: {
    name: "Git Forest",
    version: "0.0.8",
    tagline: "Worktrees in reach.",
  },
  configuration: {
    forestRoot: "/tmp/forest",
    defaultTerminal: "warp",
    defaultAgentId: "codex",
    worktreeNamingStrategy: "branch_slug",
    launchBehavior: "auto",
    theme: "system",
  },
  paths: {
    appDataDir: "/tmp/app-data",
    databasePath: "/tmp/app-data/forest.db",
    forestRoot: "/tmp/forest",
  },
  databaseInitialized: true,
  schemaVersion: 1,
  agentDefinitions: [],
  repositories: [],
};

describe("forest commands", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockResolvedValue(sampleState);
  });

  it("invokes get_forest_state", async () => {
    const state = await getForestState();

    expect(invokeCommand).toHaveBeenCalledWith("get_forest_state");
    expect(state.schemaVersion).toBe(1);
  });

  it("invokes update_forest_configuration with the payload", async () => {
    await updateForestConfiguration(sampleState.configuration);

    expect(invokeCommand).toHaveBeenCalledWith("update_forest_configuration", {
      configuration: sampleState.configuration,
    });
  });
});
