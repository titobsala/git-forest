use tauri::State;

use crate::domain::{CommandError, ForestError};
use crate::forest::ForestService;
use crate::AppState;

pub mod agents;
pub mod app_info;
pub mod cleanup;
pub mod forest;
pub mod repositories;
pub mod scan;
pub mod terminals;
pub mod worktrees;

pub(crate) fn with_forest<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&ForestService) -> Result<T, ForestError>,
) -> Result<T, CommandError> {
    let forest = state
        .forest
        .lock()
        .map_err(|_| ForestError::MutexPoisoned)?;
    operation(&forest).map_err(CommandError::from)
}
