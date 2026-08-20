use std::path::PathBuf;

use tauri::State;

use super::with_forest;
use crate::domain::{CommandError, ForestState, Repository, RepositoryMode};
use crate::AppState;

#[tauri::command]
pub fn list_repositories(state: State<'_, AppState>) -> Result<Vec<Repository>, CommandError> {
    with_forest(&state, |forest| forest.list_repositories())
}

#[tauri::command]
pub fn register_repository(
    state: State<'_, AppState>,
    name: String,
    path: PathBuf,
    mode: RepositoryMode,
) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| {
        forest.register_repository(name, path, mode)
    })
}
