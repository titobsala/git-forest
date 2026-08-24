use crate::domain::{AgentAvailability, AgentDefinition, ForestError};
use crate::terminals::launcher::path_has_executable;

pub trait ExecutableLocator: Send + Sync {
    fn executable_on_path(&self, name: &str) -> bool;
}

pub struct PathLocator;

impl ExecutableLocator for PathLocator {
    fn executable_on_path(&self, name: &str) -> bool {
        path_has_executable(name)
    }
}

pub fn detect_definition(
    locator: &dyn ExecutableLocator,
    definition: &AgentDefinition,
) -> Result<AgentAvailability, ForestError> {
    Ok(AgentAvailability {
        id: definition.id.clone(),
        name: definition.name.clone(),
        command: definition.command.clone(),
        installed: locator.executable_on_path(&definition.command),
    })
}

#[cfg(test)]
impl ExecutableLocator for crate::terminals::launcher::FakeDesktopLauncher {
    fn executable_on_path(&self, name: &str) -> bool {
        crate::terminals::launcher::FakeDesktopLauncher::executable_on_path(self, name)
    }
}

#[cfg(test)]
mod tests {
    use super::detect_definition;
    use crate::domain::{AgentDefinition, AgentDefinitionId};
    use crate::terminals::launcher::FakeDesktopLauncher;

    #[test]
    fn reports_installed_and_missing_agents() {
        let locator = FakeDesktopLauncher::with_binaries(&["codex", "claude"]);
        let codex = AgentDefinition {
            id: AgentDefinitionId::from_string("codex"),
            name: "Codex".into(),
            command: "codex".into(),
            args: Vec::new(),
            is_builtin: true,
        };
        let opencode = AgentDefinition {
            id: AgentDefinitionId::from_string("opencode"),
            name: "OpenCode".into(),
            command: "opencode".into(),
            args: Vec::new(),
            is_builtin: true,
        };

        assert!(
            detect_definition(&locator, &codex)
                .expect("codex")
                .installed
        );
        assert!(locator.executable_on_path("claude"));
        assert!(
            !detect_definition(&locator, &opencode)
                .expect("opencode")
                .installed
        );
    }
}
