use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::domain::{AgentSession, AgentSessionStatus, ForestError};
use crate::persistence::{
    find_worktree_by_id, get_agent_definition, list_agent_sessions, update_agent_session,
};
use crate::processes::{
    command_matches, cwd_matches, newest_unseen, ProcessExpectation, ProcessInspect,
};

use super::ForestService;

const STALE_STARTING: Duration = Duration::from_secs(30);

impl ForestService {
    pub fn list_agent_sessions(&self) -> Result<Vec<AgentSession>, ForestError> {
        self.reconcile_agent_sessions()
    }

    pub fn reconcile_agent_sessions(&self) -> Result<Vec<AgentSession>, ForestError> {
        let now = Utc::now();
        let sessions = list_agent_sessions(self.db.connection())?;
        let mut reconciled = Vec::new();
        for session in sessions {
            if let Some(next) = self.reconcile_one(&session, now)? {
                update_agent_session(self.db.connection(), &next)?;
                reconciled.push(next);
            } else {
                reconciled.push(session);
            }
        }
        Ok(reconciled)
    }

    pub(crate) fn discover_new_process(
        &self,
        expected: &ProcessExpectation,
        baseline: &[(i32, u64)],
    ) -> Result<Option<crate::processes::ProcessIdentity>, ForestError> {
        for attempt in 0..self.pid_poll_attempts {
            let found = newest_unseen(self.processes.snapshot_matching(expected)?, baseline);
            if found.is_some() {
                return Ok(found);
            }
            if attempt + 1 < self.pid_poll_attempts && !self.pid_poll_interval.is_zero() {
                std::thread::sleep(self.pid_poll_interval);
            }
        }
        Ok(None)
    }

    fn reconcile_one(
        &self,
        session: &AgentSession,
        now: DateTime<Utc>,
    ) -> Result<Option<AgentSession>, ForestError> {
        match session.status {
            AgentSessionStatus::Exited
            | AgentSessionStatus::Unknown
            | AgentSessionStatus::Failed => Ok(None),
            AgentSessionStatus::Starting | AgentSessionStatus::Running => {
                if let Some(pid) = session.pid {
                    return self.reconcile_known_pid(session, pid as i32, now);
                }
                if session.status == AgentSessionStatus::Starting
                    && session.launched_at.is_some_and(|launched| {
                        now.signed_duration_since(launched)
                            .to_std()
                            .unwrap_or_default()
                            >= STALE_STARTING
                    })
                {
                    let mut next = session.clone();
                    next.status = AgentSessionStatus::Unknown;
                    next.last_seen_at = Some(now);
                    return Ok(Some(next));
                }
                Ok(None)
            }
        }
    }

    fn reconcile_known_pid(
        &self,
        session: &AgentSession,
        pid: i32,
        now: DateTime<Utc>,
    ) -> Result<Option<AgentSession>, ForestError> {
        match self.processes.inspect_pid(pid)? {
            ProcessInspect::Missing => {
                let mut next = session.clone();
                next.status = AgentSessionStatus::Exited;
                next.exited_at = Some(now);
                Ok(Some(next))
            }
            ProcessInspect::Inaccessible => Ok(Some(mark_unknown(session, now))),
            ProcessInspect::Present(identity) => {
                let ticks_match = session
                    .process_start_ticks
                    .is_some_and(|ticks| ticks as u64 == identity.start_ticks);
                if !ticks_match {
                    return Ok(Some(mark_unknown(session, now)));
                }
                if !self.identity_still_matches(session, &identity)? {
                    return Ok(Some(mark_unknown(session, now)));
                }
                let mut next = session.clone();
                next.status = AgentSessionStatus::Running;
                next.last_seen_at = Some(now);
                Ok(Some(next))
            }
        }
    }

