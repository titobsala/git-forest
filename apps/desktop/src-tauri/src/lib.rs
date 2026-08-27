use std::sync::Mutex;

use tauri::Manager;

use commands::agents::{detect_agents, launch_agent, list_agent_sessions};
use commands::app_info::get_app_info;
use commands::cleanup::{preview_cleanup, run_cleanup};
use commands::forest::{get_forest_state, update_forest_configuration};
use commands::repositories::{
    import_repositories, import_repository, list_repositories, reconcile_repositories,
    refresh_repository, register_repository, relocate_repository, remove_repository,
};
use commands::scan::{cancel_repository_scan, start_repository_scan};
use commands::terminals::open_worktree;
use commands::worktrees::{
    create_worktree, fetch_branch_catalog, get_worktree_removal_preview, list_branch_catalog,
    list_worktrees, preview_create_worktree, refresh_worktrees, remove_worktree,
};
use forest::ForestService;
use persistence::Database;
use platform::PlatformPaths;
use scan::ScanCoordinator;

mod agents;
mod commands;
mod domain;
mod forest;
mod git;
mod persistence;
mod platform;
mod processes;
mod scan;
mod terminals;

pub struct AppState {
    pub forest: Mutex<ForestService>,
    pub scans: ScanCoordinator,
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stderr),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("git-forest.log".into()),
                    }),
                ])
                .max_file_size(10 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        );

    #[cfg(desktop)]
    {
        builder = builder.plugin(platform::global_shortcut::plugin());
    }

    builder
        .setup(|app| {
            let platform = PlatformPaths::from_app(app)?;
            let database = Database::open(&platform.database_path())?;
            let forest = ForestService::initialize(database, platform)?;
            log::info!("Git Forest started");
            app.manage(AppState {
                forest: Mutex::new(forest),
                scans: ScanCoordinator::new(),
            });
            #[cfg(desktop)]
            platform::global_shortcut::register(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_forest_state,
            update_forest_configuration,
            list_repositories,
            register_repository,
            import_repository,
            import_repositories,
            refresh_repository,
            reconcile_repositories,
            relocate_repository,
            remove_repository,
            start_repository_scan,
            cancel_repository_scan,
            list_worktrees,
            refresh_worktrees,
            list_branch_catalog,
            fetch_branch_catalog,
            preview_create_worktree,
            create_worktree,
            get_worktree_removal_preview,
            remove_worktree,
            open_worktree,
            detect_agents,
            launch_agent,
            list_agent_sessions,
            preview_cleanup,
            run_cleanup
        ])
        .run(tauri::generate_context!())
        .expect("error while running Git Forest");
}
