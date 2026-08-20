use tauri::State;

use super::with_forest;
use crate::domain::{CommandError, ForestConfiguration, ForestState};
use crate::AppState;

#[tauri::command]
pub fn get_forest_state(state: State<'_, AppState>) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| forest.state())
}

#[tauri::command]
pub fn update_forest_configuration(
    state: State<'_, AppState>,
    configuration: ForestConfiguration,
) -> Result<ForestState, CommandError> {
    with_forest(&state, |forest| forest.update_configuration(configuration))
}