    fn identity_still_matches(
        &self,
        session: &AgentSession,
        identity: &crate::processes::ProcessIdentity,
    ) -> Result<bool, ForestError> {
        let Some(worktree) = find_worktree_by_id(self.db.connection(), &session.worktree_id)?
        else {
            return Ok(false);
        };
        let Some(definition) =
            get_agent_definition(self.db.connection(), session.agent_definition_id.as_str())?
        else {
            return Ok(false);
        };
        Ok(cwd_matches(identity, &worktree.path) && command_matches(identity, &definition.command))
    }
}

fn mark_unknown(session: &AgentSession, now: DateTime<Utc>) -> AgentSession {
    let mut next = session.clone();
    next.status = AgentSessionStatus::Unknown;
    next.pid = None;
    next.process_start_ticks = None;
    next.last_seen_at = Some(now);
    next
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service_with_processes, TempEnv};
    use crate::domain::{
        AgentDefinitionId, AgentSession, AgentSessionId, AgentSessionStatus, CreateWorktreeInput,
        WorktreeId,
    };
    use crate::git::testing::{init_repository_at, run_git};
    use crate::persistence::{get_agent_session, insert_agent_session};
    use crate::processes::fake::FakeProcessInspector;
    use crate::processes::ProcessIdentity;
    use crate::terminals::launcher::FakeDesktopLauncher;
    use crate::terminals::WarpProvider;
    use chrono::{Duration as ChronoDuration, Utc};
    use std::path::PathBuf;
    use std::time::Duration;

    fn imported(
        env: &TempEnv,
        inspector: FakeProcessInspector,
    ) -> (crate::forest::ForestService, crate::domain::Repository) {
        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let terminals = WarpProvider::new(
            Box::new(launcher),
            Duration::from_secs(30),
            env.root.join("tab_configs"),
        );
        let service = open_service_with_processes(
            env,
            terminals,
            Box::new(FakeDesktopLauncher::with_binaries(&[
                "warp-terminal",
                "codex",
            ])),
            Box::new(inspector),
        );
        let repo_path = env.root.join("linked");
        init_repository_at(&repo_path);
        run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
        let state = service
            .import_repository(Some("Demo App".into()), repo_path)
            .expect("import");
        (service, state.repositories.into_iter().next().unwrap())
    }

    fn identity(path: PathBuf, pid: i32, ticks: u64) -> ProcessIdentity {
        ProcessIdentity {
            pid,
            start_ticks: ticks,
            cwd: path,
            command: "codex".into(),
            cmdline: vec!["codex".into()],
        }
    }

    fn insert_running(
        service: &crate::forest::ForestService,
        worktree_id: &WorktreeId,
        pid: i32,
        ticks: i64,
    ) -> AgentSession {
        let session = AgentSession {
            id: AgentSessionId::from_string("session-1"),
            worktree_id: worktree_id.clone(),
            agent_definition_id: AgentDefinitionId::from_string("codex"),
            status: AgentSessionStatus::Running,
            pid: Some(pid as i64),
            process_start_ticks: Some(ticks),
            launched_at: Some(Utc::now()),
            last_seen_at: Some(Utc::now()),
            exited_at: None,
        };
        insert_agent_session(service.db_connection_for_test(), &session).expect("insert");
        session
    }

    #[test]
    fn running_with_live_pid_stays_running_and_refreshes_last_seen() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector.clone());
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/live".into(),
                name: None,
            })
            .expect("create");
        inspector.add_live(identity(created.worktree.path.clone(), 4242, 99));
        let before = insert_running(&service, &created.worktree.id, 4242, 99);

        let listed = service.list_agent_sessions().expect("list");
        let session = listed
            .iter()
            .find(|item| item.id == before.id)
            .expect("row");
        assert_eq!(session.status, AgentSessionStatus::Running);
        assert!(session.last_seen_at.expect("seen") >= before.last_seen_at.expect("before"));
    }

    #[test]
    fn missing_pid_marks_the_session_exited() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/dead".into(),
                name: None,
            })
            .expect("create");
        insert_running(&service, &created.worktree.id, 4242, 99);

        let listed = service.list_agent_sessions().expect("list");
        assert_eq!(listed[0].status, AgentSessionStatus::Exited);
        assert!(listed[0].exited_at.is_some());
    }

    #[test]
    fn pid_reuse_marks_the_session_unknown() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector.clone());
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/reuse".into(),
                name: None,
            })
            .expect("create");
        inspector.add_live(identity(created.worktree.path.clone(), 4242, 200));
        insert_running(&service, &created.worktree.id, 4242, 99);

        let listed = service.list_agent_sessions().expect("list");
        assert_eq!(listed[0].status, AgentSessionStatus::Unknown);
        assert_eq!(listed[0].pid, None);
    }

    #[test]
    fn stale_starting_without_pid_becomes_unknown() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/stale".into(),
                name: None,
            })
            .expect("create");
        let session = AgentSession {
            id: AgentSessionId::from_string("stale"),
            worktree_id: created.worktree.id,
            agent_definition_id: AgentDefinitionId::from_string("codex"),
            status: AgentSessionStatus::Starting,
            pid: None,
            process_start_ticks: None,
            launched_at: Some(Utc::now() - ChronoDuration::seconds(45)),
            last_seen_at: None,
            exited_at: None,
        };
        insert_agent_session(service.db_connection_for_test(), &session).expect("insert");

        let listed = service.list_agent_sessions().expect("list");
        assert_eq!(listed[0].status, AgentSessionStatus::Unknown);
    }

    #[test]
    fn exited_rows_are_left_untouched() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/done".into(),
                name: None,
            })
            .expect("create");
        let session = AgentSession {
            id: AgentSessionId::from_string("done"),
            worktree_id: created.worktree.id,
            agent_definition_id: AgentDefinitionId::from_string("codex"),
            status: AgentSessionStatus::Exited,
            pid: Some(1),
            process_start_ticks: Some(1),
            launched_at: Some(Utc::now()),
            last_seen_at: Some(Utc::now()),
            exited_at: Some(Utc::now()),
        };
        insert_agent_session(service.db_connection_for_test(), &session).expect("insert");

        service.list_agent_sessions().expect("list");
        let loaded = get_agent_session(service.db_connection_for_test(), &session.id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.status, AgentSessionStatus::Exited);
        assert_eq!(loaded.pid, Some(1));
    }

    #[test]
    fn inaccessible_pid_is_unknown_not_exited() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let (service, repository) = imported(&env, inspector.clone());
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/perm".into(),
                name: None,
            })
            .expect("create");
        inspector.mark_inaccessible(4242);
        insert_running(&service, &created.worktree.id, 4242, 99);

        let listed = service.list_agent_sessions().expect("list");
        assert_eq!(listed[0].status, AgentSessionStatus::Unknown);
        assert!(listed[0].exited_at.is_none());
    }

    #[test]
    fn restart_keeps_a_live_process_running() {
        let env = TempEnv::new();
        let inspector = FakeProcessInspector::new();
        let worktree_id;
        {
            let (service, repository) = imported(&env, inspector.clone());
            let created = service
                .create_worktree(CreateWorktreeInput {
                    repository_id: repository.id,
                    base_ref: "main".into(),
                    branch: "feat/restart".into(),
                    name: None,
                })
                .expect("create");
            inspector.add_live(identity(created.worktree.path.clone(), 4242, 99));
            insert_running(&service, &created.worktree.id, 4242, 99);
            worktree_id = created.worktree.id;
        }

        let launcher =
            FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"]).and_scheme("warp");
        let terminals = WarpProvider::new(
            Box::new(launcher),
            Duration::from_secs(30),
            env.root.join("tab_configs"),
        );
        let reopened = open_service_with_processes(
            &env,
            terminals,
            Box::new(FakeDesktopLauncher::with_binaries(&[
                "warp-terminal",
                "codex",
            ])),
            Box::new(inspector),
        );
        let listed = reopened.list_agent_sessions().expect("list");
        assert_eq!(listed[0].worktree_id, worktree_id);
        assert_eq!(listed[0].status, AgentSessionStatus::Running);
        assert_eq!(listed[0].pid, Some(4242));
    }
}
