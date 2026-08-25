use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::ids::{AgentDefinitionId, AgentSessionId, WorktreeId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentLaunchSpec {
    pub working_directory: PathBuf,
    pub command: String,
    pub args: Vec<String>,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAvailability {
    pub id: AgentDefinitionId,
    pub name: String,
    pub command: String,
    pub installed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLaunchResult {
    pub provider: crate::domain::TerminalProviderId,
    pub agent_id: AgentDefinitionId,
    pub command: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub session_id: AgentSessionId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinition {
    pub id: AgentDefinitionId,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionStatus {
    Starting,
    Running,
    Exited,
    Unknown,
    Failed,
}

impl AgentSessionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Exited => "exited",
            Self::Unknown => "unknown",
            Self::Failed => "failed",
        }
    }

    pub fn parse(value: &str) -> Result<Self, crate::domain::ForestError> {
        match value {
            "starting" => Ok(Self::Starting),
            "running" => Ok(Self::Running),
            "exited" => Ok(Self::Exited),
            "unknown" => Ok(Self::Unknown),
            "failed" => Ok(Self::Failed),
            other => Err(crate::domain::ForestError::Serialization(format!(
                "unknown agent session status: {other}"
            ))),
        }
    }

    pub fn is_active(self) -> bool {
        matches!(self, Self::Starting | Self::Running)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: AgentSessionId,
    pub worktree_id: WorktreeId,
    pub agent_definition_id: AgentDefinitionId,
    pub status: AgentSessionStatus,
    pub pid: Option<i64>,
    pub process_start_ticks: Option<i64>,
    pub launched_at: Option<DateTime<Utc>>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub exited_at: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::{
        AgentDefinition, AgentDefinitionId, AgentSession, AgentSessionId, AgentSessionStatus,
    };
    use crate::domain::ids::WorktreeId;

    #[test]
    fn agent_definition_serializes_camel_case_json_for_the_frontend() {
        let definition = AgentDefinition {
            id: AgentDefinitionId::from_string("codex"),
            name: "Codex".to_owned(),
            command: "codex".to_owned(),
            args: Vec::new(),
            is_builtin: true,
        };

        let json = serde_json::to_value(&definition).expect("serialize");
        assert_eq!(json["id"], "codex");
        assert_eq!(json["isBuiltin"], true);
        assert_eq!(json["args"], serde_json::json!([]));
    }

    #[test]
    fn agent_session_status_uses_snake_case() {
        let session = AgentSession {
            id: AgentSessionId::from_string("session-1"),
            worktree_id: WorktreeId::from_string("wt-1"),
            agent_definition_id: AgentDefinitionId::from_string("codex"),
            status: AgentSessionStatus::Unknown,
            pid: None,
            process_start_ticks: None,
            launched_at: None,
            last_seen_at: None,
            exited_at: None,
        };

        let json = serde_json::to_value(&session).expect("serialize");
        assert_eq!(json["status"], "unknown");
        assert_eq!(json["worktreeId"], "wt-1");
        assert_eq!(json["agentDefinitionId"], "codex");
        assert_eq!(json["processStartTicks"], serde_json::Value::Null);
    }

    #[test]
    fn launch_result_serializes_last_used_at() {
        let json = serde_json::to_value(crate::domain::AgentLaunchResult {
            provider: crate::domain::TerminalProviderId::Warp,
            agent_id: AgentDefinitionId::from_string("codex"),
            command: "codex".to_owned(),
            last_used_at: Some(
                chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, 2026, 8, 25, 10, 0, 0).unwrap(),
            ),
            session_id: AgentSessionId::from_string("session-1"),
        })
        .expect("serialize");
        assert_eq!(json["lastUsedAt"], "2026-08-25T10:00:00Z");
        assert_eq!(json["agentId"], "codex");
        assert_eq!(json["sessionId"], "session-1");
    }
}
