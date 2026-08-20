use std::sync::Mutex;

use tauri::Manager;

use commands::app_info::get_app_info;
use commands::forest::{get_forest_state, update_forest_configuration};
use commands::repositories::{list_repositories, register_repository};
use forest::ForestService;
use persistence::Database;
use platform::PlatformPaths;

mod commands;
mod domain;
mod forest;
mod persistence;
mod platform;

pub struct AppState {
    pub forest: Mutex<ForestService>,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let platform = PlatformPaths::from_app(app)?;
            let database = Database::open(&platform.database_path())?;
            let forest = ForestService::initialize(database, platform)?;
            app.manage(AppState {
                forest: Mutex::new(forest),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_forest_state,
            update_forest_configuration,
            list_repositories,
            register_repository
        ])
        .run(tauri::generate_context!())
        .expect("error while running Git Forest");
}
