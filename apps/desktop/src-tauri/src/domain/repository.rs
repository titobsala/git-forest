use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::ids::RepositoryId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepositoryMode {
    Managed,
    Linked,
}

impl RepositoryMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Managed => "managed",
            Self::Linked => "linked",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "managed" => Ok(Self::Managed),
            "linked" => Ok(Self::Linked),
            other => Err(format!("unknown repository mode: {other}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: RepositoryId,
    pub name: String,
    pub path: PathBuf,
    pub mode: RepositoryMode,
    pub primary_branch: Option<String>,
    pub remote_url: Option<String>,
    pub last_refreshed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::{Repository, RepositoryId, RepositoryMode};
    use chrono::{TimeZone, Utc};
    use std::path::PathBuf;

    #[test]
    fn repository_serializes_camel_case_json_for_the_frontend() {
        let repository = Repository {
            id: RepositoryId::from_string("repo-1"),
            name: "EXOG App".to_owned(),
            path: PathBuf::from("/tmp/exog-app"),
            mode: RepositoryMode::Linked,
            primary_branch: Some("main".to_owned()),
            remote_url: Some("https://example.test/exog.git".to_owned()),
            last_refreshed_at: Some(Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap()),
            created_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap(),
        };

        let json = serde_json::to_value(&repository).expect("serialize");
        assert_eq!(json["id"], "repo-1");
        assert_eq!(json["name"], "EXOG App");
        assert_eq!(json["path"], "/tmp/exog-app");
        assert_eq!(json["mode"], "linked");
        assert_eq!(json["primaryBranch"], "main");
        assert_eq!(json["remoteUrl"], "https://example.test/exog.git");
        assert!(json.get("lastRefreshedAt").is_some());
        assert!(json.get("createdAt").is_some());
        assert!(json.get("updatedAt").is_some());
    }
}
