use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::agent::AgentDefinition;
use super::app_info::AppInfo;
use super::ids::AgentDefinitionId;
use super::repository::Repository;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalProviderId {
    Warp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeNamingStrategy {
    BranchSlug,
    BranchAsIs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchBehavior {
    Auto,
    Tab,
    Window,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForestConfiguration {
    pub forest_root: PathBuf,
    pub default_terminal: TerminalProviderId,
    pub default_agent_id: AgentDefinitionId,
    pub worktree_naming_strategy: WorktreeNamingStrategy,
    pub launch_behavior: LaunchBehavior,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForestPaths {
    pub app_data_dir: PathBuf,
    pub database_path: PathBuf,
    pub forest_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForestState {
    pub app_info: AppInfo,
    pub configuration: ForestConfiguration,
    pub paths: ForestPaths,
    pub database_initialized: bool,
    pub schema_version: u32,
    pub agent_definitions: Vec<AgentDefinition>,
    pub repositories: Vec<Repository>,
}

#[cfg(test)]
mod tests {
    use super::{ForestConfiguration, LaunchBehavior, TerminalProviderId, WorktreeNamingStrategy};
    use crate::domain::ids::AgentDefinitionId;
    use std::path::PathBuf;

    #[test]
    fn forest_configuration_serializes_camel_case_json_for_the_frontend() {
        let configuration = ForestConfiguration {
            forest_root: PathBuf::from("/home/dev/forest"),
            default_terminal: TerminalProviderId::Warp,
            default_agent_id: AgentDefinitionId::from_string("codex"),
            worktree_naming_strategy: WorktreeNamingStrategy::BranchSlug,
            launch_behavior: LaunchBehavior::Auto,
        };

        let json = serde_json::to_value(&configuration).expect("serialize");
        assert_eq!(json["forestRoot"], "/home/dev/forest");
        assert_eq!(json["defaultTerminal"], "warp");
        assert_eq!(json["defaultAgentId"], "codex");
        assert_eq!(json["worktreeNamingStrategy"], "branch_slug");
        assert_eq!(json["launchBehavior"], "auto");
    }
}
