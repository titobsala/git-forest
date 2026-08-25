import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getForestState, updateForestConfiguration } from "../lib/forest";
import { reconcileRepositories } from "../lib/repositories";
import { pickDirectory } from "../lib/dialog";
import { openWorktreeInTerminal } from "../lib/terminals";
import { detectAgents, launchAgent, listAgentSessions } from "../lib/agents";
import { listWorktrees, refreshWorktrees } from "../lib/worktrees";
import {
  FALLBACK_FOREST_STATE,
  sampleRepository,
  sampleWorktree,
  sampleAgentSession,
} from "../types/forest";

const nativeState = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 2,
  appInfo: {
    name: "Git Forest",
    version: "0.1.0",
    tagline: "Worktrees in reach.",
  },
  repositories: [sampleRepository()],
};

vi.mock("../lib/forest", () => ({
  getForestState: vi.fn(),
  updateForestConfiguration: vi.fn(),
}));

vi.mock("../lib/repositories", () => ({
  importRepository: vi.fn(),
  importRepositories: vi.fn(),
  refreshRepository: vi.fn(),
  removeRepository: vi.fn(),
  reconcileRepositories: vi.fn(),
  relocateRepository: vi.fn(),
}));

vi.mock("../lib/dialog", () => ({
  pickDirectory: vi.fn(),
}));

vi.mock("../lib/scan", () => ({
  startRepositoryScan: vi.fn(),
  cancelRepositoryScan: vi.fn(),
  listenToScanProgress: vi.fn(),
  listenToScanComplete: vi.fn(),
}));

vi.mock("../lib/worktrees", () => ({
  listWorktrees: vi.fn(),
  refreshWorktrees: vi.fn(),
  listLocalBranches: vi.fn(),
  previewCreateWorktree: vi.fn(),
  createWorktree: vi.fn(),
  getWorktreeRemovalPreview: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../lib/terminals", () => ({
  openWorktreeInTerminal: vi.fn(),
}));

vi.mock("../lib/agents", () => ({
  detectAgents: vi.fn(),
  launchAgent: vi.fn(),
  listAgentSessions: vi.fn(),
}));

