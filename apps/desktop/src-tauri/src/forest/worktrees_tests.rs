use super::tests::{open_service, TempEnv};
use crate::domain::{CreateWorktreeInput, ForestError, RemovalBlocker};
use crate::git::testing::{init_repository_at, run_git};
use std::fs;
use std::os::unix::fs::PermissionsExt;

fn imported_repo(env: &TempEnv) -> (crate::forest::ForestService, crate::domain::Repository) {
    let service = open_service(env);
    let repo_path = env.root.join("linked");
    init_repository_at(&repo_path);
    run_git(&repo_path, &["commit", "--allow-empty", "-m", "initial"]);
    let state = service
        .import_repository(Some("Demo App".into()), repo_path)
        .expect("import");
    (service, state.repositories.into_iter().next().unwrap())
}

#[test]
fn lists_primary_and_external_worktrees() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let extra = env.root.join("external-tree");
    run_git(
        &repository.path,
        &[
            "worktree",
            "add",
            "-b",
            "feat/external",
            extra.to_str().unwrap(),
            "main",
        ],
    );

    let worktrees = service.list_worktrees(repository.id.clone()).expect("list");
    assert!(worktrees
        .iter()
        .any(|item| item.is_primary && item.branch.as_deref() == Some("main")));
    assert!(worktrees.iter().any(|item| {
        item.branch.as_deref() == Some("feat/external") && item.git_known && item.present
    }));
}

#[test]
fn creates_a_new_branch_worktree_under_the_managed_root() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let result = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/auth-142".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");

    assert_eq!(result.worktree.branch.as_deref(), Some("feat/auth-142"));
    assert!(result.worktree.path.ends_with(format!(
        "worktrees/demo-app-{}/feat-auth-142",
        repository.id.as_str()
    )));
    assert!(result.worktree.path.is_dir());
    assert!(!result.worktree.is_primary);
    assert_eq!(result.worktree.tracked_changes, 0);
}

#[test]
fn create_rejects_existing_branch_and_missing_base() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let missing_base = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "no-such".into(),
            branch: "feat/new".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect_err("missing base");
    assert!(matches!(missing_base, ForestError::MissingRef(_)));

    let existing = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "main".into(),
            name: Some("other".into()),
            copy_local_env_files: false,
        })
        .expect_err("exists");
    assert!(matches!(existing, ForestError::BranchAlreadyExists(_)));
}

#[test]
fn remove_requires_force_for_dirty_worktrees_and_keeps_the_branch() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/dirty".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::write(created.worktree.path.join("notes.txt"), "dirty\n").expect("dirty");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(!preview.allowed);
    assert!(preview.requires_force);
    assert!(preview.blockers.contains(&RemovalBlocker::Untracked));

    let blocked = service
        .remove_worktree(created.worktree.id.clone(), false)
        .expect("blocked");
    assert!(!blocked.removed);
    assert!(created.worktree.path.exists());

    let forced = service
        .remove_worktree(created.worktree.id.clone(), true)
        .expect("force");
    assert!(forced.removed);
    assert!(!created.worktree.path.exists());
    let branches = crate::git::testing::isolated_git(&repository.path)
        .args(["branch", "--list", "feat/dirty"])
        .output()
        .expect("branch");
    assert!(String::from_utf8_lossy(&branches.stdout).contains("feat/dirty"));
}

#[test]
fn primary_and_locked_worktrees_cannot_be_removed() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let worktrees = service.list_worktrees(repository.id.clone()).expect("list");
    let primary = worktrees
        .iter()
        .find(|item| item.is_primary)
        .expect("primary");
    let preview = service
        .worktree_removal_preview(primary.id.clone())
        .expect("preview");
    assert!(preview.blockers.contains(&RemovalBlocker::Primary));
    assert!(!preview.requires_force);

    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/locked".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    crate::git::worktree::lock_worktree(
        &crate::git::GitRunner::new(),
        &repository.path,
        &created.worktree.path,
        "busy",
    )
    .expect("lock");
    let locked = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("locked preview");
    assert!(locked.blockers.contains(&RemovalBlocker::Locked));
    let result = service
        .remove_worktree(created.worktree.id.clone(), true)
        .expect("still blocked");
    assert!(!result.removed);
}

