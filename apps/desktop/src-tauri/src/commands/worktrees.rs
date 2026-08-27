use tauri::State;

use super::with_forest;
use crate::domain::{
    CommandError, CreateWorktreeInput, CreateWorktreePreview, CreateWorktreeResult,
    RemoveWorktreeResult, RepositoryId, Worktree, WorktreeId, WorktreeRemovalPreview,
};
use crate::git::{BranchCatalog, GitRunner};
use crate::AppState;

#[tauri::command]
pub fn list_worktrees(
    state: State<'_, AppState>,
    repository_id: RepositoryId,
) -> Result<Vec<Worktree>, CommandError> {
    with_forest(&state, |forest| forest.list_worktrees(repository_id))
}

#[tauri::command]
pub fn refresh_worktrees(
    state: State<'_, AppState>,
    repository_id: RepositoryId,
) -> Result<Vec<Worktree>, CommandError> {
    with_forest(&state, |forest| forest.refresh_worktrees(repository_id))
}

#[tauri::command]
pub fn list_branch_catalog(
    state: State<'_, AppState>,
    repository_id: RepositoryId,
) -> Result<BranchCatalog, CommandError> {
    with_forest(&state, |forest| forest.list_branch_catalog(repository_id))
}

#[tauri::command]
pub fn fetch_branch_catalog(
    state: State<'_, AppState>,
    repository_id: RepositoryId,
) -> Result<BranchCatalog, CommandError> {
    // Copy the repository path while holding Forest's shared mutex, then
    // release it before the potentially slow network fetch. Other commands
    // must remain responsive while a remote is slow or unreachable.
    let repository_path = with_forest(&state, |forest| {
        forest.branch_catalog_repository_path(repository_id)
    })?;
    crate::git::refs::fetch_branch_catalog(&GitRunner::new(), &repository_path)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn preview_create_worktree(
    state: State<'_, AppState>,
    input: CreateWorktreeInput,
) -> Result<CreateWorktreePreview, CommandError> {
    with_forest(&state, |forest| forest.preview_create_worktree(input))
}

#[tauri::command]
pub fn create_worktree(
    state: State<'_, AppState>,
    input: CreateWorktreeInput,
) -> Result<CreateWorktreeResult, CommandError> {
    with_forest(&state, |forest| forest.create_worktree(input))
}

#[tauri::command]
pub fn get_worktree_removal_preview(
    state: State<'_, AppState>,
    worktree_id: WorktreeId,
) -> Result<WorktreeRemovalPreview, CommandError> {
    with_forest(&state, |forest| {
        forest.worktree_removal_preview(worktree_id)
    })
}

#[tauri::command]
pub fn remove_worktree(
    state: State<'_, AppState>,
    worktree_id: WorktreeId,
    force: bool,
) -> Result<RemoveWorktreeResult, CommandError> {
    with_forest(&state, |forest| forest.remove_worktree(worktree_id, force))
}
