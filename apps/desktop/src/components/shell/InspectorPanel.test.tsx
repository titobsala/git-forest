import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "./InspectorPanel";
import {
  FALLBACK_FOREST_STATE,
  sampleRepository,
  sampleWorktree,
} from "../../types/forest";
import type { Worktree, WorktreeRemovalPreview } from "../../types/forest";
import { getWorktreeRemovalPreview, removeWorktree } from "../../lib/worktrees";

vi.mock("../../lib/worktrees", () => ({
  getWorktreeRemovalPreview: vi.fn(),
  removeWorktree: vi.fn(),
}));

const previewMock = vi.mocked(getWorktreeRemovalPreview);
const removeMock = vi.mocked(removeWorktree);

const repository = sampleRepository();
const first = sampleWorktree({ id: "wt-1", name: "feat-risk-483" });
const second = sampleWorktree({ id: "wt-2", name: "fix-ledger-991" });

function previewFor(worktree: Worktree): WorktreeRemovalPreview {
  return {
    worktree,
    allowed: true,
    requiresForce: false,
    blockers: [],
  };
}

function renderPanel(worktree: Worktree) {
  return render(
    <InspectorPanel
      repository={repository}
      worktree={worktree}
      configuration={FALLBACK_FOREST_STATE.configuration}
      agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
      collapsed={false}
      onToggleCollapsed={vi.fn()}
      onWorktreesChanged={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
}

describe("InspectorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a removal preview that resolves after the selection moved on", async () => {
    const user = userEvent.setup();
    let resolvePreview: (value: WorktreeRemovalPreview) => void = () => {};
    previewMock.mockReturnValueOnce(
      new Promise<WorktreeRemovalPreview>((resolve) => {
        resolvePreview = resolve;
      }),
    );

    const view = renderPanel(first);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    view.rerender(
      <InspectorPanel
        repository={repository}
        worktree={second}
        configuration={FALLBACK_FOREST_STATE.configuration}
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        onWorktreesChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    await act(async () => {
      resolvePreview(previewFor(first));
    });

    expect(
      screen.queryByRole("region", { name: "Remove worktree" }),
    ).toBeNull();
    expect(screen.queryByText(/Remove feat-risk-483\?/)).toBeNull();
    // The panel stays usable for the newly selected worktree.
    expect(
      screen.getByRole("button", { name: "Remove worktree" }),
    ).toBeEnabled();
  });

  it("confirms removal for the worktree the preview was requested for", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValueOnce(previewFor(second));
    removeMock.mockResolvedValueOnce({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [],
    });

    renderPanel(second);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    expect(await screen.findByText(/Remove fix-ledger-991\?/)).toBeTruthy();

    const region = screen.getByRole("region", { name: "Remove worktree" });
    await user.click(
      within(region).getByRole("button", { name: "Remove worktree" }),
    );

    expect(removeMock).toHaveBeenCalledWith("wt-2", false);
  });

  it("force-removes a dirty worktree after the preview says force is required", async () => {
    const user = userEvent.setup();
    const dirty = sampleWorktree({
      id: "wt-dirty",
      name: "feat-dirty",
      trackedChanges: 2,
      untrackedFiles: 0,
    });
    previewMock.mockResolvedValueOnce({
      worktree: dirty,
      allowed: false,
      requiresForce: true,
      blockers: ["dirty"],
    });
    removeMock.mockResolvedValueOnce({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [],
    });

    renderPanel(dirty);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    const region = await screen.findByRole("region", {
      name: "Remove worktree",
    });
    expect(within(region).getByText(/Blocked: dirty/)).toBeTruthy();
    expect(
      within(region).queryByRole("button", { name: "Remove worktree" }),
    ).toBeNull();

    await user.click(
      within(region).getByRole("button", { name: "Force remove" }),
    );
    expect(removeMock).toHaveBeenCalledWith("wt-dirty", true);
  });

  it("does not offer force removal for a primary worktree", async () => {
    const user = userEvent.setup();
    const primary = sampleWorktree({
      id: "wt-primary",
      name: "main",
      isPrimary: true,
    });
    previewMock.mockResolvedValueOnce({
      worktree: primary,
      allowed: false,
      requiresForce: false,
      blockers: ["primary"],
    });

    renderPanel(primary);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    const region = await screen.findByRole("region", {
      name: "Remove worktree",
    });
    expect(within(region).getByText(/Blocked: primary/)).toBeTruthy();
    expect(
      within(region).queryByRole("button", { name: "Force remove" }),
    ).toBeNull();
    expect(
      within(region).queryByRole("button", { name: "Remove worktree" }),
    ).toBeNull();
  });

  it("opens the worktree in the terminal from the inspector", async () => {
    const user = userEvent.setup();
    const onOpenTerminal = vi.fn();
    render(
      <InspectorPanel
        repository={repository}
        worktree={first}
        configuration={FALLBACK_FOREST_STATE.configuration}
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        onWorktreesChanged={vi.fn()}
        onRemoved={vi.fn()}
        onOpenTerminal={onOpenTerminal}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open in warp" }));
    expect(onOpenTerminal).toHaveBeenCalledWith(first);
  });

  it("launches the configured agent from the inspector", async () => {
    const user = userEvent.setup();
    const onLaunchAgent = vi.fn();
    render(
      <InspectorPanel
        repository={repository}
        worktree={first}
        configuration={FALLBACK_FOREST_STATE.configuration}
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        onWorktreesChanged={vi.fn()}
        onRemoved={vi.fn()}
        onLaunchAgent={onLaunchAgent}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Launch Codex" }));
    expect(onLaunchAgent).toHaveBeenCalledWith(first);
  });

  it("omits removal when git does not know the worktree", () => {
    renderPanel(sampleWorktree({ gitKnown: false, present: true }));

    expect(
      screen.queryByRole("button", { name: "Remove worktree" }),
    ).not.toBeInTheDocument();
  });

  it("omits removal when status is unavailable", () => {
    renderPanel(
      sampleWorktree({
        statusError: {
          code: "git_command_failed",
          message: "index unreadable",
        },
      }),
    );

    expect(screen.getByText("index unreadable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove worktree" }),
    ).not.toBeInTheDocument();
  });

  it("disables open and launch when the directory is missing", () => {
    render(
      <InspectorPanel
        repository={repository}
        worktree={sampleWorktree({ present: false })}
        configuration={FALLBACK_FOREST_STATE.configuration}
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        onWorktreesChanged={vi.fn()}
        onRemoved={vi.fn()}
        onOpenTerminal={vi.fn()}
        onLaunchAgent={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Open in warp" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Launch Codex" })).toBeDisabled();
  });

  it("uses force styling and Escape restores the remove trigger", async () => {
    const user = userEvent.setup();
    const dirty = sampleWorktree({
      id: "wt-dirty",
      name: "feat-dirty",
      trackedChanges: 2,
    });
    previewMock.mockResolvedValueOnce({
      worktree: dirty,
      allowed: false,
      requiresForce: true,
      blockers: ["dirty"],
    });

    renderPanel(dirty);
    const trigger = screen.getByRole("button", { name: "Remove worktree" });
    await user.click(trigger);

    const force = await screen.findByRole("button", { name: "Force remove" });
    expect(force.className).toContain("gf-button-force");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Remove worktree" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Remove worktree" }),
    ).toHaveFocus();
  });

  it("shows tracked, untracked, and ignored counts", () => {
    renderPanel(
      sampleWorktree({
        trackedChanges: 1,
        untrackedFiles: 2,
        ignoredFiles: 3,
      }),
    );
    expect(
      screen.getByText("1 tracked · 2 untracked · 3 ignored"),
    ).toBeInTheDocument();
  });

  it("removes an ignored-only worktree without force", async () => {
    const user = userEvent.setup();
    const ignored = sampleWorktree({
      id: "wt-ignored",
      name: "feat-ignored",
      ignoredFiles: 2,
    });
    previewMock.mockResolvedValueOnce({
      worktree: ignored,
      allowed: true,
      requiresForce: false,
      blockers: [],
    });
    removeMock.mockResolvedValueOnce({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [],
    });

    renderPanel(ignored);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    const region = await screen.findByRole("region", {
      name: "Remove worktree",
    });
    expect(
      within(region).getByText(
        /2 ignored local files will be deleted with this worktree/,
      ),
    ).toBeTruthy();
    expect(
      within(region).queryByRole("button", { name: "Force remove" }),
    ).toBeNull();

    await user.click(
      within(region).getByRole("button", { name: "Remove worktree" }),
    );
    expect(removeMock).toHaveBeenCalledWith("wt-ignored", false);
  });

  it("force-removes a worktree that has true untracked files", async () => {
    const user = userEvent.setup();
    const untracked = sampleWorktree({
      id: "wt-untracked",
      name: "feat-untracked",
      untrackedFiles: 1,
    });
    previewMock.mockResolvedValueOnce({
      worktree: untracked,
      allowed: false,
      requiresForce: true,
      blockers: ["untracked"],
    });
    removeMock.mockResolvedValueOnce({
      removed: true,
      requiresForce: false,
      blockers: [],
      worktrees: [],
    });

    renderPanel(untracked);
    await user.click(screen.getByRole("button", { name: "Remove worktree" }));

    const region = await screen.findByRole("region", {
      name: "Remove worktree",
    });
    expect(within(region).getByText(/Blocked: untracked/)).toBeTruthy();
    expect(
      within(region).queryByRole("button", { name: "Remove worktree" }),
    ).toBeNull();

    await user.click(
      within(region).getByRole("button", { name: "Force remove" }),
    );
    expect(removeMock).toHaveBeenCalledWith("wt-untracked", true);
  });
});
