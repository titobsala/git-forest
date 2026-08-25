use crate::agents::{detect_definition, launch_spec};
use crate::domain::{
    AgentAvailability, AgentDefinitionId, AgentLaunchResult, AgentSession, AgentSessionId,
    AgentSessionStatus, ForestError, TerminalProviderId, WorktreeId,
};
use crate::persistence::{
    get_agent_definition, insert_agent_session, list_agent_definitions, update_agent_session,
};
use crate::processes::{identity_key, ProcessExpectation};
use crate::terminals::TerminalProvider;
use chrono::Utc;

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
        let expected = ProcessExpectation {
            worktree_path: spec.working_directory.clone(),
            agent_command: spec.command.clone(),
        };
        let baseline: Vec<_> = self
            .processes
            .snapshot_matching(&expected)?
            .into_iter()
            .map(|identity| identity_key(&identity))
            .collect();

        let now = Utc::now();
        let mut session = AgentSession {
            id: AgentSessionId::generate(),
            worktree_id: worktree_id.clone(),
            agent_definition_id: definition.id.clone(),
            status: AgentSessionStatus::Starting,
            pid: None,
            process_start_ticks: None,
            launched_at: Some(now),
            last_seen_at: None,
            exited_at: None,
        };
        insert_agent_session(self.db.connection(), &session)?;

        if let Err(error) = match configuration.default_terminal {
            TerminalProviderId::Warp => self
                .terminals
                .launch_command(&spec, configuration.launch_behavior),
        } {
            session.status = AgentSessionStatus::Failed;
            session.exited_at = Some(Utc::now());
            update_agent_session(self.db.connection(), &session)?;
            return Err(error);
        }

        let last_used_at = self.touch_worktree_used(&worktree_id)?;
        if let Some(identity) = self.discover_new_process(&expected, &baseline)? {
            session.status = AgentSessionStatus::Running;
            session.pid = Some(i64::from(identity.pid));
            session.process_start_ticks = i64::try_from(identity.start_ticks).ok();
            session.last_seen_at = Some(Utc::now());
        }
        update_agent_session(self.db.connection(), &session)?;

        Ok(AgentLaunchResult {
            provider: configuration.default_terminal,
            agent_id: definition.id,
            command: spec.command,
            last_used_at: Some(last_used_at),
            session_id: session.id,
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
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex", "claude", "opencode"])
                .and_scheme("warp");
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
    fn successful_launch_records_last_used_at() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/agent-recent".into(),
                name: None,
            })
            .expect("create");
        let before = chrono::Utc::now();

        let result = service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("launch");
        let used = result.last_used_at.expect("timestamp");
        assert!(used >= before);
        let record = crate::persistence::find_worktree_by_id(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("find")
        .expect("present");
        assert_eq!(record.last_used_at, Some(used));
    }

    #[test]
    fn failed_launch_does_not_record_last_used_at() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/agent-no-use".into(),
                name: None,
            })
            .expect("create");

        service
            .launch_agent(created.worktree.id.clone(), None)
            .expect_err("missing");
        let record = crate::persistence::find_worktree_by_id(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("find")
        .expect("present");
        assert_eq!(record.last_used_at, None);
    }

    #[test]
    fn launches_each_required_builtin_agent() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex", "claude", "opencode"])
                .and_scheme("warp");
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
        assert!(
            crate::persistence::list_agent_sessions(service.db_connection_for_test())
                .expect("sessions")
                .is_empty()
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
        assert!(
            crate::persistence::list_agent_sessions(service.db_connection_for_test())
                .expect("sessions")
                .is_empty()
        );
    }

    #[test]
    fn successful_launch_without_a_visible_pid_stays_starting() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/starting-pid".into(),
                name: None,
            })
            .expect("create");

        let result = service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("launch");
        let session = crate::persistence::get_agent_session(
            service.db_connection_for_test(),
            &result.session_id,
        )
        .expect("get")
        .expect("present");
        assert_eq!(session.status, crate::domain::AgentSessionStatus::Starting);
        assert_eq!(session.pid, None);
    }

    #[test]
    fn successful_launch_attaches_a_new_matching_process() {
        let env = TempEnv::new();
        let inspector = crate::processes::fake::FakeProcessInspector::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let terminals = WarpProvider::new(
            Box::new(launcher),
            Duration::from_secs(30),
            env.root.join("tab_configs"),
        );
        let service = super::super::tests::open_service_with_processes(
            &env,
            terminals,
            Box::new(FakeDesktopLauncher::with_binaries(&[
                "warp-terminal",
                "codex",
            ])),
            Box::new(inspector.clone()),
        );
        let repo_path = env.root.join("linked");
        init_repository_at(&repo_path);
        run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
        let repository = service
            .import_repository(Some("Demo App".into()), repo_path)
            .expect("import")
            .repositories
            .into_iter()
            .next()
            .unwrap();
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/pid".into(),
                name: None,
            })
            .expect("create");
        inspector.appear_after_baseline(crate::processes::ProcessIdentity {
            pid: 4242,
            start_ticks: 99,
            cwd: created.worktree.path.clone(),
            command: "codex".into(),
            cmdline: vec!["codex".into()],
        });

        let result = service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("launch");
        let session = crate::persistence::get_agent_session(
            service.db_connection_for_test(),
            &result.session_id,
        )
        .expect("get")
        .expect("present");
        assert_eq!(session.status, crate::domain::AgentSessionStatus::Running);
        assert_eq!(session.pid, Some(4242));
        assert_eq!(session.process_start_ticks, Some(99));
    }

    #[test]
    fn warp_dispatch_failure_marks_the_session_failed() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]);
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/failed-dispatch".into(),
                name: None,
            })
            .expect("create");

        service
            .launch_agent(created.worktree.id.clone(), None)
            .expect_err("warp missing");
        let sessions = crate::persistence::list_agent_sessions(service.db_connection_for_test())
            .expect("list");
        assert_eq!(sessions.len(), 1);
        assert_eq!(
            sessions[0].status,
            crate::domain::AgentSessionStatus::Failed
        );
        assert!(sessions[0].exited_at.is_some());
    }

    #[test]
    fn multiple_launches_create_independent_sessions() {
        let env = TempEnv::new();
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let (service, repository) = imported_repo(&env, launcher);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/many".into(),
                name: None,
            })
            .expect("create");

        service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("first");
        service
            .launch_agent(created.worktree.id.clone(), None)
            .expect("second");
        let sessions = crate::persistence::list_sessions_for_worktree(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("list");
        assert_eq!(sessions.len(), 2);
    }
}
