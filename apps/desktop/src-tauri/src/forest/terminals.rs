use crate::domain::{ForestError, TerminalLaunchResult, TerminalProviderId, WorktreeId};
use crate::terminals::TerminalProvider;

use super::ForestService;

impl ForestService {
    pub fn open_worktree(
        &self,
        worktree_id: WorktreeId,
    ) -> Result<TerminalLaunchResult, ForestError> {
        let path = self.require_worktree_launch_path(&worktree_id)?;
        let configuration = self.configuration()?;
        let mut result = match configuration.default_terminal {
            TerminalProviderId::Warp => {
                match self
                    .terminals
                    .open_directory(&path, configuration.launch_behavior)
                {
                    Ok(result) => result,
                    Err(error) => {
                        log::warn!("terminal launch failed");
                        return Err(error);
                    }
                }
            }
        };
        result.last_used_at = Some(self.touch_worktree_used(&worktree_id)?);
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service_with, TempEnv};
    use crate::domain::{CreateWorktreeInput, ForestError, LaunchBehavior};
    use crate::git::testing::{init_repository_at, run_git};
    use crate::terminals::launcher::FakeDesktopLauncher;
    use crate::terminals::warp::warp_directory_uri;
    use crate::terminals::WarpProvider;
    use std::time::Duration;

    fn warp(launcher: FakeDesktopLauncher, env: &TempEnv) -> WarpProvider {
        WarpProvider::new(
            Box::new(launcher),
            Duration::from_secs(30),
            env.root.join("tab_configs"),
        )
    }

    fn imported_repo(
        env: &TempEnv,
        terminals: WarpProvider,
    ) -> (crate::forest::ForestService, crate::domain::Repository) {
        let service = open_service_with(env, terminals);
        let repo_path = env.root.join("linked");
        init_repository_at(&repo_path);
        run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
        let state = service
            .import_repository(Some("Demo App".into()), repo_path)
            .expect("import");
        (service, state.repositories.into_iter().next().unwrap())
    }

    #[test]
    fn opens_a_present_worktree_in_warp() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_scheme("warp");
        let (service, repository) = imported_repo(&env, warp(launcher.clone(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/open".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");

        let result = service.open_worktree(created.worktree.id).expect("open");
        assert_eq!(result.provider, crate::domain::TerminalProviderId::Warp);
        assert_eq!(
            launcher.opened(),
            vec![warp_directory_uri(
                &created.worktree.path,
                LaunchBehavior::Auto
            )]
        );
    }

    #[test]
    fn successful_open_records_last_used_at() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_scheme("warp");
        let (service, repository) = imported_repo(&env, warp(launcher, &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/recent".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");
        assert_eq!(created.worktree.last_used_at, None);
        let before = chrono::Utc::now();

        let result = service
            .open_worktree(created.worktree.id.clone())
            .expect("open");
        let used = result.last_used_at.expect("timestamp");
        assert!(used >= before);
        let record = crate::persistence::find_worktree_by_id(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("find")
        .expect("present");
        assert_eq!(record.last_used_at, Some(used));
        let listed = service.list_worktrees(record.repository_id).expect("list");
        let listed = listed
            .iter()
            .find(|item| item.id == created.worktree.id)
            .expect("listed");
        assert_eq!(listed.last_used_at, Some(used));
    }

    #[test]
    fn failed_open_does_not_record_last_used_at() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env, warp(FakeDesktopLauncher::default(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/no-use".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");

        service
            .open_worktree(created.worktree.id.clone())
            .expect_err("unavailable");
        let record = crate::persistence::find_worktree_by_id(
            service.db_connection_for_test(),
            &created.worktree.id,
        )
        .expect("find")
        .expect("present");
        assert_eq!(record.last_used_at, None);
    }

    #[test]
    fn missing_warp_returns_a_typed_unavailable_error() {
        let env = TempEnv::new();
        let (service, repository) = imported_repo(&env, warp(FakeDesktopLauncher::default(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/no-warp".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");

        let error = service
            .open_worktree(created.worktree.id)
            .expect_err("unavailable");
        assert!(matches!(error, ForestError::TerminalUnavailable(name) if name == "Warp"));
    }

    #[test]
    fn missing_worktree_directory_is_not_opened() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_scheme("warp");
        let (service, repository) = imported_repo(&env, warp(launcher.clone(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/gone".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");
        std::fs::remove_dir_all(&created.worktree.path).expect("remove");

        let error = service
            .open_worktree(created.worktree.id)
            .expect_err("missing");
        assert!(matches!(error, ForestError::WorktreeMissing));
        assert!(launcher.opened().is_empty());
    }

    #[test]
    fn a_broken_sibling_worktree_does_not_block_opening_a_healthy_one() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_scheme("warp");
        let (service, repository) = imported_repo(&env, warp(launcher.clone(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/healthy".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");
        // Reconciling the repository would inspect this worktree too and fail.
        std::fs::write(repository.path.join(".git/index"), "corrupt").expect("corrupt index");

        service.open_worktree(created.worktree.id).expect("open");
        assert_eq!(
            launcher.opened(),
            vec![warp_directory_uri(
                &created.worktree.path,
                LaunchBehavior::Auto
            )]
        );
    }

    #[test]
    fn unknown_worktree_is_not_found() {
        let env = TempEnv::new();
        let (service, _repository) =
            imported_repo(&env, warp(FakeDesktopLauncher::with_scheme("warp"), &env));
        let error = service
            .open_worktree(crate::domain::WorktreeId::from_string("missing"))
            .expect_err("unknown");
        assert!(matches!(error, ForestError::WorktreeNotFound));
    }

    #[test]
    fn window_launch_behavior_opens_a_new_window_uri() {
        let env = TempEnv::new();
        let launcher = FakeDesktopLauncher::with_scheme("warp");
        let (service, repository) = imported_repo(&env, warp(launcher.clone(), &env));
        let created = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/window".into(),
                name: None,
                copy_local_env_files: false,
            })
            .expect("create");
        let mut configuration = service.configuration().expect("config");
        configuration.launch_behavior = LaunchBehavior::Window;
        service.update_configuration(configuration).expect("update");

        service.open_worktree(created.worktree.id).expect("open");
        assert_eq!(
            launcher.opened(),
            vec![warp_directory_uri(
                &created.worktree.path,
                LaunchBehavior::Window
            )]
        );
    }
}
