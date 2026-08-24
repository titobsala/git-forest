import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationPanel } from "./ConfigurationPanel";
import { FALLBACK_FOREST_STATE } from "../types/forest";
import { detectAgents } from "../lib/agents";

vi.mock("../lib/agents", () => ({
  detectAgents: vi.fn(),
}));

const state = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 2,
};

describe("ConfigurationPanel", () => {
  beforeEach(() => {
    vi.mocked(detectAgents).mockResolvedValue([]);
  });

  it("saves configuration from the form", () => {
    const onSave = vi.fn();
    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={onSave}
        onSelectTheme={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/moved-forest" },
    });
    fireEvent.change(screen.getByLabelText("Default agent"), {
      target: { value: "claude" },
    });
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSave).toHaveBeenCalledWith({
      ...FALLBACK_FOREST_STATE.configuration,
      forestRoot: "/tmp/moved-forest",
      defaultAgentId: "claude",
      theme: "dark",
    });
  });

  it("applies a theme as soon as it is picked, without waiting for save", () => {
    const onSave = vi.fn();
    const onSelectTheme = vi.fn();
    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={onSave}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });

    expect(onSelectTheme).toHaveBeenCalledWith("dark");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps unsaved edits when the persisted theme comes back", () => {
    const { rerender } = render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/moved-forest" },
    });
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });

    // App persists the theme on its own and hands back fresh forest state.
    rerender(
      <ConfigurationPanel
        state={{
          ...state,
          configuration: { ...state.configuration, theme: "dark" },
        }}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Forest root path")).toHaveValue(
      "/tmp/moved-forest",
    );
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });

  it("re-seeds the form when the configuration itself changes", () => {
    const { rerender } = render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/abandoned" },
    });

    rerender(
      <ConfigurationPanel
        state={{
          ...state,
          configuration: { ...state.configuration, forestRoot: "/tmp/saved" },
        }}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Forest root path")).toHaveValue("/tmp/saved");
  });

  it("shows installed and missing agent status", async () => {
    vi.mocked(detectAgents).mockResolvedValue([
      {
        id: "codex",
        name: "Codex",
        command: "codex",
        installed: true,
      },
      {
        id: "opencode",
        name: "OpenCode",
        command: "opencode",
        installed: false,
      },
    ]);

    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    const list = await screen.findByRole("list", {
      name: "Agent availability",
    });
    expect(list).toHaveTextContent("Codex — Installed");
    expect(list).toHaveTextContent("OpenCode — Missing");
  });

  it("surfaces a detection failure instead of showing no agents", async () => {
    vi.mocked(detectAgents).mockRejectedValue({
      code: "database_unavailable",
      message: "database is locked",
    });

    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={vi.fn()}
        onSelectTheme={vi.fn()}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Agent detection failed: database is locked",
    );
    expect(
      screen.queryByRole("list", { name: "Agent availability" }),
    ).not.toBeInTheDocument();
  });
});