#[test]
fn missing_stored_worktree_is_surfaced_not_deleted() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let now = chrono::Utc::now();
    crate::persistence::upsert_worktree(
        service.db_connection_for_test(),
        &crate::persistence::WorktreeRecord {
            id: crate::domain::WorktreeId::from_string("ghost"),
            repository_id: repository.id.clone(),
            name: "ghost".into(),
            path: env.root.join("ghost"),
            branch: Some("feat/ghost".into()),
            created_at: now,
            updated_at: now,
            last_used_at: None,
        },
    )
    .expect("insert ghost");

    let worktrees = service.list_worktrees(repository.id.clone()).expect("list");
    let ghost = worktrees
        .iter()
        .find(|item| item.name == "ghost")
        .expect("ghost");
    assert!(!ghost.present);
    assert!(!ghost.git_known);

    fs::create_dir_all(env.root.join("ghost")).expect("present unknown dir");
    let worktrees = service
        .list_worktrees(repository.id)
        .expect("list present unknown");
    let ghost = worktrees
        .iter()
        .find(|item| item.name == "ghost")
        .expect("ghost present");
    assert!(ghost.present);
    assert!(!ghost.git_known);
    let preview = service
        .worktree_removal_preview(ghost.id.clone())
        .expect("blocked unknown");
    assert!(preview.blockers.contains(&RemovalBlocker::UnknownToGit));
    assert!(!preview.requires_force);
}

#[test]
fn active_session_blocks_removal() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/session".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    service
        .db_connection_for_test()
        .execute(
            "INSERT INTO agent_sessions (id, worktree_id, agent_definition_id, status)
             VALUES ('session-1', ?1, 'codex', 'running')",
            [created.worktree.id.as_str()],
        )
        .expect("session");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(preview.blockers.contains(&RemovalBlocker::ActiveSession));
    assert!(preview.requires_force);
}

#[test]
fn exited_session_does_not_block_removal() {
    let env = TempEnv::new();
    let inspector = crate::processes::fake::FakeProcessInspector::new();
    let launcher =
        crate::terminals::launcher::FakeDesktopLauncher::with_binaries(&["warp-terminal", "codex"])
            .and_scheme("warp");
    let terminals = crate::terminals::WarpProvider::new(
        Box::new(launcher),
        std::time::Duration::from_secs(30),
        env.root.join("tab_configs"),
    );
    let service = super::tests::open_service_with_processes(
        &env,
        terminals,
        Box::new(
            crate::terminals::launcher::FakeDesktopLauncher::with_binaries(&[
                "warp-terminal",
                "codex",
            ]),
        ),
        Box::new(inspector),
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
            branch: "feat/exited-session".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    service
        .db_connection_for_test()
        .execute(
            "INSERT INTO agent_sessions (id, worktree_id, agent_definition_id, status, pid, process_start_ticks)
             VALUES ('session-gone', ?1, 'codex', 'running', 4242, 99)",
            [created.worktree.id.as_str()],
        )
        .expect("session");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(!preview.blockers.contains(&RemovalBlocker::ActiveSession));
}

#[test]
fn repository_identity_separates_same_named_worktree_namespaces() {
    let env = TempEnv::new();
    let (service, first) = imported_repo(&env);
    let second_path = env.root.join("linked-second");
    init_repository_at(&second_path);
    run_git(&second_path, &["commit", "--allow-empty", "-m", "initial"]);
    let second = service
        .import_repository(Some("Demo App".into()), second_path)
        .expect("import second")
        .repositories
        .into_iter()
        .find(|repository| repository.id != first.id)
        .expect("second repository");

    let first_preview = service
        .preview_create_worktree(CreateWorktreeInput {
            repository_id: first.id.clone(),
            base_ref: "main".into(),
            branch: "feat/shared".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("first preview");
    let second_preview = service
        .preview_create_worktree(CreateWorktreeInput {
            repository_id: second.id.clone(),
            base_ref: "main".into(),
            branch: "feat/shared".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("second preview");

    assert_ne!(
        first_preview.repository_slug,
        second_preview.repository_slug
    );
    assert_ne!(first_preview.destination, second_preview.destination);
    assert!(first_preview.repository_slug.ends_with(first.id.as_str()));
    assert!(second_preview.repository_slug.ends_with(second.id.as_str()));
}

#[test]
fn ignored_only_worktrees_can_be_removed_without_force() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join(".gitignore"), ".env\n").expect("gitignore");
    run_git(&repository.path, &["add", ".gitignore"]);
    run_git(
        &repository.path,
        &["commit", "-m", "ignore local environment"],
    );
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/ignored".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::write(created.worktree.path.join(".env"), "SECRET=local\n").expect("ignored file");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(preview.allowed);
    assert!(!preview.requires_force);
    assert!(preview.blockers.is_empty());
    assert_eq!(preview.worktree.ignored_files, 1);
    assert_eq!(preview.worktree.untracked_files, 0);
    assert!(!preview.worktree.is_dirty());

    let removed = service
        .remove_worktree(created.worktree.id.clone(), false)
        .expect("remove");
    assert!(removed.removed);
    assert!(!created.worktree.path.exists());
}

#[test]
fn status_failures_are_isolated_during_reconciliation() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join(".git/index"), "corrupt").expect("corrupt index");

    let worktrees = service
        .list_worktrees(repository.id)
        .expect("isolated status failure");
    let primary = worktrees
        .iter()
        .find(|item| item.is_primary)
        .expect("primary");
    assert!(primary.status_error.is_some());
    assert_eq!(
        primary.status_error.as_ref().unwrap().code,
        "git_command_failed"
    );
    let preview = service
        .worktree_removal_preview(primary.id.clone())
        .expect("preview");
    assert!(preview
        .blockers
        .contains(&RemovalBlocker::StatusUnavailable));
    assert!(!preview.requires_force);
}

#[test]
fn one_corrupt_worktree_does_not_hide_a_healthy_worktree() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/healthy".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::write(repository.path.join(".git/index"), "corrupt").expect("corrupt primary index");

    let worktrees = service
        .list_worktrees(repository.id)
        .expect("both worktrees");
    let primary = worktrees
        .iter()
        .find(|item| item.is_primary)
        .expect("primary");
    let healthy = worktrees
        .iter()
        .find(|item| item.id == created.worktree.id)
        .expect("healthy");
    assert!(primary.status_error.is_some());
    assert_eq!(
        primary.status_error.as_ref().unwrap().code,
        "git_command_failed"
    );
    assert!(healthy.status_error.is_none());
    assert!(healthy.present);
    assert!(healthy.git_known);
}

