use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::domain::{
    CommandError, CreateWorktreeInput, CreateWorktreePreview, CreateWorktreeResult, ForestError,
    RemovalBlocker, RemoveWorktreeResult, Repository, RepositoryId, Worktree, WorktreeId,
    WorktreeRemovalPreview,
};
use crate::git::refs::{branch_exists, resolve_commit, validate_branch_name, LocalBranch};
use crate::git::status::inspect_worktree_status;
use crate::git::worktree::{branch_checked_out, path_in_use, GitWorktree, WorktreeAddRequest};
use crate::persistence::{
    delete_worktree, find_by_id, find_by_repository_and_path, find_worktree_by_id,
    has_active_session, list_by_repository, upsert_worktree, WorktreeRecord,
};

use super::naming::{filename_safe, slugify, validate_slug};
use super::ForestService;

impl ForestService {
    pub fn list_worktrees(
        &self,
        repository_id: RepositoryId,
    ) -> Result<Vec<Worktree>, ForestError> {
        self.reconcile_worktrees(&self.require_repository(&repository_id)?)
    }

    pub fn refresh_worktrees(
        &self,
        repository_id: RepositoryId,
    ) -> Result<Vec<Worktree>, ForestError> {
        self.list_worktrees(repository_id)
    }

    pub fn list_local_branches(
        &self,
        repository_id: RepositoryId,
    ) -> Result<Vec<LocalBranch>, ForestError> {
        let repository = self.require_repository(&repository_id)?;
        crate::git::refs::list_local_branches(&self.git, &repository.path)
    }

    pub fn preview_create_worktree(
        &self,
        input: CreateWorktreeInput,
    ) -> Result<CreateWorktreePreview, ForestError> {
        let repository = self.require_repository(&input.repository_id)?;
        self.create_destination(&repository, &input)
    }

    pub fn create_worktree(
        &self,
        input: CreateWorktreeInput,
    ) -> Result<CreateWorktreeResult, ForestError> {
        let repository = self.require_repository(&input.repository_id)?;
        let preview = self.create_destination(&repository, &input)?;
        self.validate_create(&repository, &input, &preview.destination)?;

        if let Some(parent) = preview.destination.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let add_result = crate::git::worktree::add_worktree(
            &self.git,
            &repository.path,
            WorktreeAddRequest {
                path: &preview.destination,
                branch: input.branch.trim(),
                base: input.base_ref.trim(),
            },
        );
        if let Err(error) = add_result {
            if preview.destination.exists() {
                return Err(ForestError::GitCommandFailed(format!(
                    "{error}; filesystem residue remains at {}",
                    preview.destination.display()
                )));
            }
            return Err(error);
        }

        let worktrees = self.reconcile_worktrees(&repository)?;
        let worktree = worktrees
            .iter()
            .find(|item| item.path == preview.destination)
            .cloned()
            .ok_or(ForestError::WorktreeNotFound)?;
        Ok(CreateWorktreeResult {
            worktree,
            worktrees,
        })
    }

    pub fn worktree_removal_preview(
        &self,
        worktree_id: WorktreeId,
    ) -> Result<WorktreeRemovalPreview, ForestError> {
        self.reconcile_agent_sessions()?;
        let worktree = self.require_worktree_summary(&worktree_id)?;
        self.preview_from_worktree(&worktree)
    }

    pub fn remove_worktree(
        &self,
        worktree_id: WorktreeId,
        force: bool,
    ) -> Result<RemoveWorktreeResult, ForestError> {
        self.reconcile_agent_sessions()?;
        let worktree = self.require_worktree_summary(&worktree_id)?;
        let preview = self.preview_from_worktree(&worktree)?;
        let repository = self.require_repository(&worktree.repository_id)?;

        if !preview.allowed && !(force && preview.requires_force) {
            return Ok(RemoveWorktreeResult {
                removed: false,
                requires_force: preview.requires_force,
                blockers: preview.blockers,
                worktrees: self.reconcile_worktrees(&repository)?,
            });
        }

        if force {
            log::info!("force-removing worktree {}", worktree.id.as_str());
        }
        crate::git::worktree::remove_worktree(&self.git, &repository.path, &worktree.path, force)?;
        delete_worktree(self.db.connection(), &worktree.id)?;
        Ok(RemoveWorktreeResult {
            removed: true,
            requires_force: false,
            blockers: Vec::new(),
            worktrees: self.reconcile_worktrees(&repository)?,
        })
    }

