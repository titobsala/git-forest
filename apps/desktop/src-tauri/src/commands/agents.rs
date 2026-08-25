use tauri::State;

use super::with_forest;
use crate::domain::{
    AgentAvailability, AgentDefinitionId, AgentLaunchResult, AgentSession, CommandError, WorktreeId,
};
use crate::AppState;

#[tauri::command]
pub fn detect_agents(state: State<'_, AppState>) -> Result<Vec<AgentAvailability>, CommandError> {
    with_forest(&state, |forest| forest.detect_agents())
}

#[tauri::command]
pub fn launch_agent(
    state: State<'_, AppState>,
    worktree_id: WorktreeId,
    agent_definition_id: Option<AgentDefinitionId>,
) -> Result<AgentLaunchResult, CommandError> {
    with_forest(&state, |forest| {
        forest.launch_agent(worktree_id, agent_definition_id)
    })
}

#[tauri::command]
pub fn list_agent_sessions(state: State<'_, AppState>) -> Result<Vec<AgentSession>, CommandError> {
    with_forest(&state, |forest| forest.list_agent_sessions())
}