#[test]
fn lists_a_detached_worktree() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/detached".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    run_git(&created.worktree.path, &["checkout", "--detach"]);

    let worktrees = service.list_worktrees(repository.id).expect("list");
    let detached = worktrees
        .iter()
        .find(|item| item.id == created.worktree.id)
        .expect("detached");
    assert!(detached.detached);
    assert!(detached.present);
    assert!(detached.git_known);
}

#[test]
fn git_known_missing_directory_is_surfaced_and_blocked_from_removal() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/missing-dir".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::remove_dir_all(&created.worktree.path).expect("remove directory");

    let worktrees = service.list_worktrees(repository.id).expect("list");
    let missing = worktrees
        .iter()
        .find(|item| item.id == created.worktree.id)
        .expect("missing");
    assert!(!missing.present);
    assert!(missing.git_known);

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(preview.blockers.contains(&RemovalBlocker::Missing));
    assert!(!preview.requires_force);
    let result = service
        .remove_worktree(created.worktree.id, true)
        .expect("still blocked");
    assert!(!result.removed);
}

#[test]
fn create_rejects_an_occupied_destination_path() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let preview = service
        .preview_create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/occupied".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("preview");
    fs::create_dir_all(&preview.destination).expect("occupy destination");

    let error = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/occupied".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect_err("occupied");
    assert!(matches!(error, ForestError::WorktreePathUnavailable));
}

#[test]
fn create_rejects_a_stale_git_worktree_occupying_the_destination() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/stale-slot".into(),
            name: Some("shared-slot".into()),
            copy_local_env_files: false,
        })
        .expect("create");
    fs::remove_dir_all(&created.worktree.path).expect("remove directory");

    let error = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/replacement".into(),
            name: Some("shared-slot".into()),
            copy_local_env_files: false,
        })
        .expect_err("stale occupancy");
    assert!(matches!(error, ForestError::WorktreeAlreadyExists));
}

