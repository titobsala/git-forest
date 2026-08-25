import { invokeCommand } from "./tauri";
import type {
  AgentAvailability,
  AgentDefinitionId,
  AgentLaunchResult,
  AgentSession,
  WorktreeId,
} from "../types/forest";

export async function detectAgents(): Promise<AgentAvailability[]> {
  return invokeCommand<AgentAvailability[]>("detect_agents");
}

export async function launchAgent(
  worktreeId: WorktreeId,
  agentDefinitionId?: AgentDefinitionId,
): Promise<AgentLaunchResult> {
  return invokeCommand<AgentLaunchResult>("launch_agent", {
    worktreeId,
    agentDefinitionId: agentDefinitionId ?? null,
  });
}

export async function listAgentSessions(): Promise<AgentSession[]> {
  return invokeCommand<AgentSession[]>("list_agent_sessions");
}
