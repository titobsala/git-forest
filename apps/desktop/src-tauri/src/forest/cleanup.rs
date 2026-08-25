use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::domain::{
    CleanupCategory, CleanupOperationResult, CleanupPreview, CleanupRequest, CleanupResult,
    CleanupSessionCandidate, CleanupSourceError, CleanupWorktreeCandidate, CommandError,
    ForestError, RepositoryHealth, RepositoryId, WorktreeId,
};
use crate::persistence::{
    count_sessions_for_worktree, delete_finished_sessions, delete_worktrees, has_protected_session,
    list_all_worktrees, list_finished_sessions, list_repositories, WorktreeRecord,
};

use super::ForestService;

impl ForestService {
    pub fn preview_cleanup(&self) -> Result<CleanupPreview, ForestError> {
        self.discover_cleanup()
    }

    pub fn run_cleanup(&self, request: CleanupRequest) -> Result<CleanupResult, ForestError> {
        self.reconcile_agent_sessions()?;
        self.reconcile_repositories()?;

        let mut operations = Vec::new();

        if request.prune_git_worktrees {
            operations.push(self.prune_git_worktrees()?);
            for repository in list_repositories(self.db.connection())? {
                if repository.health != RepositoryHealth::Available {
                    continue;
                }
                if let Err(error) = self.reconcile_worktrees(&repository) {
                    log::warn!(
                        "worktree reconcile after prune failed for {}: {}",
                        repository.id.as_str(),
                        CommandError::from(error).code
                    );
                }
            }
        }

        if request.remove_finished_sessions {
            operations.push(self.remove_finished_sessions()?);
        }

        if request.remove_forest_metadata {
            operations.push(self.remove_stale_forest_metadata()?);
        }

        if request.remove_warp_configs {
            operations.push(self.remove_stale_warp_configs());
        }

        for operation in &operations {
            match &operation.error {
                Some(error) => log::warn!(
                    "cleanup {:?} removed {} with error {}",
                    operation.category,
                    operation.removed,
                    error.code
                ),
                None => log::info!(
                    "cleanup {:?} removed {}",
                    operation.category,
                    operation.removed
                ),
            }
        }

        Ok(CleanupResult {
            operations,
            preview: self.discover_cleanup()?,
            state: self.state()?,
        })
    }

