use std::path::Path;

use crate::domain::{AgentDefinition, AgentLaunchSpec, ForestError};

use super::detection::ExecutableLocator;

pub fn launch_spec(
    locator: &dyn ExecutableLocator,
    definition: &AgentDefinition,
    worktree_path: &Path,
) -> Result<AgentLaunchSpec, ForestError> {
    if !locator.executable_on_path(&definition.command) {
        return Err(ForestError::AgentUnavailable(definition.name.clone()));
    }
    Ok(AgentLaunchSpec {
        working_directory: worktree_path.to_path_buf(),
        command: definition.command.clone(),
        args: definition.args.clone(),
        display_name: definition.name.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::launch_spec;
    use crate::domain::{AgentDefinition, AgentDefinitionId, ForestError};
    use crate::terminals::launcher::FakeDesktopLauncher;
    use std::path::{Path, PathBuf};

    fn definition(id: &str, name: &str, command: &str, args: Vec<String>) -> AgentDefinition {
        AgentDefinition {
            id: AgentDefinitionId::from_string(id),
            name: name.into(),
            command: command.into(),
            args,
            is_builtin: true,
        }
    }

    #[test]
    fn builds_a_structured_spec_without_the_worktree_path() {
        let locator = FakeDesktopLauncher::with_binary("codex");
        let spec = launch_spec(
            &locator,
            &definition("codex", "Codex", "codex", Vec::new()),
            Path::new("/tmp/forest/worktrees/app/feat"),
        )
        .expect("spec");

        assert_eq!(spec.command, "codex");
        assert!(spec.args.is_empty());
        assert_eq!(
            spec.working_directory,
            PathBuf::from("/tmp/forest/worktrees/app/feat")
        );
        assert_ne!(spec.command, spec.working_directory.to_string_lossy());
    }

    #[test]
    fn missing_executables_are_unavailable() {
        let locator = FakeDesktopLauncher::default();
        let error = launch_spec(
            &locator,
            &definition("claude", "Claude Code", "claude", Vec::new()),
            Path::new("/tmp/tree"),
        )
        .expect_err("missing");
        assert!(matches!(error, ForestError::AgentUnavailable(name) if name == "Claude Code"));
    }
}
