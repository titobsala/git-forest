use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::agent::AgentSessionStatus;
use super::error::CommandError;
use super::forest::ForestState;
use super::ids::{AgentSessionId, RepositoryId, WorktreeId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRequest {
    pub prune_git_worktrees: bool,
    pub remove_forest_metadata: bool,
    pub remove_warp_configs: bool,
    pub remove_finished_sessions: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupWorktreeCandidate {
    pub repository_id: RepositoryId,
    pub worktree_id: Option<WorktreeId>,
    pub name: String,
    pub path: PathBuf,
    pub reason: String,
    pub session_record_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupWarpConfigCandidate {
    pub file_name: String,
    pub age_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSessionCandidate {
    pub id: AgentSessionId,
    pub worktree_id: WorktreeId,
    pub status: AgentSessionStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CleanupCategory {
    GitWorktrees,
    ForestMetadata,
    WarpConfigs,
    FinishedSessions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSourceError {
    pub category: CleanupCategory,
    pub repository_id: Option<RepositoryId>,
    pub error: CommandError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreview {
    pub prunable_git_worktrees: Vec<CleanupWorktreeCandidate>,
    pub stale_forest_worktrees: Vec<CleanupWorktreeCandidate>,
    pub stale_warp_configs: Vec<CleanupWarpConfigCandidate>,
    pub finished_sessions: Vec<CleanupSessionCandidate>,
    pub blocked_forest_worktrees: Vec<CleanupWorktreeCandidate>,
    pub source_errors: Vec<CleanupSourceError>,
}

impl CleanupPreview {
    pub fn empty() -> Self {
        Self {
            prunable_git_worktrees: Vec::new(),
            stale_forest_worktrees: Vec::new(),
            stale_warp_configs: Vec::new(),
            finished_sessions: Vec::new(),
            blocked_forest_worktrees: Vec::new(),
            source_errors: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupOperationResult {
    pub category: CleanupCategory,
    pub removed: u32,
    pub error: Option<CommandError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub operations: Vec<CleanupOperationResult>,
    pub preview: CleanupPreview,
    pub state: ForestState,
}

#[cfg(test)]
mod tests {
    use super::{
        CleanupCategory, CleanupPreview, CleanupRequest, CleanupSessionCandidate,
        CleanupSourceError, CleanupWarpConfigCandidate, CleanupWorktreeCandidate,
    };
    use crate::domain::{
        AgentSessionId, AgentSessionStatus, CommandError, RepositoryId, WorktreeId,
    };
    use std::path::PathBuf;

    #[test]
    fn cleanup_models_serialize_camel_case_with_snake_case_enums() {
        let preview = CleanupPreview {
            prunable_git_worktrees: vec![CleanupWorktreeCandidate {
                repository_id: RepositoryId::from_string("repo-1"),
                worktree_id: Some(WorktreeId::from_string("wt-1")),
                name: "feat-gone".into(),
                path: PathBuf::from("/tmp/feat-gone"),
                reason: "prunable".into(),
                session_record_count: 1,
            }],
            stale_forest_worktrees: Vec::new(),
            stale_warp_configs: vec![CleanupWarpConfigCandidate {
                file_name: "git-forest-old.toml".into(),
                age_seconds: 120,
            }],
            finished_sessions: vec![CleanupSessionCandidate {
                id: AgentSessionId::from_string("session-1"),
                worktree_id: WorktreeId::from_string("wt-1"),
                status: AgentSessionStatus::Exited,
            }],
            blocked_forest_worktrees: Vec::new(),
            source_errors: vec![CleanupSourceError {
                category: CleanupCategory::GitWorktrees,
                repository_id: Some(RepositoryId::from_string("repo-2")),
                error: CommandError {
                    code: "git_command_failed".into(),
                    message: "git worktree list failed".into(),
                },
            }],
        };

        let json = serde_json::to_value(&preview).expect("serialize");
        assert_eq!(json["prunableGitWorktrees"][0]["worktreeId"], "wt-1");
        assert_eq!(
            json["staleWarpConfigs"][0]["fileName"],
            "git-forest-old.toml"
        );
        assert_eq!(json["finishedSessions"][0]["status"], "exited");
        assert_eq!(json["sourceErrors"][0]["category"], "git_worktrees");
        assert_eq!(
            json["sourceErrors"][0]["error"]["code"],
            "git_command_failed"
        );

        let request = CleanupRequest {
            prune_git_worktrees: true,
            remove_forest_metadata: false,
            remove_warp_configs: true,
            remove_finished_sessions: true,
        };
        let request_json = serde_json::to_value(&request).expect("serialize request");
        assert_eq!(request_json["pruneGitWorktrees"], true);
        assert_eq!(request_json["removeForestMetadata"], false);
    }
}
