use std::path::Path;

use crate::domain::{
    AgentLaunchSpec, ForestError, LaunchBehavior, TerminalLaunchResult, TerminalProviderId,
};

pub trait TerminalProvider {
    #[allow(dead_code)]
    fn id(&self) -> TerminalProviderId;
    fn is_available(&self) -> Result<bool, ForestError>;
    fn open_directory(
        &self,
        path: &Path,
        behavior: LaunchBehavior,
    ) -> Result<TerminalLaunchResult, ForestError>;
    fn launch_command(
        &self,
        spec: &AgentLaunchSpec,
        behavior: LaunchBehavior,
    ) -> Result<TerminalLaunchResult, ForestError>;
}