// `restoreMocks: true` resets implementations between tests, so every mock the
// shell depends on has to be re-established here rather than at module scope.
beforeEach(async () => {
  const scan = await import("../lib/scan");
  vi.mocked(scan.listenToScanProgress).mockResolvedValue(() => undefined);
  vi.mocked(scan.listenToScanComplete).mockResolvedValue(() => undefined);
  vi.mocked(listWorktrees).mockResolvedValue([]);
  vi.mocked(refreshWorktrees).mockImplementation((id) => listWorktrees(id));
  vi.mocked(reconcileRepositories).mockImplementation(async () => {
    return await vi.mocked(getForestState)();
  });
  vi.mocked(pickDirectory).mockResolvedValue(null);
  vi.mocked(openWorktreeInTerminal).mockResolvedValue({
    provider: "warp",
    lastUsedAt: "2026-08-25T10:00:00Z",
  });
  vi.mocked(launchAgent).mockResolvedValue({
    provider: "warp",
    agentId: "codex",
    command: "codex",
    lastUsedAt: "2026-08-25T10:00:00Z",
    sessionId: "session-1",
  });
  vi.mocked(detectAgents).mockResolvedValue([]);
  vi.mocked(listAgentSessions).mockResolvedValue([]);
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("App", () => {
  it("shows a loading state until forest state arrives", () => {
    vi.mocked(getForestState).mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByText("Loading Forest…")).toBeInTheDocument();
  });

  it("renders the cockpit shell with its four stages", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: "Repositories" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Worktree inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listbox", { name: "Worktrees" }),
    ).toBeInTheDocument();

    // Top bar identity. The version lives in Settings, not here.
    expect(screen.getByText("Git Forest")).toBeInTheDocument();
    expect(screen.queryByText("v0.1.0")).not.toBeInTheDocument();
  });

  it("groups worktrees under their repository with telemetry badges", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({
        id: "wt-1",
        branch: "feat/risk-483",
        trackedChanges: 2,
      }),
      sampleWorktree({
        id: "wt-2",
        name: "fix-report-export",
        branch: "fix/report-export",
        ahead: 2,
        behind: 1,
      }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    expect(screen.getByText("dirty")).toBeInTheDocument();
    expect(screen.getByText("clean")).toBeInTheDocument();
    expect(screen.getByText("2↑ 1↓")).toBeInTheDocument();
    // The repository name also appears in the L2 sidebar, so scope the
    // accordion assertion to the cockpit list.
    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    expect(cockpit.getByRole("button", { name: /EXOG App/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("opens Quick Launch on the toggle shortcut and closes on Escape", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({ branch: "feat/risk-483" }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");

    const dialog = await screen.findByRole("dialog", { name: "Quick Launch" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("EXOG App / feat/risk-483")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Quick Launch" }),
      ).not.toBeInTheDocument();
    });
  });

  it("runs a command chosen from Quick Launch", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("navigation", { name: "Primary" }),
      ).toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Quick Launch" });

    await user.keyboard("settings");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Quick Launch" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Forest status" }),
    ).toBeInTheDocument();
  });

  it("lands a settings command on the panel it names", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("navigation", { name: "Primary" }),
      ).toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Quick Launch" });

    await user.keyboard("link repo");
    await user.keyboard("{Enter}");

    // Not just "Settings is showing": the command scrolls to and focuses the
    // panel it names, which is the whole point of it over clicking the gear.
    const panel = await screen.findByRole("heading", {
      name: "Link repository",
    });
    expect(panel).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Display name (optional)")).toHaveFocus();
    });
  });

  it("applies and persists a theme picked from the rail", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(updateForestConfiguration).mockResolvedValue({
      ...nativeState,
      configuration: { ...nativeState.configuration, theme: "light" },
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("navigation", { name: "Primary" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Theme: Match system" }),
    );

    expect(updateForestConfiguration).toHaveBeenCalledWith({
      ...nativeState.configuration,
      theme: "light",
    });
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("drops the worktree selection when another repository is picked", async () => {
    const user = userEvent.setup();
    const ledger = sampleRepository({ id: "repo-2", name: "Ledger" });
    vi.mocked(getForestState).mockResolvedValue({
      ...nativeState,
      repositories: [sampleRepository(), ledger],
    });
    vi.mocked(listWorktrees).mockImplementation(async (repositoryId) =>
      repositoryId === "repo-1"
        ? [sampleWorktree({ id: "wt-1", branch: "feat/risk-483" })]
        : [
            sampleWorktree({
              id: "wt-2",
              repositoryId: "repo-2",
              name: "fix-report-export",
              branch: "fix/report-export",
            }),
          ],
    );

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /feat/ }));

    const inspector = within(
      screen.getByRole("complementary", { name: "Worktree inspector" }),
    );
    expect(inspector.getByText("EXOG App")).toBeInTheDocument();

    // Moving to another repository must not leave EXOG App's worktree behind:
    // the inspector would otherwise offer to remove it as if it were Ledger's.
    await user.click(
      within(
        screen.getByRole("complementary", { name: "Repositories" }),
      ).getByRole("button", { name: /Ledger/ }),
    );

    await waitFor(() => {
      expect(
        inspector.getByText("Select a worktree to inspect its telemetry."),
      ).toBeInTheDocument();
    });
    expect(inspector.queryByText("Ledger")).not.toBeInTheDocument();
  });

  it("lists repositories one at a time rather than all at once", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.mocked(getForestState).mockResolvedValue({
      ...nativeState,
      repositories: [
        sampleRepository(),
        sampleRepository({ id: "repo-2", name: "Ledger" }),
        sampleRepository({ id: "repo-3", name: "Atlas" }),
      ],
    });
    // Each listing holds the single Forest mutex in Rust, so overlapping them
    // would park a user's next command behind the whole forest.
    vi.mocked(listWorktrees).mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(listWorktrees).toHaveBeenCalledTimes(3);
    });
    expect(peak).toBe(1);
  });

  it("shows an error and the fallback snapshot when loading fails", async () => {
    vi.mocked(getForestState).mockRejectedValue({
      code: "database",
      message: "database error: locked",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "database error: locked",
      );
    });

    // The shell still renders around the error rather than blanking out.
    expect(
      screen.getByRole("heading", { name: "Git Forest" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });

  it("opens a worktree in Warp from the cockpit row", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Open in warp" }));

    expect(openWorktreeInTerminal).toHaveBeenCalledWith("wt-1");
  });

  it("opens the active worktree in Warp from the cockpit Enter shortcut", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    const option = await screen.findByRole("option", {
      name: /feat\/risk-483/,
    });
    option.focus();
    await user.keyboard("{Enter}");

    expect(openWorktreeInTerminal).toHaveBeenCalledWith("wt-1");
  });

  it("opens a worktree in Warp from Quick Launch Enter", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Quick Launch" });
    await user.keyboard("risk-483");
    await user.keyboard("{Enter}");

    expect(openWorktreeInTerminal).toHaveBeenCalledWith("wt-1");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Quick Launch" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a typed terminal error instead of failing silently", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(openWorktreeInTerminal).mockRejectedValue({
      code: "terminal_unavailable",
      message: "Warp is not available",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Open in warp" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Warp is not available",
    );
  });

  it("launches Codex from the cockpit row", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Launch Codex" }));

    expect(launchAgent).toHaveBeenCalledWith("wt-1");
  });

  it("launches Codex from the cockpit Alt+A shortcut", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    const option = await screen.findByRole("option", {
      name: /feat\/risk-483/,
    });
    option.focus();
    await user.keyboard("{Alt>}a{/Alt}");

    expect(launchAgent).toHaveBeenCalledWith("wt-1");
  });

  it("keeps Enter on a focused agent button from opening the terminal", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    cockpit.getByRole("button", { name: "Launch Codex" }).focus();
    await user.keyboard("{Enter}");

    expect(launchAgent).toHaveBeenCalledWith("wt-1");
    expect(openWorktreeInTerminal).not.toHaveBeenCalled();
  });

  it("shows a typed agent error instead of failing silently", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(launchAgent).mockRejectedValue({
      code: "agent_unavailable",
      message: "Codex is not available",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Launch Codex" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Codex is not available",
    );
  });

  it("shows a live agent badge and tray count from session data", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(listAgentSessions).mockResolvedValue([sampleAgentSession()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    expect(screen.getAllByText("PID 4242").length).toBeGreaterThan(0);
    expect(screen.getByTitle("Forest status")).toHaveTextContent("1 proc");
  });

  it("keeps only worktrees with active sessions under the Agents filter", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([
      sampleWorktree({ id: "wt-1", branch: "feat/risk-483" }),
      sampleWorktree({
        id: "wt-2",
        name: "fix-report-export",
        branch: "fix/report-export",
      }),
    ]);
    vi.mocked(listAgentSessions).mockResolvedValue([
      sampleAgentSession({ worktreeId: "wt-1" }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });
    expect(screen.getByText("fix/report-export")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agents" }));

    expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    expect(screen.queryByText("fix/report-export")).not.toBeInTheDocument();
  });

  it("refreshes sessions after launching an agent", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(listAgentSessions)
      .mockResolvedValueOnce([])
      .mockResolvedValue([sampleAgentSession()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });
    expect(screen.queryByText("PID 4242")).not.toBeInTheDocument();

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Launch Codex" }));

    await waitFor(() => {
      expect(screen.getAllByText("PID 4242").length).toBeGreaterThan(0);
    });
    expect(launchAgent).toHaveBeenCalledWith("wt-1");
  });

  it("clears the primary badge when a running session exits", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(listAgentSessions).mockResolvedValue([sampleAgentSession()]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("PID 4242").length).toBeGreaterThan(0);
    });

    vi.mocked(listAgentSessions).mockResolvedValue([
      sampleAgentSession({
        status: "exited",
        pid: null,
        exitedAt: "2026-08-25T11:00:00Z",
      }),
    ]);
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(screen.queryByText("PID 4242")).not.toBeInTheDocument();
    });
    expect(screen.getByTitle("Forest status")).toHaveTextContent("0 proc");
  });

  it("lists sessions on the agent monitor", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(listAgentSessions).mockResolvedValue([
      sampleAgentSession(),
      sampleAgentSession({
        id: "session-2",
        status: "unknown",
        pid: null,
      }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Agent monitor" }));

    expect(await screen.findByText("running")).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getByText("PID 4242")).toBeInTheDocument();
    expect(
      screen.getAllByText("EXOG App / feat/risk-483").length,
    ).toBeGreaterThan(0);
  });

  it("renders cached repositories before reconciliation completes", async () => {
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(reconcileRepositories).mockReturnValue(
      new Promise(() => undefined),
    );

    render(<App />);

    const sidebar = await screen.findByRole("complementary", {
      name: "Repositories",
    });
    expect(within(sidebar).getByText("EXOG App")).toBeInTheDocument();
    expect(listWorktrees).not.toHaveBeenCalled();
    expect(refreshWorktrees).not.toHaveBeenCalled();
  });

  it("waits to list worktrees until repository reconciliation finishes", async () => {
    let resolveReconcile: (value: typeof nativeState) => void = () => {};
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(reconcileRepositories).mockReturnValue(
      new Promise((resolve) => {
        resolveReconcile = resolve;
      }),
    );

    render(<App />);
    const sidebar = await screen.findByRole("complementary", {
      name: "Repositories",
    });
    expect(within(sidebar).getByText("EXOG App")).toBeInTheDocument();
    expect(screen.queryByText("feat/risk-483")).not.toBeInTheDocument();

    resolveReconcile(nativeState);

    expect(await screen.findByText("feat/risk-483")).toBeInTheDocument();
  });

  it("offers Open Settings for a terminal_unavailable error", async () => {
    const user = userEvent.setup();
    vi.mocked(getForestState).mockResolvedValue(nativeState);
    vi.mocked(listWorktrees).mockResolvedValue([sampleWorktree()]);
    vi.mocked(openWorktreeInTerminal).mockRejectedValue({
      code: "terminal_unavailable",
      message: "Warp is not available",
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("feat/risk-483")).toBeInTheDocument();
    });

    const cockpit = within(screen.getByRole("listbox", { name: "Worktrees" }));
    await user.click(cockpit.getByRole("button", { name: "Open in warp" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Warp is not available");
    await user.click(
      within(alert).getByRole("button", { name: "Open Settings" }),
    );
    expect(
      screen.getByRole("heading", { name: "Forest status" }),
    ).toBeInTheDocument();
  });

  it("keeps the empty cockpit copy when no repositories are indexed", async () => {
    vi.mocked(getForestState).mockResolvedValue({
      ...nativeState,
      repositories: [],
    });

    render(<App />);

    expect(
      await screen.findByText(/Add or scan for repositories from the/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("No repositories indexed yet.").length,
    ).toBeGreaterThan(0);
  });
});
