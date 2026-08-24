import { describe, expect, it, vi } from "vitest";
import { sampleRepository, sampleWorktree } from "../../types/forest";
import {
  buildCommands,
  filterCommands,
  type CommandActions,
  type CommandContext,
} from "./commands";

function actionSpies(): CommandActions {
  return {
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
  };
}

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    view: "cockpit",
    theme: "system",
    selectedRepository: null,
    selectedWorktree: null,
    repositoriesCollapsed: false,
    inspectorCollapsed: false,
    actions: actionSpies(),
    ...overrides,
  };
}

function byId(commands: ReturnType<typeof buildCommands>, id: string) {
  return commands.find((command) => command.id === id);
}

describe("buildCommands", () => {
  it("disables selection commands and says what is missing", () => {
    const commands = buildCommands(context());

    expect(byId(commands, "worktree.new")?.disabledReason).toBe(
      "Select a repository first",
    );
    expect(byId(commands, "repository.remove")?.disabledReason).toBe(
      "Select a repository first",
    );
    expect(byId(commands, "worktree.remove")?.disabledReason).toBe(
      "Select a worktree first",
    );
  });

  it("names the target in the subtitle once something is selected", () => {
    const commands = buildCommands(
      context({ selectedRepository: sampleRepository({ name: "EXOG App" }) }),
    );

    const command = byId(commands, "worktree.new");
    expect(command?.disabledReason).toBeUndefined();
    expect(command?.subtitle).toBe("EXOG App");
  });

  it("opens the selected worktree in the terminal", () => {
    const actions = actionSpies();
    const worktree = sampleWorktree();
    const commands = buildCommands(
      context({ selectedWorktree: worktree, actions }),
    );

    expect(byId(commands, "worktree.terminal")?.disabledReason).toBeUndefined();
    byId(commands, "worktree.terminal")?.run();
    expect(actions.openTerminal).toHaveBeenCalledWith(worktree);
  });

  it("launches the configured agent in the selected worktree", () => {
    const actions = actionSpies();
    const worktree = sampleWorktree();
    const commands = buildCommands(
      context({ selectedWorktree: worktree, actions }),
    );

    expect(byId(commands, "worktree.agent")?.disabledReason).toBeUndefined();
    byId(commands, "worktree.agent")?.run();
    expect(actions.launchAgent).toHaveBeenCalledWith(worktree);
  });

  it("marks the theme already in effect as current", () => {
    const commands = buildCommands(context({ theme: "dark" }));

    expect(byId(commands, "theme.dark")?.current).toBe(true);
    expect(byId(commands, "theme.light")?.current).toBe(false);
  });

  it("names panel commands after the action they will take", () => {
    expect(byId(buildCommands(context()), "panel.repositories")?.title).toBe(
      "Collapse repositories sidebar",
    );
    expect(
      byId(
        buildCommands(context({ repositoriesCollapsed: true })),
        "panel.repositories",
      )?.title,
    ).toBe("Expand repositories sidebar");
  });

  it("routes removal to a confirmation surface rather than removing", () => {
    const actions = actionSpies();
    const commands = buildCommands(
      context({ selectedWorktree: sampleWorktree(), actions }),
    );

    byId(commands, "worktree.remove")?.run();

    expect(actions.revealInspector).toHaveBeenCalledOnce();
  });

  it("refreshes the selected repository", () => {
    const actions = actionSpies();
    const repository = sampleRepository();
    const commands = buildCommands(
      context({ selectedRepository: repository, actions }),
    );

    byId(commands, "repository.refresh")?.run();

    expect(actions.refreshRepository).toHaveBeenCalledWith(repository);
  });
});

describe("filterCommands", () => {
  const commands = buildCommands(
    context({ selectedWorktree: sampleWorktree() }),
  );

  it("shows only runnable commands before anything is typed", () => {
    const shown = filterCommands(commands, "");

    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(7);
    expect(shown.every((command) => command.disabledReason === undefined)).toBe(
      true,
    );
  });

  it("matches on hidden keywords as well as the title", () => {
    const shown = filterCommands(commands, "preferences");

    expect(shown[0]?.id).toBe("view.settings");
  });

  it("ranks an available agent command among the matches", () => {
    const shown = filterCommands(commands, "codex");

    expect(shown[0]?.id).toBe("worktree.agent");
    expect(shown[0]?.disabledReason).toBeUndefined();
  });

  it("ranks an available terminal command among the matches", () => {
    const shown = filterCommands(commands, "terminal");

    expect(shown[0]?.id).toBe("worktree.terminal");
    expect(shown[0]?.disabledReason).toBeUndefined();
  });

  it("returns nothing when there is no match", () => {
    expect(filterCommands(commands, "zzzz")).toEqual([]);
  });
});
