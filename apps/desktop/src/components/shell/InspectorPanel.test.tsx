import { act, render, screen, within } from "@testing-library/react";
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
});