    fn discover_cleanup(&self) -> Result<CleanupPreview, ForestError> {
        let repositories = list_repositories(self.db.connection())?;
        let stored = list_all_worktrees(self.db.connection())?;
        let mut preview = CleanupPreview::empty();
        let mut git_paths: HashMap<RepositoryId, HashSet<PathBuf>> = HashMap::new();

        for repository in &repositories {
            match crate::git::worktree::list_worktrees(&self.git, &repository.path) {
                Ok(worktrees) => {
                    let mut paths = HashSet::new();
                    for git_worktree in worktrees {
                        paths.insert(canonicalize_or_clone(&git_worktree.path));
                        if git_worktree.prunable {
                            let matched = stored.iter().find(|record| {
                                record.repository_id == repository.id
                                    && paths_match(&record.path, &git_worktree.path)
                            });
                            preview
                                .prunable_git_worktrees
                                .push(CleanupWorktreeCandidate {
                                    repository_id: repository.id.clone(),
                                    worktree_id: matched.map(|record| record.id.clone()),
                                    name: matched
                                        .map(|record| record.name.clone())
                                        .unwrap_or_else(|| worktree_label(&git_worktree.path)),
                                    path: git_worktree.path.clone(),
                                    reason: git_worktree
                                        .prunable_reason
                                        .clone()
                                        .unwrap_or_else(|| "prunable".to_owned()),
                                    session_record_count: matched
                                        .map(|record| {
                                            count_sessions_for_worktree(
                                                self.db.connection(),
                                                &record.id,
                                            )
                                        })
                                        .transpose()?
                                        .unwrap_or(0),
                                });
                        }
                    }
                    git_paths.insert(repository.id.clone(), paths);
                }
                Err(error) => preview.source_errors.push(CleanupSourceError {
                    category: CleanupCategory::GitWorktrees,
                    repository_id: Some(repository.id.clone()),
                    error: CommandError::from(error),
                }),
            }
        }

        for record in stored {
            let present = record.path.is_dir();
            let git_list = git_paths.get(&record.repository_id);
            let git_known = git_list
                .map(|paths| {
                    paths.contains(&canonicalize_or_clone(&record.path))
                        || paths.contains(&record.path)
                })
                .unwrap_or(false);
            let session_record_count =
                count_sessions_for_worktree(self.db.connection(), &record.id)?;
            let protected = has_protected_session(self.db.connection(), &record.id)?;

            if git_list.is_none() {
                preview.blocked_forest_worktrees.push(candidate_from_record(
                    &record,
                    "git list unavailable",
                    session_record_count,
                ));
                continue;
            }

            if present && !git_known {
                preview.blocked_forest_worktrees.push(candidate_from_record(
                    &record,
                    "present but unknown to git",
                    session_record_count,
                ));
                continue;
            }

            if !present && !git_known {
                if protected {
                    preview.blocked_forest_worktrees.push(candidate_from_record(
                        &record,
                        "protected by an active or unknown session",
                        session_record_count,
                    ));
                } else {
                    preview.stale_forest_worktrees.push(candidate_from_record(
                        &record,
                        "absent from disk and git",
                        session_record_count,
                    ));
                }
            }
        }

        match self.terminals.stale_tab_configs() {
            Ok(configs) => preview.stale_warp_configs = configs,
            Err(error) => preview.source_errors.push(CleanupSourceError {
                category: CleanupCategory::WarpConfigs,
                repository_id: None,
                error: CommandError::from(error),
            }),
        }

        preview.finished_sessions = list_finished_sessions(self.db.connection())?
            .into_iter()
            .map(|session| CleanupSessionCandidate {
                id: session.id,
                worktree_id: session.worktree_id,
                status: session.status,
            })
            .collect();

        Ok(preview)
    }

    fn prune_git_worktrees(&self) -> Result<CleanupOperationResult, ForestError> {
        let mut removed = 0_u32;
        let mut error = None;
        let repositories = list_repositories(self.db.connection())?;
        for repository in repositories {
            if repository.health != RepositoryHealth::Available {
                continue;
            }
            let before = match crate::git::worktree::list_worktrees(&self.git, &repository.path) {
                Ok(worktrees) => worktrees
                    .into_iter()
                    .filter(|item| item.prunable)
                    .map(|item| item.path)
                    .collect::<Vec<_>>(),
                Err(git_error) => {
                    if error.is_none() {
                        error = Some(CommandError::from(git_error));
                    }
                    continue;
                }
            };
            match crate::git::worktree::prune_worktrees(&self.git, &repository.path) {
                Ok(()) => {
                    let after = crate::git::worktree::list_worktrees(&self.git, &repository.path)
                        .unwrap_or_default();
                    removed += before
                        .iter()
                        .filter(|path| !after.iter().any(|item| paths_match(&item.path, path)))
                        .count() as u32;
                    for path in &before {
                        if path.is_dir() {
                            log::warn!(
                                "git worktree prune left a present directory for {}",
                                repository.id.as_str()
                            );
                        }
                    }
                }
                Err(git_error) => {
                    if error.is_none() {
                        error = Some(CommandError::from(git_error));
                    }
                }
            }
        }
        Ok(CleanupOperationResult {
            category: CleanupCategory::GitWorktrees,
            removed,
            error,
        })
    }

    fn remove_stale_forest_metadata(&self) -> Result<CleanupOperationResult, ForestError> {
        let preview = self.discover_cleanup()?;
        let ids: Vec<WorktreeId> = preview
            .stale_forest_worktrees
            .iter()
            .filter_map(|candidate| candidate.worktree_id.clone())
            .collect();
        let tx = self.db.connection().unchecked_transaction()?;
        let removed = delete_worktrees(&tx, &ids)?;
        tx.commit()?;
        Ok(CleanupOperationResult {
            category: CleanupCategory::ForestMetadata,
            removed,
            error: None,
        })
    }

