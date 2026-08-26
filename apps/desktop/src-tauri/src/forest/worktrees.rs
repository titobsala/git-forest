use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::domain::{
    CommandError, CreateWorktreeInput, CreateWorktreePreview, CreateWorktreeResult, ForestError,
    RemovalBlocker, RemoveWorktreeResult, Repository, RepositoryId, Worktree, WorktreeId,
    WorktreeRemovalPreview,
};
use crate::git::refs::{
    branch_exists, is_remote_tracking_base, resolve_commit, validate_branch_name,
};
use crate::git::status::inspect_worktree_status;
use crate::git::worktree::{branch_checked_out, path_in_use, GitWorktree, WorktreeAddRequest};
use crate::git::BranchCatalog;
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

    pub fn list_branch_catalog(
        &self,
        repository_id: RepositoryId,
    ) -> Result<BranchCatalog, ForestError> {
        let repository = self.require_repository(&repository_id)?;
        crate::git::refs::list_branch_catalog(&self.git, &repository.path)
    }

    pub(crate) fn branch_catalog_repository_path(
        &self,
        repository_id: RepositoryId,
    ) -> Result<PathBuf, ForestError> {
        Ok(self.require_repository(&repository_id)?.path)
    }

    pub fn fetch_branch_catalog(
        &self,
        repository_id: RepositoryId,
    ) -> Result<BranchCatalog, ForestError> {
        let repository = self.require_repository(&repository_id)?;
        crate::git::refs::fetch_branch_catalog(&self.git, &repository.path)
    }

    pub fn preview_create_worktree(
        &self,
        input: CreateWorktreeInput,
    ) -> Result<CreateWorktreePreview, ForestError> {
        let repository = self.require_repository(&input.repository_id)?;
        let mut preview = self.create_destination(&repository, &input)?;
        preview.local_env_files =
            super::worktree_seeds::discover_environment_files(&self.git, &repository.path)?;
        Ok(preview)
    }

    pub fn create_worktree(
        &self,
        input: CreateWorktreeInput,
    ) -> Result<CreateWorktreeResult, ForestError> {
        let repository = self.require_repository(&input.repository_id)?;
        let preview = self.create_destination(&repository, &input)?;
        self.validate_create(&repository, &input, &preview.destination)?;

        let candidates = if input.copy_local_env_files {
            super::worktree_seeds::discover_environment_files(&self.git, &repository.path)?
        } else {
            Vec::new()
        };

        if let Some(parent) = preview.destination.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let base = input.base_ref.trim();
        let track = is_remote_tracking_base(&self.git, &repository.path, base)?;
        let add_result = crate::git::worktree::add_worktree(
            &self.git,
            &repository.path,
            WorktreeAddRequest {
                path: &preview.destination,
                branch: input.branch.trim(),
                base,
                track,
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

        let local_env_copy = super::worktree_seeds::copy_environment_files(
            &repository.path,
            &preview.destination,
            &candidates,
        );

        let worktrees = self.reconcile_worktrees(&repository)?;
        let worktree = worktrees
            .iter()
            .find(|item| item.path == preview.destination)
            .cloned()
            .ok_or(ForestError::WorktreeNotFound)?;
        Ok(CreateWorktreeResult {
            worktree,
            worktrees,
            local_env_copy,
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
            local_env_files: Vec::new(),
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
        ignored_files: 0,
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
                summary.ignored_files = status.ignored_files;
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
        ignored_files: 0,
        ahead: None,
        behind: None,
        created_at: record.created_at,
        updated_at: record.updated_at,
        last_used_at: record.last_used_at,
        status_error: None,
    }
}
