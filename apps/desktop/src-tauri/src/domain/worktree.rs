use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::error::CommandError;
use super::ids::{RepositoryId, WorktreeId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemovalBlocker {
    Primary,
    Locked,
    Missing,
    UnknownToGit,
    Dirty,
    Untracked,
    ActiveSession,
    StatusUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: WorktreeId,
    pub repository_id: RepositoryId,
    pub name: String,
    pub path: PathBuf,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub detached: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    pub prunable: bool,
    pub prunable_reason: Option<String>,
    pub present: bool,
    pub git_known: bool,
    pub is_primary: bool,
    pub tracked_changes: u32,
    pub untracked_files: u32,
    pub ignored_files: u32,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub status_error: Option<CommandError>,
}

impl Worktree {
    pub fn is_dirty(&self) -> bool {
        self.tracked_changes > 0 || self.untracked_files > 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeInput {
    pub repository_id: RepositoryId,
    pub base_ref: String,
    pub branch: String,
    pub name: Option<String>,
    pub copy_local_env_files: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileCandidate {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileCopyFailure {
    pub path: String,
    pub error: CommandError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileCopyResult {
    pub copied: Vec<String>,
    pub failures: Vec<LocalFileCopyFailure>,
}

impl LocalFileCopyResult {
    pub fn empty() -> Self {
        Self {
            copied: Vec::new(),
            failures: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreePreview {
    pub destination: PathBuf,
    pub repository_slug: String,
    pub worktree_slug: String,
    pub local_env_files: Vec<LocalFileCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeResult {
    pub worktree: Worktree,
    pub worktrees: Vec<Worktree>,
    pub local_env_copy: LocalFileCopyResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRemovalPreview {
    pub worktree: Worktree,
    pub allowed: bool,
    pub requires_force: bool,
    pub blockers: Vec<RemovalBlocker>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveWorktreeResult {
    pub removed: bool,
    pub requires_force: bool,
    pub blockers: Vec<RemovalBlocker>,
    pub worktrees: Vec<Worktree>,
}

#[cfg(test)]
mod tests {
    use super::{LocalFileCandidate, RemovalBlocker, RepositoryId, Worktree, WorktreeId};
    use crate::domain::CommandError;
    use chrono::{TimeZone, Utc};
    use std::path::PathBuf;

    #[test]
    fn worktree_serializes_camel_case_json_for_the_frontend() {
        let worktree = Worktree {
            id: WorktreeId::from_string("wt-1"),
            repository_id: RepositoryId::from_string("repo-1"),
            name: "feat-auth-142".to_owned(),
            path: PathBuf::from("/tmp/forest/worktrees/acme-app/feat-auth-142"),
            branch: Some("feat/auth-142".to_owned()),
            head: Some("abcdef".to_owned()),
            detached: false,
            locked: false,
            lock_reason: None,
            prunable: false,
            prunable_reason: None,
            present: true,
            git_known: true,
            is_primary: false,
            tracked_changes: 1,
            untracked_files: 2,
            ignored_files: 3,
            ahead: Some(1),
            behind: Some(0),
            created_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            last_used_at: None,
            status_error: Some(CommandError {
                code: "git_command_failed".into(),
                message: "index unreadable".into(),
            }),
        };

        let json = serde_json::to_value(&worktree).expect("serialize");
        assert_eq!(json["id"], "wt-1");
        assert_eq!(json["repositoryId"], "repo-1");
        assert_eq!(json["name"], "feat-auth-142");
        assert_eq!(json["branch"], "feat/auth-142");
        assert_eq!(json["trackedChanges"], 1);
        assert_eq!(json["untrackedFiles"], 2);
        assert_eq!(json["ignoredFiles"], 3);
        assert_eq!(json["isPrimary"], false);
        assert_eq!(json["prunableReason"], serde_json::Value::Null);
        assert_eq!(json["statusError"]["code"], "git_command_failed");
        assert_eq!(json["lastUsedAt"], serde_json::Value::Null);
        assert_eq!(
            serde_json::to_value(RemovalBlocker::Dirty).unwrap(),
            "dirty"
        );
        assert_eq!(
            serde_json::to_value(RemovalBlocker::StatusUnavailable).unwrap(),
            "status_unavailable"
        );
    }

    #[test]
    fn ignored_files_do_not_make_a_worktree_dirty() {
        let worktree = Worktree {
            id: WorktreeId::from_string("wt-1"),
            repository_id: RepositoryId::from_string("repo-1"),
            name: "feat-env".to_owned(),
            path: PathBuf::from("/tmp/forest/worktrees/acme-app/feat-env"),
            branch: Some("feat/env".to_owned()),
            head: Some("abcdef".to_owned()),
            detached: false,
            locked: false,
            lock_reason: None,
            prunable: false,
            prunable_reason: None,
            present: true,
            git_known: true,
            is_primary: false,
            tracked_changes: 0,
            untracked_files: 0,
            ignored_files: 1,
            ahead: None,
            behind: None,
            created_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            last_used_at: None,
            status_error: None,
        };
        assert!(!worktree.is_dirty());
        assert!(Worktree {
            tracked_changes: 1,
            ignored_files: 1,
            ..worktree.clone()
        }
        .is_dirty());
        assert!(Worktree {
            untracked_files: 1,
            ignored_files: 1,
            ..worktree
        }
        .is_dirty());
    }

    #[test]
    fn seed_types_serialize_camel_case_json_for_the_frontend() {
        let candidate = LocalFileCandidate {
            path: ".env".to_owned(),
            size_bytes: 12,
        };
        let json = serde_json::to_value(&candidate).expect("serialize");
        assert_eq!(json["path"], ".env");
        assert_eq!(json["sizeBytes"], 12);
    }
}