    fn remove_stale_warp_configs(&self) -> CleanupOperationResult {
        match self.terminals.prune_stale_tab_configs() {
            Ok(removed) => CleanupOperationResult {
                category: CleanupCategory::WarpConfigs,
                removed,
                error: None,
            },
            Err(error) => CleanupOperationResult {
                category: CleanupCategory::WarpConfigs,
                removed: 0,
                error: Some(CommandError::from(error)),
            },
        }
    }

    fn remove_finished_sessions(&self) -> Result<CleanupOperationResult, ForestError> {
        let removed = delete_finished_sessions(self.db.connection())?;
        Ok(CleanupOperationResult {
            category: CleanupCategory::FinishedSessions,
            removed,
            error: None,
        })
    }
}

fn candidate_from_record(
    record: &WorktreeRecord,
    reason: &str,
    session_record_count: u32,
) -> CleanupWorktreeCandidate {
    CleanupWorktreeCandidate {
        repository_id: record.repository_id.clone(),
        worktree_id: Some(record.id.clone()),
        name: record.name.clone(),
        path: record.path.clone(),
        reason: reason.to_owned(),
        session_record_count,
    }
}

fn canonicalize_or_clone(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn paths_match(left: &Path, right: &Path) -> bool {
    left == right || canonicalize_or_clone(left) == canonicalize_or_clone(right)
}

fn worktree_label(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("worktree")
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service_with, TempEnv};
    use crate::domain::{
        AgentSession, AgentSessionId, AgentSessionStatus, CleanupCategory, CleanupRequest,
        CreateWorktreeInput, RepositoryHealth,
    };
    use crate::git::testing::{init_repository_at, run_git};
    use crate::persistence::insert_agent_session;
    use crate::terminals::launcher::FakeDesktopLauncher;
    use crate::terminals::WarpProvider;
    use std::fs;
    use std::time::Duration;

    fn imported_repo(env: &TempEnv) -> (crate::forest::ForestService, crate::domain::Repository) {
        let tabs = env.root.join("tab_configs");
        fs::create_dir_all(&tabs).expect("tabs");
        let terminals = WarpProvider::new_with_tab_ttl(
            Box::new(FakeDesktopLauncher::with_scheme("warp")),
            Duration::from_secs(30),
            tabs,
            Duration::ZERO,
        );
        let service = open_service_with(env, terminals);
        let repo_path = env.root.join("linked");
        init_repository_at(&repo_path);
        run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
        let state = service
            .import_repository(Some("Demo App".into()), repo_path)
            .expect("import");
        (service, state.repositories.into_iter().next().unwrap())
    }

    fn empty_request() -> CleanupRequest {
        CleanupRequest {
            prune_git_worktrees: false,
            remove_forest_metadata: false,
            remove_warp_configs: false,
            remove_finished_sessions: false,
        }
    }

    #[test]
    fn preview_cleanup_has_no_side_effects() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id.clone(),
                base_ref: "main".into(),
                branch: "feat/gone".into(),
                name: None,
            })
            .expect("create");
        fs::remove_dir_all(&created.worktree.path).expect("remove dir");
        fs::write(env.root.join("tab_configs/git-forest-old.toml"), "stale\n").expect("warp");
        fs::write(env.root.join("tab_configs/keep.toml"), "user\n").expect("user");

        let preview = service.preview_cleanup().expect("preview");
        assert!(preview
            .prunable_git_worktrees
            .iter()
            .any(|item| item.path == created.worktree.path));
        assert!(created.worktree.path == created.worktree.path);
        assert!(env.root.join("tab_configs/git-forest-old.toml").exists());
        assert!(env.root.join("tab_configs/keep.toml").exists());
        let listed = crate::git::worktree::list_worktrees(&service.git_runner(), &repository.path)
            .expect("git still lists");
        assert!(listed.iter().any(|item| item.path == created.worktree.path));
    }

    #[test]
    fn git_pruning_never_deletes_a_present_directory() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id.clone(),
                base_ref: "main".into(),
                branch: "feat/keep-dir".into(),
                name: None,
            })
            .expect("create");

        let result = service
            .run_cleanup(CleanupRequest {
                prune_git_worktrees: true,
                ..empty_request()
            })
            .expect("cleanup");
        assert!(created.worktree.path.is_dir());
        let git_op = result
            .operations
            .iter()
            .find(|item| item.category == CleanupCategory::GitWorktrees)
            .expect("git op");
        assert_eq!(git_op.removed, 0);
    }

    #[test]
    fn present_unknown_to_git_directories_are_blocked() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let now = chrono::Utc::now();
        crate::persistence::upsert_worktree(
            service.db_connection_for_test(),
            &crate::persistence::WorktreeRecord {
                id: crate::domain::WorktreeId::from_string("unknown"),
                repository_id: repository.id.clone(),
                name: "unknown".into(),
                path: env.root.join("unknown-dir"),
                branch: Some("feat/unknown".into()),
                created_at: now,
                updated_at: now,
                last_used_at: None,
            },
        )
        .expect("insert");
        fs::create_dir_all(env.root.join("unknown-dir")).expect("dir");

        let preview = service.preview_cleanup().expect("preview");
        assert!(preview.stale_forest_worktrees.is_empty());
        assert!(preview
            .blocked_forest_worktrees
            .iter()
            .any(|item| { item.name == "unknown" && item.reason.contains("unknown to git") }));
        assert!(env.root.join("unknown-dir").is_dir());
    }

    #[test]
    fn active_and_unknown_sessions_protect_metadata() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let now = chrono::Utc::now();
        let ghost = crate::persistence::WorktreeRecord {
            id: crate::domain::WorktreeId::from_string("ghost"),
            repository_id: repository.id,
            name: "ghost".into(),
            path: env.root.join("ghost"),
            branch: Some("feat/ghost".into()),
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };
        crate::persistence::upsert_worktree(service.db_connection_for_test(), &ghost).expect("wt");
        insert_agent_session(
            service.db_connection_for_test(),
            &AgentSession {
                id: AgentSessionId::from_string("unknown-session"),
                worktree_id: ghost.id.clone(),
                agent_definition_id: crate::domain::AgentDefinitionId::from_string("codex"),
                status: AgentSessionStatus::Unknown,
                pid: None,
                process_start_ticks: None,
                launched_at: None,
                last_seen_at: None,
                exited_at: None,
            },
        )
        .expect("session");

        let preview = service.preview_cleanup().expect("preview");
        assert!(preview.blocked_forest_worktrees.iter().any(|item| {
            item.worktree_id.as_ref() == Some(&ghost.id) && item.reason.contains("session")
        }));
        assert!(!preview
            .stale_forest_worktrees
            .iter()
            .any(|item| item.worktree_id.as_ref() == Some(&ghost.id)));
    }

    #[test]
    fn cleanup_removes_only_exited_and_failed_sessions() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/sessions".into(),
                name: None,
            })
            .expect("create");
        for (id, status) in [
            ("s-exit", AgentSessionStatus::Exited),
            ("s-fail", AgentSessionStatus::Failed),
            ("s-run", AgentSessionStatus::Running),
            ("s-unknown", AgentSessionStatus::Unknown),
        ] {
            insert_agent_session(
                service.db_connection_for_test(),
                &AgentSession {
                    id: AgentSessionId::from_string(id),
                    worktree_id: created.worktree.id.clone(),
                    agent_definition_id: crate::domain::AgentDefinitionId::from_string("codex"),
                    status,
                    pid: None,
                    process_start_ticks: None,
                    launched_at: None,
                    last_seen_at: None,
                    exited_at: None,
                },
            )
            .expect("session");
        }

        let result = service
            .run_cleanup(CleanupRequest {
                remove_finished_sessions: true,
                ..empty_request()
            })
            .expect("cleanup");
        let op = result
            .operations
            .iter()
            .find(|item| item.category == CleanupCategory::FinishedSessions)
            .expect("sessions");
        assert_eq!(op.removed, 2);
        let remaining: Vec<_> =
            crate::persistence::list_agent_sessions(service.db_connection_for_test())
                .expect("list")
                .into_iter()
                .map(|session| session.id.as_str().to_owned())
                .collect();
        assert!(remaining.contains(&"s-run".to_owned()));
        assert!(remaining.contains(&"s-unknown".to_owned()));
        assert!(!remaining.contains(&"s-exit".to_owned()));
        assert!(!remaining.contains(&"s-fail".to_owned()));
    }

    #[test]
    fn cleanup_removes_stale_generated_warp_files_and_leaves_foreign_files() {
        let env = TempEnv::new();
        let (service, _) = imported_repo(&env);
        let tabs = env.root.join("tab_configs");
        fs::write(tabs.join("git-forest-old.toml"), "stale\n").expect("stale");
        fs::write(tabs.join("my-user-tab.toml"), "keep\n").expect("user");

        let result = service
            .run_cleanup(CleanupRequest {
                remove_warp_configs: true,
                ..empty_request()
            })
            .expect("cleanup");
        let op = result
            .operations
            .iter()
            .find(|item| item.category == CleanupCategory::WarpConfigs)
            .expect("warp");
        assert_eq!(op.removed, 1);
        assert!(!tabs.join("git-forest-old.toml").exists());
        assert!(tabs.join("my-user-tab.toml").exists());
    }

    #[test]
    fn cleanup_execute_prunes_git_and_stale_forest_rows() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id.clone(),
                base_ref: "main".into(),
                branch: "feat/stale".into(),
                name: None,
            })
            .expect("create");
        fs::remove_dir_all(&created.worktree.path).expect("remove dir");

        let result = service
            .run_cleanup(CleanupRequest {
                prune_git_worktrees: true,
                remove_forest_metadata: true,
                ..empty_request()
            })
            .expect("cleanup");
        assert!(!created.worktree.path.exists());
        let git = crate::git::worktree::list_worktrees(&service.git_runner(), &repository.path)
            .expect("list");
        assert!(!git.iter().any(|item| item.path == created.worktree.path));
        let stored = crate::persistence::find_worktree_by_id(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("lookup");
        assert!(stored.is_none());
        assert!(result
            .operations
            .iter()
            .any(|item| item.category == CleanupCategory::GitWorktrees && item.removed >= 1));
        assert!(result
            .operations
            .iter()
            .any(|item| item.category == CleanupCategory::ForestMetadata && item.removed >= 1));
    }

    #[test]
    fn a_failing_category_does_not_suppress_independent_results() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env);
        fs::remove_dir_all(&repository.path).expect("delete repo");
        fs::write(env.root.join("tab_configs/git-forest-old.toml"), "stale\n").expect("warp");

        let result = service
            .run_cleanup(CleanupRequest {
                prune_git_worktrees: true,
                remove_warp_configs: true,
                ..empty_request()
            })
            .expect("cleanup");
        let git_op = result
            .operations
            .iter()
            .find(|item| item.category == CleanupCategory::GitWorktrees)
            .expect("git");
        let warp_op = result
            .operations
            .iter()
            .find(|item| item.category == CleanupCategory::WarpConfigs)
            .expect("warp");
        assert_eq!(warp_op.removed, 1);
        assert!(!env.root.join("tab_configs/git-forest-old.toml").exists());
        let _ = git_op.removed;
        assert_eq!(
            result
                .state
                .repositories
                .iter()
                .find(|item| item.id == repository.id)
                .expect("repo")
                .health,
            RepositoryHealth::Missing
        );
    }
}