    pub(super) fn require_repository(&self, id: &RepositoryId) -> Result<Repository, ForestError> {
        find_by_id(self.db.connection(), id)?.ok_or(ForestError::RepositoryNotFound)
    }

    /// Resolve the directory a launch should open without reconciling the
    /// repository.
    ///
    /// Reconciliation runs `git status` for every worktree of the repository,
    /// so an unrelated broken worktree would block a healthy one from opening
    /// and Quick Launch latency would grow with the tree count. A launch only
    /// needs the stored path and proof that it still exists on disk.
    pub(super) fn require_worktree_launch_path(
        &self,
        id: &WorktreeId,
    ) -> Result<PathBuf, ForestError> {
        let record =
            find_worktree_by_id(self.db.connection(), id)?.ok_or(ForestError::WorktreeNotFound)?;
        if !record.path.is_dir() {
            return Err(ForestError::WorktreeMissing);
        }
        Ok(record.path)
    }

    pub(super) fn require_worktree_summary(
        &self,
        id: &WorktreeId,
    ) -> Result<Worktree, ForestError> {
        let record =
            find_worktree_by_id(self.db.connection(), id)?.ok_or(ForestError::WorktreeNotFound)?;
        let repository = self.require_repository(&record.repository_id)?;
        self.reconcile_worktrees(&repository)?
            .into_iter()
            .find(|item| item.id == *id)
            .ok_or(ForestError::WorktreeNotFound)
    }

    fn create_destination(
        &self,
        repository: &Repository,
        input: &CreateWorktreeInput,
    ) -> Result<CreateWorktreePreview, ForestError> {
        let configuration = self.configuration()?;
        let source = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(input.branch.trim());
        let repository_slug = format!("{}-{}", slugify(&repository.name), repository.id.as_str());
        validate_slug(&repository_slug)?;
        let worktree_slug = filename_safe(source, configuration.worktree_naming_strategy);
        validate_slug(&worktree_slug)?;
        let destination = configuration
            .forest_root
            .join("worktrees")
            .join(&repository_slug)
            .join(&worktree_slug);
        if !destination.starts_with(configuration.forest_root.join("worktrees")) {
            return Err(ForestError::PathOutsideForest);
        }
        Ok(CreateWorktreePreview {
            destination,
            repository_slug,
            worktree_slug,
        })
    }

    fn validate_create(
        &self,
        repository: &Repository,
        input: &CreateWorktreeInput,
        destination: &Path,
    ) -> Result<(), ForestError> {
        crate::git::inspect_repository(&self.git, &repository.path)?;
        validate_branch_name(&self.git, &repository.path, input.branch.trim())?;
        resolve_commit(&self.git, &repository.path, input.base_ref.trim())?;
        if branch_exists(&self.git, &repository.path, input.branch.trim())? {
            return Err(ForestError::BranchAlreadyExists(
                input.branch.trim().to_owned(),
            ));
        }
        if destination.exists() {
            return Err(ForestError::WorktreePathUnavailable);
        }
        let git_worktrees = crate::git::worktree::list_worktrees(&self.git, &repository.path)?;
        if branch_checked_out(&git_worktrees, input.branch.trim())
            || path_in_use(&git_worktrees, destination)
        {
            return Err(ForestError::WorktreeAlreadyExists);
        }
        Ok(())
    }

