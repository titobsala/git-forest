import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import {
  FALLBACK_FOREST_STATE,
  sampleRepository,
  sampleWorktree,
} from "../../types/forest";
import {
  createWorktree,
  fetchBranchCatalog,
  listBranchCatalog,
  previewCreateWorktree,
} from "../../lib/worktrees";
import { detectAgents, launchAgent } from "../../lib/agents";

vi.mock("../../lib/worktrees", () => ({
  createWorktree: vi.fn(),
  fetchBranchCatalog: vi.fn(),
  listBranchCatalog: vi.fn(),
  previewCreateWorktree: vi.fn(),
}));

vi.mock("../../lib/agents", () => ({
  detectAgents: vi.fn(),
  launchAgent: vi.fn(),
}));

const listMock = vi.mocked(listBranchCatalog);
const fetchMock = vi.mocked(fetchBranchCatalog);
const previewMock = vi.mocked(previewCreateWorktree);
const createMock = vi.mocked(createWorktree);
const detectMock = vi.mocked(detectAgents);
const launchMock = vi.mocked(launchAgent);

const repository = sampleRepository();
const created = sampleWorktree();
const agents = FALLBACK_FOREST_STATE.agentDefinitions;

function renderDialog(
  overrides: {
    onCreated?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
    onAgentLaunched?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onCreated = overrides.onCreated ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onAgentLaunched = overrides.onAgentLaunched ?? vi.fn();
  render(
    <CreateWorktreeDialog
      repository={repository}
      agentDefinitions={agents}
      defaultAgentId="codex"
      onClose={onClose}
      onCreated={onCreated}
      onAgentLaunched={onAgentLaunched}
    />,
  );
  return { onCreated, onClose, onAgentLaunched };
}

describe("CreateWorktreeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }, { name: "develop" }],
      remoteBranches: [],
    });
    fetchMock.mockResolvedValue({
      localBranches: [{ name: "main" }, { name: "develop" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/example",
          reference: "refs/remotes/origin/feat/example",
        },
        {
          remote: "origin",
          name: "main",
          reference: "refs/remotes/origin/main",
        },
      ],
    });
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [],
    });
    detectMock.mockResolvedValue([
      { id: "codex", name: "Codex", command: "codex", installed: true },
      {
        id: "claude",
        name: "Claude Code",
        command: "claude",
        installed: false,
      },
    ]);
    launchMock.mockResolvedValue({
      provider: "warp",
      agentId: "codex",
      command: "codex",
      lastUsedAt: "2026-08-25T10:00:00Z",
      sessionId: "session-1",
    });
  });

  it("creates a worktree from the filled form", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [], failures: [] },
    });
    const { onCreated, onClose } = renderDialog();

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    expect(
      await screen.findByText(
        "Destination: /tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      ),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("After creation"), "");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(createMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseRef: "main",
      branch: "feat/demo",
      name: undefined,
      copyLocalEnvFiles: false,
    });
    expect(onCreated).toHaveBeenCalledWith([created], created);
    expect(launchMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults to the detected default agent and launches after create", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [], failures: [] },
    });
    const { onCreated, onAgentLaunched, onClose } = renderDialog();

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    const after = await screen.findByLabelText("After creation");
    await user.selectOptions(after, "codex");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(onCreated).toHaveBeenCalledWith([created], created);
    expect(launchMock).toHaveBeenCalledWith("wt-1", "codex");
    expect(onAgentLaunched).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps unavailable agents visible and disabled", async () => {
    renderDialog();

    const after = await screen.findByLabelText("After creation");
    const claude = within(after).getByRole("option", {
      name: "Claude Code (Missing)",
    });
    expect(claude).toBeDisabled();
    expect(claude).toHaveAttribute("value", "claude");
  });

  it("shows a structured create failure without closing", async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce({
      code: "branch_already_exists",
      message: "branch already exists: feat/demo",
    });
    const { onCreated, onClose } = renderDialog();

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await user.selectOptions(screen.getByLabelText("After creation"), "");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "branch already exists: feat/demo",
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps one created worktree when launch fails and retries only launch", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [], failures: [] },
    });
    launchMock.mockRejectedValueOnce({
      code: "agent_unavailable",
      message: "Codex is not available",
    });
    const { onCreated, onClose, onAgentLaunched } = renderDialog();

    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await user.selectOptions(
      await screen.findByLabelText("After creation"),
      "codex",
    );
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Worktree created, but Codex did not launch",
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("New branch")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Create worktree" }),
    ).not.toBeInTheDocument();

    launchMock.mockResolvedValueOnce({
      provider: "warp",
      agentId: "codex",
      command: "codex",
      lastUsedAt: "2026-08-25T10:00:00Z",
      sessionId: "session-1",
    });
    await user.click(screen.getByRole("button", { name: "Retry launch" }));

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(launchMock).toHaveBeenLastCalledWith("wt-1", "codex");
    expect(onAgentLaunched).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape and restores the trigger focus", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "New worktree";
    document.body.appendChild(trigger);
    trigger.focus();

    function Harness() {
      const [open, setOpen] = useState(true);
      if (!open) {
        return null;
      }
      return (
        <CreateWorktreeDialog
          repository={repository}
          agentDefinitions={agents}
          defaultAgentId="codex"
          onClose={() => setOpen(false)}
          onCreated={vi.fn()}
        />
      );
    }

    render(<Harness />);
    await screen.findByRole("dialog", { name: /Create worktree/ });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Create worktree/ }),
      ).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("hides the environment copy checkbox when no candidates exist", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await screen.findByText(
      "Destination: /tmp/forest/worktrees/exog-app-repo-1/feat-demo",
    );
    expect(
      screen.queryByLabelText("Copy local environment files"),
    ).not.toBeInTheDocument();
  });

  it("does not preview again when the copy checkbox is toggled", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [{ path: ".env", sizeBytes: 12 }],
    });
    renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    const checkbox = await screen.findByLabelText(
      "Copy local environment files",
    );
    const previewCalls = previewMock.mock.calls.length;
    expect(previewCalls).toBeGreaterThan(0);
    expect(
      previewMock.mock.calls.every(
        (call) => call[0].copyLocalEnvFiles === false,
      ),
    ).toBe(true);
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(previewMock).toHaveBeenCalledTimes(previewCalls);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults the environment copy checkbox on and sends true", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [
        { path: ".env", sizeBytes: 12 },
        { path: ".env.local", sizeBytes: 8 },
      ],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [".env", ".env.local"], failures: [] },
    });
    renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    const checkbox = await screen.findByLabelText(
      "Copy local environment files",
    );
    expect(checkbox).toBeChecked();
    expect(screen.getByText(".env")).toBeInTheDocument();
    expect(screen.getByText(".env.local")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("After creation"), "");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));
    expect(createMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseRef: "main",
      branch: "feat/demo",
      name: undefined,
      copyLocalEnvFiles: true,
    });
  });

  it("keeps a manual opt-out across preview refresh", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [{ path: ".env", sizeBytes: 12 }],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [], failures: [] },
    });
    renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    const checkbox = await screen.findByLabelText(
      "Copy local environment files",
    );
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await user.type(
      screen.getByLabelText("Directory name (optional)"),
      "custom",
    );
    await screen.findByText(
      "Destination: /tmp/forest/worktrees/exog-app-repo-1/feat-demo",
    );
    expect(
      screen.getByLabelText("Copy local environment files"),
    ).not.toBeChecked();
    await user.selectOptions(screen.getByLabelText("After creation"), "");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));
    expect(createMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseRef: "main",
      branch: "feat/demo",
      name: "custom",
      copyLocalEnvFiles: false,
    });
  });

  it("launches the selected agent after a successful copy", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [{ path: ".env", sizeBytes: 12 }],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [".env"], failures: [] },
    });
    const { onCreated, onAgentLaunched, onClose } = renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await screen.findByLabelText("Copy local environment files");
    await user.selectOptions(
      await screen.findByLabelText("After creation"),
      "codex",
    );
    await user.click(screen.getByRole("button", { name: "Create worktree" }));
    expect(onCreated).toHaveBeenCalledWith([created], created);
    expect(launchMock).toHaveBeenCalledWith("wt-1", "codex");
    expect(onAgentLaunched).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the created worktree on copy failure and launches only when asked", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [{ path: ".env", sizeBytes: 12 }],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: {
        copied: [],
        failures: [
          {
            path: ".env",
            error: { code: "io", message: "failed to read source" },
          },
        ],
      },
    });
    const { onCreated, onClose, onAgentLaunched } = renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await screen.findByLabelText("Copy local environment files");
    await user.selectOptions(
      await screen.findByLabelText("After creation"),
      "codex",
    );
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Worktree created, but local environment files did not copy",
    );
    expect(screen.getByText(".env: failed to read source")).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(launchMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Create worktree" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Launch anyway" }));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledWith("wt-1", "codex");
    expect(onAgentLaunched).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps copy failure details when launch anyway fails and retries only launch", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      destination: "/tmp/forest/worktrees/exog-app-repo-1/feat-demo",
      repositorySlug: "exog-app-repo-1",
      worktreeSlug: "feat-demo",
      localEnvFiles: [{ path: ".env", sizeBytes: 12 }],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: {
        copied: [".env.local"],
        failures: [
          {
            path: ".env",
            error: { code: "io", message: "failed to read source" },
          },
        ],
      },
    });
    launchMock.mockRejectedValueOnce({
      code: "agent_unavailable",
      message: "Codex is not available",
    });
    const { onCreated, onClose, onAgentLaunched } = renderDialog();
    await user.type(screen.getByLabelText("New branch"), "feat/demo");
    await screen.findByLabelText("Copy local environment files");
    await user.selectOptions(
      await screen.findByLabelText("After creation"),
      "codex",
    );
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(
      await screen.findByText(
        "Worktree created, but local environment files did not copy",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Copied: .env.local")).toBeInTheDocument();
    expect(screen.getByText(".env: failed to read source")).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(launchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Launch anyway" }));

    expect(
      await screen.findByText(/Worktree created, but Codex did not launch/),
    ).toHaveTextContent("Codex is not available");
    expect(
      screen.getByText(
        "Worktree created, but local environment files did not copy",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Copied: .env.local")).toBeInTheDocument();
    expect(screen.getByText(".env: failed to read source")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Launch anyway" }),
    ).not.toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledWith("wt-1", "codex");
    expect(onClose).not.toHaveBeenCalled();
    expect(onAgentLaunched).not.toHaveBeenCalled();

    launchMock.mockResolvedValueOnce({
      provider: "warp",
      agentId: "codex",
      command: "codex",
      lastUsedAt: "2026-08-25T10:00:00Z",
      sessionId: "session-1",
    });
    await user.click(screen.getByRole("button", { name: "Retry launch" }));

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(launchMock).toHaveBeenLastCalledWith("wt-1", "codex");
    expect(onAgentLaunched).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("loads the cached catalog on open without fetching remotes", async () => {
    renderDialog();
    expect(
      await screen.findByRole("option", { name: "main" }),
    ).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith("repo-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders local and remote optgroups", async () => {
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }, { name: "develop" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/example",
          reference: "refs/remotes/origin/feat/example",
        },
      ],
    });
    renderDialog();
    expect(
      await screen.findByRole("group", { name: "Local branches" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Remote branches" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "main" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "origin/feat/example" }),
    ).toHaveValue("refs/remotes/origin/feat/example");
  });

  it("fetches remotes and replaces the catalog options", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("option", { name: "main" });
    expect(
      screen.queryByRole("option", { name: "origin/feat/example" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fetch remotes" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("repo-1");
    expect(
      await screen.findByRole("option", { name: "origin/feat/example" }),
    ).toBeInTheDocument();
  });

  it("keeps cached options when fetch fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce({
      code: "git_command_failed",
      message: "could not fetch remotes",
    });
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }, { name: "develop" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/cached",
          reference: "refs/remotes/origin/feat/cached",
        },
      ],
    });
    const { onClose } = renderDialog();
    expect(
      await screen.findByRole("option", { name: "origin/feat/cached" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fetch remotes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not fetch remotes",
    );
    expect(
      screen.getByRole("option", { name: "origin/feat/cached" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits the full remote ref to preview and create", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/example",
          reference: "refs/remotes/origin/feat/example",
        },
      ],
    });
    createMock.mockResolvedValueOnce({
      worktree: created,
      worktrees: [created],
      localEnvCopy: { copied: [], failures: [] },
    });
    renderDialog();
    const base = await screen.findByLabelText("Base ref");
    await user.selectOptions(base, "refs/remotes/origin/feat/example");
    await user.selectOptions(screen.getByLabelText("After creation"), "");
    await user.click(screen.getByRole("button", { name: "Create worktree" }));

    expect(previewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRef: "refs/remotes/origin/feat/example",
        branch: "feat/example",
      }),
    );
    expect(createMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseRef: "refs/remotes/origin/feat/example",
      branch: "feat/example",
      name: undefined,
      copyLocalEnvFiles: false,
    });
  });

  it("suggests the remote short name until the branch field is edited", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/example",
          reference: "refs/remotes/origin/feat/example",
        },
        {
          remote: "origin",
          name: "feat/other",
          reference: "refs/remotes/origin/feat/other",
        },
      ],
    });
    renderDialog();
    const base = await screen.findByLabelText("Base ref");
    const branchInput = screen.getByLabelText("New branch");
    await user.selectOptions(base, "refs/remotes/origin/feat/example");
    expect(branchInput).toHaveValue("feat/example");
    await user.selectOptions(base, "refs/remotes/origin/feat/other");
    expect(branchInput).toHaveValue("feat/other");
  });

  it("keeps a user-edited branch name across base changes and fetches", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({
      localBranches: [{ name: "main" }],
      remoteBranches: [
        {
          remote: "origin",
          name: "feat/example",
          reference: "refs/remotes/origin/feat/example",
        },
        {
          remote: "origin",
          name: "feat/other",
          reference: "refs/remotes/origin/feat/other",
        },
      ],
    });
    renderDialog();
    const base = await screen.findByLabelText("Base ref");
    const branchInput = screen.getByLabelText("New branch");
    await user.selectOptions(base, "refs/remotes/origin/feat/example");
    expect(branchInput).toHaveValue("feat/example");
    await user.clear(branchInput);
    await user.type(branchInput, "custom/name");
    await user.selectOptions(base, "refs/remotes/origin/feat/other");
    expect(branchInput).toHaveValue("custom/name");
    await user.click(screen.getByRole("button", { name: "Fetch remotes" }));
    await screen.findByRole("option", { name: "origin/feat/example" });
    expect(branchInput).toHaveValue("custom/name");
  });
});
