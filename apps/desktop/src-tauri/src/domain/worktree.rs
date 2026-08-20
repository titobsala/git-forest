use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::ids::{RepositoryId, WorktreeId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct Worktree {
    pub id: WorktreeId,
    pub repository_id: RepositoryId,
    pub name: String,
    pub path: PathBuf,
    pub branch: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::{RepositoryId, Worktree, WorktreeId};
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
            created_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
        };

        let json = serde_json::to_value(&worktree).expect("serialize");
        assert_eq!(json["id"], "wt-1");
        assert_eq!(json["repositoryId"], "repo-1");
        assert_eq!(json["name"], "feat-risk-483");
        assert_eq!(json["branch"], "feat/risk-483");
    }
}