    fn preview_from_worktree(
        &self,
        worktree: &Worktree,
    ) -> Result<WorktreeRemovalPreview, ForestError> {
        let mut blockers = Vec::new();
        if worktree.is_primary {
            blockers.push(RemovalBlocker::Primary);
        }
        if worktree.locked {
            blockers.push(RemovalBlocker::Locked);
        }
        if !worktree.present {
            blockers.push(RemovalBlocker::Missing);
        }
        if !worktree.git_known {
            blockers.push(RemovalBlocker::UnknownToGit);
        }
        if worktree.tracked_changes > 0 {
            blockers.push(RemovalBlocker::Dirty);
        }
        if worktree.untracked_files > 0 {
            blockers.push(RemovalBlocker::Untracked);
        }
        if worktree.status_error.is_some() {
            blockers.push(RemovalBlocker::StatusUnavailable);
        }
        if has_active_session(self.db.connection(), &worktree.id)? {
            blockers.push(RemovalBlocker::ActiveSession);
        }

        let forceable = [
            RemovalBlocker::Dirty,
            RemovalBlocker::Untracked,
            RemovalBlocker::ActiveSession,
        ];
        let hard = blockers.iter().any(|blocker| !forceable.contains(blocker));
        let requires_force = !blockers.is_empty() && !hard;
        Ok(WorktreeRemovalPreview {
            allowed: blockers.is_empty(),
            requires_force,
            blockers,
            worktree: worktree.clone(),
        })
    }

    pub(super) fn reconcile_worktrees(
        &self,
        repository: &Repository,
    ) -> Result<Vec<Worktree>, ForestError> {
        let git_worktrees = crate::git::worktree::list_worktrees(&self.git, &repository.path)?;
        let stored = list_by_repository(self.db.connection(), &repository.id)?;
        let mut leftover: HashMap<PathBuf, WorktreeRecord> = stored
            .into_iter()
            .map(|record| (canonicalize_or_clone(&record.path), record))
            .collect();
        let now = Utc::now();
        let mut summaries = Vec::new();

        for git_worktree in git_worktrees {
            let path = canonicalize_or_clone(&git_worktree.path);
            let existing = leftover
                .remove(&path)
                .or_else(|| leftover.remove(&git_worktree.path));
            let name = worktree_name(&path, git_worktree.branch.as_deref());
            let record = match existing {
                Some(mut record) => {
                    record.name = name;
                    record.path = path.clone();
                    record.branch = git_worktree.branch.clone();
                    record.updated_at = now;
                    record
                }
                None => WorktreeRecord {
                    id: WorktreeId::generate(),
                    repository_id: repository.id.clone(),
                    name,
                    path: path.clone(),
                    branch: git_worktree.branch.clone(),
                    created_at: now,
                    updated_at: now,
                    last_used_at: None,
                },
            };
            upsert_worktree(self.db.connection(), &record)?;
            let record =
                find_by_repository_and_path(self.db.connection(), &repository.id, &record.path)?
                    .unwrap_or(record);
            summaries.push(summarize(&record, Some(&git_worktree), &self.git));
        }

        for record in leftover.into_values() {
            summaries.push(stale_record_summary(record));
        }

        summaries.sort_by(|left, right| {
            right
                .is_primary
                .cmp(&left.is_primary)
                .then(left.name.cmp(&right.name))
                .then(left.path.cmp(&right.path))
        });
        Ok(summaries)
    }
}

fn canonicalize_or_clone(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn worktree_name(path: &Path, branch: Option<&str>) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| branch.map(slugify))
        .unwrap_or_else(|| "worktree".to_owned())
}

