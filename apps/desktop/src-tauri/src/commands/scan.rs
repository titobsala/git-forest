use std::path::PathBuf;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, State};

use crate::domain::{
    CommandError, ForestError, ScanCandidate, ScanCompletedPayload, ScanProgressPayload,
};
use crate::git::{default_ignore_names, discover_repositories, DEFAULT_SCAN_DEPTH, MAX_SCAN_DEPTH};
use crate::AppState;

pub const SCAN_PROGRESS_EVENT: &str = "repository-scan-progress";
pub const SCAN_COMPLETE_EVENT: &str = "repository-scan-complete";

#[tauri::command]
pub fn start_repository_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    root: PathBuf,
    max_depth: Option<u32>,
) -> Result<String, CommandError> {
    let max_depth = max_depth.unwrap_or(DEFAULT_SCAN_DEPTH);
    if max_depth > MAX_SCAN_DEPTH {
        return Err(ForestError::InvalidScanDepth.into());
    }

    let (root, indexed, git) = {
        let forest = state
            .forest
            .lock()
            .map_err(|_| ForestError::MutexPoisoned)?;
        (
            forest.expand_user_path(root),
            forest.indexed_paths()?,
            forest.git_runner(),
        )
    };

    let scans = state.scans.clone();
    let (scan_id, cancel) = scans.begin()?;
    let progress_id = scan_id.clone();
    let complete_id = scan_id.clone();
    let app_progress = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let ignore = default_ignore_names();
        let discovery = discover_repositories(
            &git,
            &root,
            max_depth,
            &ignore,
            || cancel.load(Ordering::SeqCst),
            |progress| {
                let _ = app_progress.emit(
                    SCAN_PROGRESS_EVENT,
                    ScanProgressPayload {
                        scan_id: progress_id.clone(),
                        directories_visited: progress.directories_visited,
                        candidates_found: progress.candidates_found,
                        current_path: Some(progress.current_path.clone()),
                        warnings: progress.warnings.clone(),
                        cancelled: false,
                    },
                );
            },
        );

        let payload = match discovery {
            Ok(result) => ScanCompletedPayload {
                scan_id: complete_id.clone(),
                directories_visited: result.directories_visited,
                candidates: result
                    .candidates
                    .into_iter()
                    .map(|candidate| ScanCandidate {
                        already_indexed: indexed.iter().any(|path| path == &candidate.path),
                        path: candidate.path,
                        name: candidate.name,
                        primary_branch: candidate.primary_branch,
                        remote_url: candidate.remote_url,
                    })
                    .collect(),
                warnings: result.warnings,
                cancelled: result.cancelled,
            },
            Err(error) => ScanCompletedPayload {
                scan_id: complete_id.clone(),
                directories_visited: 0,
                candidates: Vec::new(),
                warnings: vec![error.to_string()],
                cancelled: cancel.load(Ordering::SeqCst),
            },
        };
        scans.finish(&complete_id);
        let _ = app.emit(SCAN_COMPLETE_EVENT, payload);
    });

    Ok(scan_id)
}

#[tauri::command]
pub fn cancel_repository_scan(
    state: State<'_, AppState>,
    scan_id: String,
) -> Result<(), CommandError> {
    state.scans.cancel(&scan_id).map_err(CommandError::from)
}
