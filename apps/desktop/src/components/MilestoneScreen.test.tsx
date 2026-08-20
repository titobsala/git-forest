import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MilestoneScreen } from "./MilestoneScreen";
import { FALLBACK_FOREST_STATE } from "../types/forest";

const sampleState = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 1,
  repositories: [
    {
      id: "repo-1",
      name: "EXOG App",
      path: "/tmp/exog-app",
      mode: "linked" as const,
      createdAt: "2026-08-20T09:00:00Z",
      updatedAt: "2026-08-20T09:00:00Z",
    },
  ],
};

describe("MilestoneScreen", () => {
  it("renders forest status, configuration, and repository modes", () => {
    render(
      <MilestoneScreen
        state={sampleState}
        error={null}
        busy={false}
        onSaveConfiguration={vi.fn()}
        onRegisterRepository={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Git Forest", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Version 0.0.2")).toBeInTheDocument();
    expect(screen.getByText("Configuration rooted.")).toBeInTheDocument();
    expect(screen.getByText(sampleState.paths.forestRoot)).toBeInTheDocument();
    expect(screen.getByText("EXOG App")).toBeInTheDocument();
    expect(screen.getAllByText("Linked").length).toBeGreaterThan(0);
    expect(screen.getByText("/tmp/exog-app")).toBeInTheDocument();
    expect(screen.getByText("Schema version")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("saves configuration from the form", () => {
    const onSaveConfiguration = vi.fn();

    render(
      <MilestoneScreen
        state={sampleState}
        error={null}
        busy={false}
        onSaveConfiguration={onSaveConfiguration}
        onRegisterRepository={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/moved-forest" },
    });
    fireEvent.change(screen.getByLabelText("Default agent"), {
      target: { value: "claude" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSaveConfiguration).toHaveBeenCalledWith({
      ...sampleState.configuration,
      forestRoot: "/tmp/moved-forest",
      defaultAgentId: "claude",
    });
  });

  it("registers a repository from the form", () => {
    const onRegisterRepository = vi.fn();

    render(
      <MilestoneScreen
        state={sampleState}
        error={null}
        busy={false}
        onSaveConfiguration={vi.fn()}
        onRegisterRepository={onRegisterRepository}
      />,
    );

    fireEvent.change(screen.getByLabelText("Repository name"), {
      target: { value: "Game" },
    });
    fireEvent.change(screen.getByLabelText("Directory path"), {
      target: { value: "/tmp/game" },
    });
    fireEvent.click(screen.getByLabelText("Managed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Register repository" }),
    );

    expect(onRegisterRepository).toHaveBeenCalledWith({
      name: "Game",
      path: "/tmp/game",
      mode: "managed",
    });
  });

  it("shows an error banner", () => {
    render(
      <MilestoneScreen
        state={sampleState}
        error="a repository is already registered at this path"
        busy={false}
        onSaveConfiguration={vi.fn()}
        onRegisterRepository={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "a repository is already registered at this path",
    );
  });
});
