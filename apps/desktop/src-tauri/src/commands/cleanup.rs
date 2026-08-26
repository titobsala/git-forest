use tauri::State;

use super::with_forest;
use crate::domain::{CleanupPreview, CleanupRequest, CleanupResult, CommandError};
use crate::AppState;

#[tauri::command]
pub fn preview_cleanup(state: State<'_, AppState>) -> Result<CleanupPreview, CommandError> {
    with_forest(&state, |forest| forest.preview_cleanup())
}

#[tauri::command]
pub fn run_cleanup(
    state: State<'_, AppState>,
    request: CleanupRequest,
) -> Result<CleanupResult, CommandError> {
    with_forest(&state, |forest| forest.run_cleanup(request))
}
