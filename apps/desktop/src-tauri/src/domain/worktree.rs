use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
    pub present: bool,
    pub git_known: bool,
    pub is_primary: bool,
    pub tracked_changes: u32,
    pub untracked_files: u32,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreePreview {
    pub destination: PathBuf,
    pub repository_slug: String,
    pub worktree_slug: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeResult {
    pub worktree: Worktree,
    pub worktrees: Vec<Worktree>,
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
    use super::{RemovalBlocker, RepositoryId, Worktree, WorktreeId};
    use chrono::{TimeZone, Utc};
    use std::path::PathBuf;

    #[test]
    fn worktree_serializes_camel_case_json_for_the_frontend() {
        let worktree = Worktree {
            id: WorktreeId::from_string("wt-1"),
            repository_id: RepositoryId::from_string("repo-1"),
            name: "feat-risk-483".to_owned(),
            path: PathBuf::from("/tmp/forest/worktrees/exog-app/feat-risk-483"),
            branch: Some("feat/risk-483".to_owned()),
            head: Some("abcdef".to_owned()),
            detached: false,
            locked: false,
            lock_reason: None,
            prunable: false,
            present: true,
            git_known: true,
            is_primary: false,
            tracked_changes: 1,
            untracked_files: 2,
            ahead: Some(1),
            behind: Some(0),
            created_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
        };

        let json = serde_json::to_value(&worktree).expect("serialize");
        assert_eq!(json["id"], "wt-1");
        assert_eq!(json["repositoryId"], "repo-1");
        assert_eq!(json["name"], "feat-risk-483");
        assert_eq!(json["branch"], "feat/risk-483");
        assert_eq!(json["trackedChanges"], 1);
        assert_eq!(json["untrackedFiles"], 2);
        assert_eq!(json["isPrimary"], false);
        assert_eq!(
            serde_json::to_value(RemovalBlocker::Dirty).unwrap(),
            "dirty"
        );
    }
}
