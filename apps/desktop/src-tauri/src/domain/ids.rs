use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RepositoryId(String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct WorktreeId(String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AgentDefinitionId(String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AgentSessionId(String);

impl RepositoryId {
    pub fn generate() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn from_string(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl WorktreeId {
    #[allow(dead_code)]
    pub fn generate() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    #[allow(dead_code)]
    pub fn from_string(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    #[allow(dead_code)]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AgentDefinitionId {
    #[allow(dead_code)]
    pub fn generate() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn from_string(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AgentSessionId {
    #[allow(dead_code)]
    pub fn generate() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    #[allow(dead_code)]
    pub fn from_string(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    #[allow(dead_code)]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::{AgentDefinitionId, AgentSessionId, RepositoryId, WorktreeId};

    #[test]
    fn generated_ids_are_uuid_strings() {
        for id in [
            RepositoryId::generate().as_str().to_owned(),
            WorktreeId::generate().as_str().to_owned(),
            AgentDefinitionId::generate().as_str().to_owned(),
            AgentSessionId::generate().as_str().to_owned(),
        ] {
            assert!(uuid::Uuid::parse_str(&id).is_ok());
        }
    }

    #[test]
    fn builtin_agent_ids_stay_stable() {
        let id = AgentDefinitionId::from_string("codex");
        let json = serde_json::to_value(&id).expect("serialize");
        assert_eq!(json, "codex");
    }
}