#[test]
fn remove_requires_force_for_tracked_dirty_worktrees() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join("tracked.txt"), "original\n").expect("write");
    run_git(&repository.path, &["add", "tracked.txt"]);
    run_git(&repository.path, &["commit", "-m", "add tracked file"]);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/tracked-dirty".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::write(created.worktree.path.join("tracked.txt"), "changed\n").expect("dirty");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(!preview.allowed);
    assert!(preview.requires_force);
    assert!(preview.blockers.contains(&RemovalBlocker::Dirty));

    let blocked = service
        .remove_worktree(created.worktree.id.clone(), false)
        .expect("blocked");
    assert!(!blocked.removed);
    assert!(created.worktree.path.exists());
}

#[test]
fn removes_a_clean_created_worktree_and_keeps_the_branch() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/clean".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(preview.allowed);
    assert!(!preview.requires_force);

    let removed = service
        .remove_worktree(created.worktree.id.clone(), false)
        .expect("remove");
    assert!(removed.removed);
    assert!(!created.worktree.path.exists());
    assert!(!removed
        .worktrees
        .iter()
        .any(|item| item.id == created.worktree.id));
    let branches = crate::git::testing::isolated_git(&repository.path)
        .args(["branch", "--list", "feat/clean"])
        .output()
        .expect("branch");
    assert!(String::from_utf8_lossy(&branches.stdout).contains("feat/clean"));
}

fn seed_copy_candidates(repo: &std::path::Path) {
    fs::write(repo.join(".gitignore"), ".env*\n").expect("gitignore");
    run_git(repo, &["add", ".gitignore"]);
    run_git(repo, &["commit", "-m", "ignore local environment"]);
    fs::write(repo.join(".env"), "SECRET=root\n").expect(".env");
    fs::write(repo.join(".env.local"), "SECRET=local\n").expect(".env.local");
}

#[test]
fn preview_discovers_an_ignored_root_env_without_creating_the_worktree() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join(".gitignore"), ".env\n").expect("gitignore");
    run_git(&repository.path, &["add", ".gitignore"]);
    run_git(
        &repository.path,
        &["commit", "-m", "ignore local environment"],
    );
    fs::write(repository.path.join(".env"), "SECRET=root\n").expect(".env");

    let preview = service
        .preview_create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/seed-preview".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("preview");
    assert_eq!(
        preview
            .local_env_files
            .iter()
            .map(|item| item.path.as_str())
            .collect::<Vec<_>>(),
        vec![".env"]
    );
    assert_eq!(preview.local_env_files[0].size_bytes, 12);
    assert!(!preview.destination.exists());
}

#[test]
fn create_copies_local_env_files_when_enabled_and_skips_when_disabled() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    seed_copy_candidates(&repository.path);

    let copied = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/seed-on".into(),
            name: None,
            copy_local_env_files: true,
        })
        .expect("copy on");
    assert_eq!(
        copied.local_env_copy.copied,
        vec![".env".to_owned(), ".env.local".to_owned()]
    );
    assert!(copied.local_env_copy.failures.is_empty());
    assert_eq!(
        fs::read_to_string(copied.worktree.path.join(".env")).expect("copied env"),
        "SECRET=root\n"
    );
    assert_eq!(
        fs::read_to_string(copied.worktree.path.join(".env.local")).expect("copied local"),
        "SECRET=local\n"
    );
    assert_eq!(copied.worktree.ignored_files, 2);
    assert_eq!(copied.worktree.untracked_files, 0);
    assert!(!copied.worktree.is_dirty());

    fs::write(copied.worktree.path.join(".env"), "SECRET=worktree\n").expect("independent edit");
    assert_eq!(
        fs::read_to_string(repository.path.join(".env")).expect("root unchanged"),
        "SECRET=root\n"
    );

    let skipped = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/seed-off".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("copy off");
    assert!(skipped.local_env_copy.copied.is_empty());
    assert!(skipped.local_env_copy.failures.is_empty());
    assert!(!skipped.worktree.path.join(".env").exists());
    assert_eq!(skipped.worktree.ignored_files, 0);
}

