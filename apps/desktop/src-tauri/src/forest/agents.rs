use crate::agents::{detect_definition, launch_spec};
use crate::domain::{
    AgentAvailability, AgentDefinitionId, AgentLaunchResult, ForestError, TerminalProviderId,
    WorktreeId,
};
use crate::persistence::{get_agent_definition, list_agent_definitions};
use crate::terminals::TerminalProvider;

use super::ForestService;

impl ForestService {
    pub fn detect_agents(&self) -> Result<Vec<AgentAvailability>, ForestError> {
        let definitions = list_agent_definitions(self.db.connection())?;
        definitions
            .iter()
            .map(|definition| detect_definition(self.executables.as_ref(), definition))
            .collect()
    }

    pub fn launch_agent(
        &self,
        worktree_id: WorktreeId,
        agent_definition_id: Option<AgentDefinitionId>,
    ) -> Result<AgentLaunchResult, ForestError> {
        let worktree_path = self.require_worktree_launch_path(&worktree_id)?;
        let configuration = self.configuration()?;
        let agent_id = agent_definition_id.unwrap_or(configuration.default_agent_id.clone());
        let definition = get_agent_definition(self.db.connection(), agent_id.as_str())?
            .ok_or_else(|| ForestError::UnknownAgent(agent_id.as_str().to_owned()))?;
        let spec = launch_spec(self.executables.as_ref(), &definition, &worktree_path)?;
        match configuration.default_terminal {
            TerminalProviderId::Warp => {
                self.terminals
                    .launch_command(&spec, configuration.launch_behavior)?;
            }
        }
        Ok(AgentLaunchResult {
            provider: configuration.default_terminal,
            agent_id: definition.id,
            command: spec.command,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service_with_locator, TempEnv};
    use crate::domain::{CreateWorktreeInput, ForestError};
    use crate::git::testing::{init_repository_at, run_git};
    use crate::terminals::launcher::FakeDesktopLauncher;
    use crate::terminals::WarpProvider;
    use std::time::Duration;

    fn imported_repo(
        env: &TempEnv,
        launcher: FakeDesktopLauncher,
    ) -> (crate::forest::ForestService, crate::domain::Repository) {
        let terminals = WarpProvider::new(
            Box::new(launcher.clone()),
            Duration::from_secs(30),
            env.root.join("tab_configs"),
        );
        let service = open_service_with_locator(env, terminals, Box::new(launcher));
        let repo_path = env.root.join("linked");
        init_repository_at(&repo_path);
        run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
        let state = service
            .import_repository(Some("Demo App".into()), repo_path)
            .expect("import");
        (service, state.repositories.into_iter().next().unwrap())
    }

    #[test]
    fn detects_builtin_agents_from_the_path() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex", "claude"]);
        let (service, _repository) = imported_repo(&env, launcher);
        let detected = service.detect_agents().expect("detect");
        let by_id = |id: &str| {
            detected
                .iter()
                .find(|agent| agent.id.as_str() == id)
                .unwrap_or_else(|| panic!("{id}"))
        };
        assert!(by_id("codex").installed);
        assert!(by_id("claude").installed);
        assert!(!by_id("opencode").installed);
        assert!(!by_id("cursor").installed);
    }

    #[test]
    fn launches_the_default_agent_in_the_selected_worktree() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex", "claude", "opencode"]);
        let (service, repository) = imported_repo(&env, launcher.clone());
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/agent".into(),
                name: None,
            })
            .expect("create");

        let result = service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("launch");
        assert_eq!(result.agent_id.as_str(), "codex");
        assert_eq!(result.command, "codex");
        let opened = launcher.opened();
        assert_eq!(opened.len(), 1);
        assert!(opened[0].starts_with("warp://tab_config/git-forest-"));
        assert!(!opened[0].contains(created.worktree.path.to_string_lossy().as_ref()));
    }

    #[test]
    fn launches_each_required_builtin_agent() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex", "claude", "opencode"]);
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/agents".into(),
                name: None,
            })
            .expect("create");

        for id in ["codex", "claude", "opencode"] {
            let result = service
                .launch_agent(
                    created.worktree.id.clone(),
                    Some(crate::domain::AgentDefinitionId::from_string(id)),
                )
                .expect(id);
            assert_eq!(result.agent_id.as_str(), id);
            assert_eq!(result.command, id);
        }
    }

    #[test]
    fn missing_agent_is_unavailable() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/missing-agent".into(),
                name: None,
            })
            .expect("create");

        let error = service
            .launch_agent(created.worktree.id, None)
            .expect_err("missing");
        assert!(matches!(error, ForestError::AgentUnavailable(ref name) if name == "Codex"));
        assert_eq!(
            crate::domain::CommandError::from(error).code,
            "agent_unavailable"
        );
    }

    #[test]
    fn missing_worktree_directory_is_not_launched() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]);
        let (service, repository) = imported_repo(&env, launcher.clone());
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/gone-agent".into(),
                name: None,
            })
            .expect("create");
        std::fs::remove_dir_all(&created.worktree.path).expect("remove");

        let error = service
            .launch_agent(created.worktree.id, None)
            .expect_err("missing");
        assert!(matches!(error, ForestError::WorktreeMissing));
        assert!(launcher.opened().is_empty());
    }
}
