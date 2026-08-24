use tauri::State;

use super::with_forest;
use crate::domain::{CommandError, TerminalLaunchResult, WorktreeId};
use crate::AppState;

#[tauri::command]
pub fn open_worktree(
    state: State<'_, AppState>,
    worktree_id: WorktreeId,
) -> Result<TerminalLaunchResult, CommandError> {
    with_forest(&state, |forest| forest.open_worktree(worktree_id))
}