#[test]
fn create_returns_structured_copy_failure_without_failing_the_command() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join(".gitignore"), ".env\n").expect("gitignore");
    run_git(&repository.path, &["add", ".gitignore"]);
    run_git(
        &repository.path,
        &["commit", "-m", "ignore local environment"],
    );
    let source = repository.path.join(".env");
    fs::write(&source, "SECRET=hidden\n").expect("env");
    fs::set_permissions(&source, std::fs::Permissions::from_mode(0o000)).expect("chmod");

    let result = service.create_worktree(CreateWorktreeInput {
        repository_id: repository.id.clone(),
        base_ref: "main".into(),
        branch: "feat/seed-fail".into(),
        name: None,
        copy_local_env_files: true,
    });
    fs::set_permissions(&source, std::fs::Permissions::from_mode(0o644)).expect("restore");
    let created = result.expect("create still succeeds");
    assert!(created.worktree.path.is_dir());
    assert!(created.local_env_copy.copied.is_empty());
    assert_eq!(created.local_env_copy.failures.len(), 1);
    assert_eq!(created.local_env_copy.failures[0].path, ".env");
    assert_eq!(created.local_env_copy.failures[0].error.code, "io");
    assert!(!created.worktree.path.join(".env").exists());
}

#[test]
fn create_reports_structured_failure_when_a_discovered_candidate_is_invalidated() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join(".gitignore"), ".env\n").expect("gitignore");
    run_git(&repository.path, &["add", ".gitignore"]);
    run_git(
        &repository.path,
        &["commit", "-m", "ignore local environment"],
    );
    let source = repository.path.join(".env");
    fs::write(&source, "SECRET=root\n").expect(".env");

    let hooks = repository.path.join(".git/hooks");
    let quoted = format!(
        "'{}'",
        source.to_str().expect("utf8").replace('\'', "'\\''")
    );
    fs::write(
        hooks.join("post-checkout"),
        format!("#!/bin/sh\nrm -f {quoted}\nln -s /tmp/secret {quoted}\n"),
    )
    .expect("hook");
    fs::set_permissions(
        hooks.join("post-checkout"),
        fs::Permissions::from_mode(0o755),
    )
    .expect("chmod hook");
    run_git(
        &repository.path,
        &[
            "config",
            "core.hooksPath",
            hooks.to_str().expect("utf8 hooks"),
        ],
    );

    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/seed-stale".into(),
            name: None,
            copy_local_env_files: true,
        })
        .expect("create still succeeds");
    assert!(created.worktree.path.is_dir());
    assert!(created.local_env_copy.copied.is_empty());
    assert_eq!(created.local_env_copy.failures.len(), 1);
    assert_eq!(created.local_env_copy.failures[0].path, ".env");
    assert_eq!(
        created.local_env_copy.failures[0].error.message,
        "source is not a regular file"
    );
    assert!(!created.worktree.path.join(".env").exists());
}

#[test]
fn untracked_files_still_require_force_removal() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id,
            base_ref: "main".into(),
            branch: "feat/untracked".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");
    fs::write(created.worktree.path.join("notes.txt"), "new\n").expect("untracked");

    let preview = service
        .worktree_removal_preview(created.worktree.id.clone())
        .expect("preview");
    assert!(!preview.allowed);
    assert!(preview.requires_force);
    assert!(preview.blockers.contains(&RemovalBlocker::Untracked));
    assert_eq!(preview.worktree.untracked_files, 1);
    assert_eq!(preview.worktree.ignored_files, 0);
}

fn push_remote_feature(env: &TempEnv, repo: &std::path::Path, branch: &str) {
    let origin = env.root.join("origin.git");
    run_git(
        &env.root,
        &[
            "clone",
            "--bare",
            repo.to_str().expect("utf-8 repo"),
            origin.to_str().expect("utf-8 origin"),
        ],
    );
    run_git(
        repo,
        &[
            "remote",
            "add",
            "origin",
            origin.to_str().expect("utf-8 origin"),
        ],
    );
    run_git(repo, &["fetch", "origin"]);
    let pusher = env.root.join("pusher");
    run_git(
        &env.root,
        &[
            "clone",
            origin.to_str().expect("utf-8 origin"),
            pusher.to_str().expect("utf-8 pusher"),
        ],
    );
    run_git(&pusher, &["checkout", "-b", branch]);
    fs::write(pusher.join("feature.txt"), "from remote\n").expect("feature file");
    run_git(&pusher, &["add", "feature.txt"]);
    run_git(&pusher, &["commit", "-m", "remote feature"]);
    run_git(&pusher, &["push", "-u", "origin", branch]);
}

