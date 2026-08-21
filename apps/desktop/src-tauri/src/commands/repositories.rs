use std::path::PathBuf;

use tauri::State;

use super::with_forest;
use crate::domain::{
    CommandError, ForestState, ImportRepositoriesResult, Repository, RepositoryId, RepositoryMode,
};
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

#[tauri::command]
pub fn import_repository(
    state: State<'_, AppState>,
    path: PathBuf,
    name: Option<String>,
) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| forest.import_repository(name, path))
}

#[tauri::command]
pub fn import_repositories(
    state: State<'_, AppState>,
    paths: Vec<PathBuf>,
) -> Result<ImportRepositoriesResult, CommandError> {
    with_forest(&state, |forest| forest.import_repositories(paths))
}

#[tauri::command]
pub fn refresh_repository(
    state: State<'_, AppState>,
    id: RepositoryId,
) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| forest.refresh_repository(id))
}

#[tauri::command]
pub fn remove_repository(
    state: State<'_, AppState>,
    id: RepositoryId,
) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| forest.remove_repository(id))
}
