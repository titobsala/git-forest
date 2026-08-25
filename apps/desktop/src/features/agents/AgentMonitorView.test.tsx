import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentMonitorView } from "./AgentMonitorView";
import {
  FALLBACK_FOREST_STATE,
  sampleAgentSession,
  sampleRepository,
  sampleWorktree,
} from "../../types/forest";

describe("AgentMonitorView", () => {
  it("lists active and recent sessions with worktree and agent metadata", () => {
    render(
      <AgentMonitorView
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        configuration={FALLBACK_FOREST_STATE.configuration}
        sessions={[
          sampleAgentSession(),
          sampleAgentSession({
            id: "session-2",
            status: "exited",
            pid: null,
            launchedAt: "2026-08-25T09:00:00Z",
          }),
        ]}
        worktrees={[
          {
            repository: sampleRepository(),
            worktree: sampleWorktree(),
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("PID 4242")).toBeInTheDocument();
    expect(screen.getAllByText("EXOG App / feat/risk-483")).toHaveLength(2);
    expect(screen.getByText("exited")).toBeInTheDocument();
  });

  it("explains an empty session list", () => {
    render(
      <AgentMonitorView
        agentDefinitions={FALLBACK_FOREST_STATE.agentDefinitions}
        configuration={FALLBACK_FOREST_STATE.configuration}
        sessions={[]}
        worktrees={[]}
      />,
    );

    expect(screen.getByText(/No agent sessions yet/)).toBeInTheDocument();
  });
});
