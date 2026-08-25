import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import { QuickLaunch } from "./QuickLaunch";
import { buildCommands, type CommandActions } from "./commands";
import type { ActionContext } from "./actions";

const repository = sampleRepository({ name: "EXOG App" });
const worktree = sampleWorktree();

function setup(overrides: { actions?: Partial<CommandActions> } = {}) {
  const actions: CommandActions = {
    setView: vi.fn(),
    toggleRepositories: vi.fn(),
    toggleInspector: vi.fn(),
    selectTheme: vi.fn(),
    newWorktree: vi.fn(),
    refreshRepository: vi.fn(),
    openSettings: vi.fn(),
    revealInspector: vi.fn(),
    openTerminal: vi.fn(),
    launchAgent: vi.fn(),
    ...overrides.actions,
  };

  const actionContext: ActionContext = {
    reveal: vi.fn(),
    newWorktree: vi.fn(),
    refreshRepository: vi.fn(),
    copyPath: vi.fn(),
    removeWorktree: vi.fn(),
    removeRepository: vi.fn(),
    openTerminal: vi.fn(),
    launchAgent: vi.fn(),
    canCopy: true,
  };

  const onClose = vi.fn();
  const onOpenRepository = vi.fn();
  const onOpenWorktreeInTerminal = vi.fn();

  render(
    <QuickLaunch
      open
      onClose={onClose}
      repositories={[repository]}
      worktrees={[{ repository, worktree }]}
      commands={buildCommands({
        view: "cockpit",
        theme: "system",
        selectedRepository: repository,
        selectedWorktree: worktree,
        repositoriesCollapsed: false,
        inspectorCollapsed: false,
        actions,
      })}
      actionContext={actionContext}
      onOpenRepository={onOpenRepository}
      onOpenWorktreeInTerminal={onOpenWorktreeInTerminal}
    />,
  );

  return {
    actions,
    actionContext,
    onClose,
    onOpenRepository,
    onOpenWorktreeInTerminal,
  };
}

describe("QuickLaunch", () => {
  it("groups commands above repositories and worktrees", () => {
    setup();

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("Repositories & worktrees")).toBeInTheDocument();
  });

  it("moves the selection across the section boundary", async () => {
    const user = userEvent.setup();
    setup();

    const options = screen.getAllByRole("option");
    const firstPlace = options.findIndex((option) =>
      option.textContent?.includes("repo"),
    );
    expect(firstPlace).toBeGreaterThan(0);

    await user.keyboard("{ArrowDown}".repeat(firstPlace));

    expect(screen.getAllByRole("option")[firstPlace]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs a command and closes", async () => {
    const user = userEvent.setup();
    const { actions, onClose } = setup();

    await user.keyboard("settings");
    await user.keyboard("{Enter}");

    expect(actions.setView).toHaveBeenCalledWith("settings");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("launches the selected worktree's agent from a command", async () => {
    const user = userEvent.setup();
    const { actions, onClose } = setup();

    await user.keyboard("launch agent");
    await user.keyboard("{Enter}");

    expect(actions.launchAgent).toHaveBeenCalledWith(worktree);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the action submenu for the highlighted worktree on Tab", async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard("risk-483");
    await user.keyboard("{Tab}");

    expect(
      screen.getByRole("listbox", { name: "Actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Copy path")).toBeInTheDocument();
    expect(screen.getByText("Remove worktree…")).toBeInTheDocument();
  });

  it("runs a submenu action against the item it was opened from", async () => {
    const user = userEvent.setup();
    const { actionContext, onClose } = setup();

    await user.keyboard("risk-483");
    await user.keyboard("{Tab}");
    await user.keyboard("copy");
    await user.keyboard("{Enter}");

    expect(actionContext.copyPath).toHaveBeenCalledWith(worktree.path);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores the previous query when the submenu is dismissed", async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard("risk-483");
    await user.keyboard("{Tab}");
    expect(screen.getByRole("combobox")).toHaveValue("");

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.getByRole("combobox")).toHaveValue("risk-483");
    expect(
      screen.getByRole("listbox", { name: "Results" }),
    ).toBeInTheDocument();
  });

  it("lets the submenu consume the first Escape without closing the overlay", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.keyboard("risk-483");
    await user.keyboard("{Tab}");

    // App handles `overlay.close` on a window listener, so the submenu must
    // stop the Escape reaching it. Attached only now, so the keystrokes that
    // opened the submenu are not counted.
    const windowListener = vi.fn();
    window.addEventListener("keydown", windowListener);

    await user.keyboard("{Escape}");

    expect(windowListener).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("listbox", { name: "Results" }),
    ).toBeInTheDocument();

    window.removeEventListener("keydown", windowListener);
  });

  it("does not trap Tab on a command row", async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard("settings");
    await user.keyboard("{Tab}");

    expect(
      screen.getByRole("listbox", { name: "Results" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("opens the selected worktree in the terminal on Enter", async () => {
    const user = userEvent.setup();
    const { onOpenWorktreeInTerminal, onOpenRepository, onClose } = setup();

    await user.keyboard("risk-483");
    await user.keyboard("{Enter}");

    expect(onOpenWorktreeInTerminal).toHaveBeenCalledWith(worktree, repository);
    expect(onOpenRepository).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reveals the selected repository in the cockpit on Enter", async () => {
    const user = userEvent.setup();
    const { onOpenRepository, onOpenWorktreeInTerminal, onClose } = setup();

    await user.keyboard("tmp/exog-app");
    await user.keyboard("{Enter}");

    expect(onOpenRepository).toHaveBeenCalledWith(repository);
    expect(onOpenWorktreeInTerminal).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