fn summarize(
    record: &WorktreeRecord,
    git_worktree: Option<&GitWorktree>,
    git: &crate::git::GitRunner,
) -> Worktree {
    let present = record.path.is_dir();
    let git_known = git_worktree.is_some();
    let is_primary = record.path.join(".git").is_dir();
    let mut summary = Worktree {
        id: record.id.clone(),
        repository_id: record.repository_id.clone(),
        name: record.name.clone(),
        path: record.path.clone(),
        branch: git_worktree
            .and_then(|item| item.branch.clone())
            .or_else(|| record.branch.clone()),
        head: git_worktree.and_then(|item| item.head.clone()),
        detached: git_worktree.is_some_and(|item| item.detached),
        locked: git_worktree.is_some_and(|item| item.locked),
        lock_reason: git_worktree.and_then(|item| item.lock_reason.clone()),
        prunable: git_worktree.is_some_and(|item| item.prunable),
        prunable_reason: git_worktree.and_then(|item| item.prunable_reason.clone()),
        present,
        git_known,
        is_primary,
        tracked_changes: 0,
        untracked_files: 0,
        ahead: None,
        behind: None,
        created_at: record.created_at,
        updated_at: record.updated_at,
        last_used_at: record.last_used_at,
        status_error: None,
    };

    if present && git_known {
        match inspect_worktree_status(git, &record.path) {
            Ok(status) => {
                if summary.branch.is_none() {
                    summary.branch = status.branch;
                }
                summary.detached = summary.detached || status.detached;
                summary.tracked_changes = status.tracked_changes;
                summary.untracked_files = status.untracked_files;
                summary.ahead = status.ahead;
                summary.behind = status.behind;
            }
            Err(error) => {
                log::warn!(
                    "worktree {} status unavailable: {}",
                    summary.id.as_str(),
                    error
                );
                summary.status_error = Some(CommandError::from(error));
            }
        }
    }
    summary
}

fn stale_record_summary(record: WorktreeRecord) -> Worktree {
    Worktree {
        id: record.id,
        repository_id: record.repository_id,
        name: record.name,
        path: record.path.clone(),
        branch: record.branch,
        head: None,
        detached: false,
        locked: false,
        lock_reason: None,
        prunable: false,
        prunable_reason: None,
        present: record.path.is_dir(),
        git_known: false,
        is_primary: false,
        tracked_changes: 0,
        untracked_files: 0,
        ahead: None,
        behind: None,
        created_at: record.created_at,
        updated_at: record.updated_at,
        last_used_at: record.last_used_at,
        status_error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service, TempEnv};
    use crate::domain::{CreateWorktreeInput, ForestError, RemovalBlocker};
    use crate::git::testing::{init_repository_at, run_git};
    use std::fs;

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
                branch: "feat/risk-483".into(),
                name: None,
            })
            .expect("create");

        assert_eq!(result.worktree.branch.as_deref(), Some("feat/risk-483"));
        assert!(result.worktree.path.ends_with(format!(
            "worktrees/demo-app-{}/feat-risk-483",
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
            })
            .expect_err("missing base");
        assert!(matches!(missing_base, ForestError::MissingRef(_)));

        let existing = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id.clone(),
                base_ref: "main".into(),
                branch: "main".into(),
                name: Some("other".into()),
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
        let launcher = crate::terminals::launcher::FakeDesktopLauncher::with_binaries(&[
            "warp-terminal",
            "codex",
        ])
        .and_scheme("warp");
        let terminals = crate::terminals::WarpProvider::new(
            Box::new(launcher),
            std::time::Duration::from_secs(30),
            env.root.join("tab_configs"),
        );
        let service = super::super::tests::open_service_with_processes(
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
            })
            .expect("first preview");
        let second_preview = service
            .preview_create_worktree(CreateWorktreeInput {
                repository_id: second.id.clone(),
                base_ref: "main".into(),
                branch: "feat/shared".into(),
                name: None,
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
    fn remove_requires_force_when_a_worktree_only_contains_ignored_files() {
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
            })
            .expect("create");
        fs::write(created.worktree.path.join(".env"), "SECRET=local\n").expect("ignored file");

        let preview = service
            .worktree_removal_preview(created.worktree.id)
            .expect("preview");
        assert!(!preview.allowed);
        assert!(preview.requires_force);
        assert!(preview.blockers.contains(&RemovalBlocker::Untracked));
        assert!(created.worktree.path.exists());
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
            })
            .expect("preview");
        fs::create_dir_all(&preview.destination).expect("occupy destination");

        let error = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/occupied".into(),
                name: None,
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
            })
            .expect("create");
        fs::remove_dir_all(&created.worktree.path).expect("remove directory");

        let error = service
            .create_worktree(CreateWorktreeInput {
                repository_id: repository.id,
                base_ref: "main".into(),
                branch: "feat/replacement".into(),
                name: Some("shared-slot".into()),
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
}
