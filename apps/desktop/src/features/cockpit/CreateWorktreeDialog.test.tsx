import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import {
  createWorktree,
  listLocalBranches,
  previewCreateWorktree,
} from "../../lib/worktrees";

vi.mock("../../lib/worktrees", () => ({
  createWorktree: vi.fn(),
  listLocalBranches: vi.fn(),
  previewCreateWorktree: vi.fn(),
}));

const listMock = vi.mocked(listLocalBranches);
const previewMock = vi.mocked(previewCreateWorktree);
const createMock = vi.mocked(createWorktree);

const repository = sampleRepository();
const created = sampleWorktree();

describe("CreateWorktreeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([{ name: "main" }, { name: "develop" }]);
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
    });
  });

  it("creates a worktree from the filled form", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
    });

    render(
      <CreateWorktreeDialog
        repository={repository}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    expect(
      await screen.findByText(
        "Destination: /tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(createMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseRef: "main",
      branch: "feat/demo",
      name: undefined,
    });
    expect(onCreated).toHaveBeenCalledWith([created], created);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a structured create failure without closing", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    createMock.mockRejectedValueOnce({
      code: "branch_already_exists",
      message: "branch already exists: feat/demo",
    });

    render(
      <CreateWorktreeDialog
        repository={repository}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "branch already exists: feat/demo",
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