fn upstream_of(repo: &std::path::Path, branch: &str) -> Option<String> {
    let output = crate::git::testing::isolated_git(repo)
        .args([
            "rev-parse",
            "--abbrev-ref",
            &format!("{branch}@{{upstream}}"),
        ])
        .output()
        .expect("upstream");
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    } else {
        None
    }
}

#[test]
fn creating_from_a_remote_ref_configures_upstream_tracking() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    push_remote_feature(&env, &repository.path, "feat/example");
    service
        .fetch_branch_catalog(repository.id.clone())
        .expect("fetch");

    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "refs/remotes/origin/feat/example".into(),
            branch: "feat/example".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create from remote");

    assert_eq!(created.worktree.branch.as_deref(), Some("feat/example"));
    assert_eq!(
        upstream_of(&repository.path, "feat/example").as_deref(),
        Some("origin/feat/example")
    );
}

#[test]
fn creating_from_a_local_base_does_not_configure_upstream() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let created = service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "main".into(),
            branch: "feat/local".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create from local");
    assert_eq!(created.worktree.branch.as_deref(), Some("feat/local"));
    assert!(upstream_of(&repository.path, "feat/local").is_none());
}

#[test]
fn arbitrary_commit_ish_does_not_enable_tracking() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    push_remote_feature(&env, &repository.path, "feat/example");
    service
        .fetch_branch_catalog(repository.id.clone())
        .expect("fetch");
    let sha = crate::git::refs::resolve_commit(
        &crate::git::GitRunner::new(),
        &repository.path,
        "refs/remotes/origin/feat/example",
    )
    .expect("sha");

    service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: sha,
            branch: "feat/from-sha".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create from sha");
    assert!(upstream_of(&repository.path, "feat/from-sha").is_none());
}

#[test]
fn fetch_and_remote_create_leave_dirty_primary_checkout_unchanged() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    fs::write(repository.path.join("tracked.txt"), "clean\n").expect("tracked");
    run_git(&repository.path, &["add", "tracked.txt"]);
    run_git(&repository.path, &["commit", "-m", "add tracked"]);
    push_remote_feature(&env, &repository.path, "feat/example");
    fs::write(repository.path.join("tracked.txt"), "dirty-bytes\n").expect("dirty");
    fs::write(repository.path.join("untracked.txt"), "untracked-bytes\n").expect("untracked");
    let dirty = fs::read(repository.path.join("tracked.txt")).expect("read dirty");
    let untracked = fs::read(repository.path.join("untracked.txt")).expect("read untracked");

    service
        .fetch_branch_catalog(repository.id.clone())
        .expect("fetch");
    service
        .create_worktree(CreateWorktreeInput {
            repository_id: repository.id.clone(),
            base_ref: "refs/remotes/origin/feat/example".into(),
            branch: "feat/example".into(),
            name: None,
            copy_local_env_files: false,
        })
        .expect("create");

    assert_eq!(
        fs::read(repository.path.join("tracked.txt")).expect("dirty after"),
        dirty
    );
    assert_eq!(
        fs::read(repository.path.join("untracked.txt")).expect("untracked after"),
        untracked
    );
}

#[test]
fn failed_fetch_returns_a_structured_error_and_does_not_create_a_worktree() {
    let env = TempEnv::new();
    let (service, repository) = imported_repo(&env);
    let missing = env.root.join("missing.git");
    run_git(
        &repository.path,
        &[
            "remote",
            "add",
            "origin",
            missing.to_str().expect("utf-8 missing"),
        ],
    );
    let before = service
        .list_worktrees(repository.id.clone())
        .expect("before");
    let error = service
        .fetch_branch_catalog(repository.id.clone())
        .expect_err("fetch");
    assert!(matches!(error, ForestError::GitCommandFailed(_)));
    let after = service
        .list_worktrees(repository.id.clone())
        .expect("after");
    assert_eq!(before.len(), after.len());
    assert_eq!(after.len(), 1);
    assert!(after[0].is_primary);
}
