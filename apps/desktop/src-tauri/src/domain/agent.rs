use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::ids::{AgentDefinitionId, AgentSessionId, WorktreeId};

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
#[allow(dead_code)]
pub enum AgentSessionStatus {
    Starting,
    Running,
    Exited,
    Unknown,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AgentSession {
    pub id: AgentSessionId,
    pub worktree_id: WorktreeId,
    pub agent_definition_id: AgentDefinitionId,
    pub status: AgentSessionStatus,
    pub pid: Option<i64>,
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
            launched_at: None,
            last_seen_at: None,
            exited_at: None,
        };

        let json = serde_json::to_value(&session).expect("serialize");
        assert_eq!(json["status"], "unknown");
        assert_eq!(json["worktreeId"], "wt-1");
        assert_eq!(json["agentDefinitionId"], "codex");
    }
}
