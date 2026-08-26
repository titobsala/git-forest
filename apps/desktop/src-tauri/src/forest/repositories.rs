use std::path::PathBuf;

use chrono::Utc;

use crate::domain::{
    CommandError, ForestError, ForestState, ImportFailure, ImportRepositoriesResult, ImportSkip,
    Repository, RepositoryHealth, RepositoryId, RepositoryMode,
};
use crate::git::repository::RepositoryInspection;
use crate::git::{display_name, inspect_repository};
use crate::persistence::{
    delete_by_id, find_by_id, find_by_path, find_by_repository_and_path, insert_repository,
    update_repository, update_worktree_path,
};

use super::ForestService;

impl ForestService {
    pub fn import_repository(
        &self,
        name: Option<String>,
        path: PathBuf,
    ) -> Result<ForestState, ForestError> {
        self.persist_import(self.prepare_import(name, path)?)?;
        self.state()
    }

    pub fn import_repositories(
        &self,
        paths: Vec<PathBuf>,
    ) -> Result<ImportRepositoriesResult, ForestError> {
        let mut imported = Vec::new();
        let mut skipped = Vec::new();
        let mut failed = Vec::new();
        let tx = self.db.connection().unchecked_transaction()?;

        for path in paths {
            match self.prepare_import(None, path.clone()) {
                Ok(repository) => {
                    if find_by_path(&tx, &repository.path)?.is_some() {
                        skipped.push(ImportSkip {
                            path: repository.path,
                            reason: "already_indexed".to_owned(),
                        });
                        continue;
                    }
                    insert_repository(&tx, &repository)?;
                    imported.push(repository);
                }
                Err(ForestError::DuplicatePath) => skipped.push(ImportSkip {
                    path: self.platform.expand_user_path(path),
                    reason: "already_indexed".to_owned(),
                }),
                Err(error) => {
                    let command = CommandError::from(error);
                    failed.push(ImportFailure {
                        path,
                        code: command.code,
                        message: command.message,
                    });
                }
            }
        }

        tx.commit()?;
        Ok(ImportRepositoriesResult {
            imported,
            skipped,
            failed,
            state: self.state()?,
        })
    }

    pub fn refresh_repository(&self, id: RepositoryId) -> Result<ForestState, ForestError> {
        let repository =
            find_by_id(self.db.connection(), &id)?.ok_or(ForestError::RepositoryNotFound)?;
        self.reconcile_one_repository(repository)?;
        self.state()
    }

    pub fn reconcile_repositories(&self) -> Result<ForestState, ForestError> {
        let repositories = crate::persistence::list_repositories(self.db.connection())?;
        for repository in repositories {
            let id = repository.id.clone();
            let previous = repository.health;
            let updated = self.reconcile_one_repository(repository)?;
            if updated.health != previous {
                log::info!(
                    "repository {} health {} -> {}",
                    id.as_str(),
                    previous.as_str(),
                    updated.health.as_str()
                );
            }
        }
        self.state()
    }

    pub fn relocate_repository(
        &self,
        id: RepositoryId,
        path: PathBuf,
    ) -> Result<ForestState, ForestError> {
        let repository =
            find_by_id(self.db.connection(), &id)?.ok_or(ForestError::RepositoryNotFound)?;
        let expanded = self.platform.expand_user_path(path);
        if !expanded.is_absolute() {
            return Err(ForestError::PathNotAbsolute);
        }
        if !expanded.is_dir() {
            return Err(ForestError::PathNotDirectory);
        }

        let inspection = inspect_repository(&self.git, &expanded)?;
        if let Some(other) = find_by_path(self.db.connection(), &inspection.root)? {
            if other.id != id {
                return Err(ForestError::DuplicatePath);
            }
        }

        let updated = self.apply_root_relocation(&repository, inspection)?;
        log::info!("repository {} relocated", updated.id.as_str());
        self.reconcile_worktrees(&updated)?;
        self.state()
    }

    pub fn remove_repository(&self, id: RepositoryId) -> Result<ForestState, ForestError> {
        if !delete_by_id(self.db.connection(), &id)? {
            return Err(ForestError::RepositoryNotFound);
        }
        self.state()
    }

    pub fn expand_user_path(&self, path: PathBuf) -> PathBuf {
        self.platform.expand_user_path(path)
    }

    pub fn git_runner(&self) -> crate::git::GitRunner {
        self.git.clone()
    }

    #[cfg(test)]
    pub(crate) fn db_connection_for_test(&self) -> &rusqlite::Connection {
        self.db.connection()
    }

    pub fn indexed_paths(&self) -> Result<Vec<PathBuf>, ForestError> {
        Ok(self
            .list_repositories()?
            .into_iter()
            .map(|repository| repository.path)
            .collect())
    }

    fn prepare_import(
        &self,
        name: Option<String>,
        path: PathBuf,
    ) -> Result<Repository, ForestError> {
        let expanded = self.platform.expand_user_path(path);
        if !expanded.is_absolute() {
            return Err(ForestError::PathNotAbsolute);
        }
        if !expanded.is_dir() {
            return Err(ForestError::PathNotDirectory);
        }

        let inspection = inspect_repository(&self.git, &expanded)?;
        if find_by_path(self.db.connection(), &inspection.root)?.is_some() {
            return Err(ForestError::DuplicatePath);
        }

        let name = normalized_name(name).unwrap_or_else(|| display_name(&inspection.root));
        if name.is_empty() {
            return Err(ForestError::EmptyName);
        }

        let now = Utc::now();
        Ok(Repository {
            id: RepositoryId::generate(),
            name,
            path: inspection.root,
            mode: RepositoryMode::Linked,
            primary_branch: inspection.primary_branch,
            remote_url: inspection.remote_url,
            last_refreshed_at: Some(now),
            health: RepositoryHealth::Available,
            health_detail: None,
            last_reconciled_at: Some(now),
            created_at: now,
            updated_at: now,
        })
    }

    fn persist_import(&self, repository: Repository) -> Result<(), ForestError> {
        insert_repository(self.db.connection(), &repository)
    }

    fn reconcile_one_repository(
        &self,
        mut repository: Repository,
    ) -> Result<Repository, ForestError> {
        let now = Utc::now();
        let expanded = self.platform.expand_user_path(repository.path.clone());
        if !expanded.is_dir() {
            repository.health = RepositoryHealth::Missing;
            repository.health_detail = Some("Missing or moved".to_owned());
            repository.last_reconciled_at = Some(now);
            repository.updated_at = now;
            update_repository(self.db.connection(), &repository)?;
            return Ok(repository);
        }

        match inspect_repository(&self.git, &expanded) {
            Ok(inspection) => {
                if inspection.root != repository.path {
                    if let Some(other) = find_by_path(self.db.connection(), &inspection.root)? {
                        if other.id != repository.id {
                            repository.health = RepositoryHealth::Unavailable;
                            repository.health_detail = Some(
                                "canonical root is already indexed by another repository"
                                    .to_owned(),
                            );
                            repository.last_reconciled_at = Some(now);
                            repository.updated_at = now;
                            update_repository(self.db.connection(), &repository)?;
                            return Ok(repository);
                        }
                    }
                    match self.apply_root_relocation(&repository, inspection) {
                        Ok(updated) => Ok(updated),
                        Err(ForestError::DuplicatePath)
                        | Err(ForestError::WorktreePathUnavailable) => {
                            repository.health = RepositoryHealth::Unavailable;
                            repository.health_detail =
                                Some("canonical root cannot be applied without a collision".into());
                            repository.last_reconciled_at = Some(now);
                            repository.updated_at = now;
                            update_repository(self.db.connection(), &repository)?;
                            Ok(repository)
                        }
                        Err(error) => Err(error),
                    }
                } else {
                    repository.primary_branch = inspection.primary_branch;
                    repository.remote_url = inspection.remote_url;
                    repository.last_refreshed_at = Some(now);
                    repository.last_reconciled_at = Some(now);
                    repository.health = RepositoryHealth::Available;
                    repository.health_detail = None;
                    repository.updated_at = now;
                    update_repository(self.db.connection(), &repository)?;
                    Ok(repository)
                }
            }
            Err(ForestError::InvalidRepository) => {
                repository.health = RepositoryHealth::Invalid;
                repository.health_detail = Some("Not a Git repository".to_owned());
                repository.last_reconciled_at = Some(now);
                repository.updated_at = now;
                update_repository(self.db.connection(), &repository)?;
                Ok(repository)
            }
            Err(error) => {
                let health = match &error {
                    ForestError::GitNotInstalled
                    | ForestError::GitCommandFailed(_)
                    | ForestError::Io(_) => RepositoryHealth::Unavailable,
                    ForestError::PathNotDirectory => RepositoryHealth::Missing,
                    _ => RepositoryHealth::Unavailable,
                };
                repository.health = health;
                repository.health_detail = Some(error.to_string());
                repository.last_reconciled_at = Some(now);
                repository.updated_at = now;
                update_repository(self.db.connection(), &repository)?;
                Ok(repository)
            }
        }
    }

    fn apply_root_relocation(
        &self,
        repository: &Repository,
        inspection: RepositoryInspection,
    ) -> Result<Repository, ForestError> {
        let now = Utc::now();
        let old_path = repository.path.clone();
        let new_path = inspection.root.clone();
        let tx = self.db.connection().unchecked_transaction()?;

        if old_path != new_path {
            if let Some(other) = find_by_path(&tx, &new_path)? {
                if other.id != repository.id {
                    return Err(ForestError::DuplicatePath);
                }
            }
            if let Some(existing) = find_by_repository_and_path(&tx, &repository.id, &new_path)? {
                if existing.path != old_path {
                    return Err(ForestError::WorktreePathUnavailable);
                }
            }
        }

        let mut updated = repository.clone();
        updated.path = new_path.clone();
        updated.primary_branch = inspection.primary_branch;
        updated.remote_url = inspection.remote_url;
        updated.last_refreshed_at = Some(now);
        updated.last_reconciled_at = Some(now);
        updated.health = RepositoryHealth::Available;
        updated.health_detail = None;
        updated.updated_at = now;
        update_repository(&tx, &updated)?;

        if old_path != new_path {
            if let Some(primary) = find_by_repository_and_path(&tx, &repository.id, &old_path)? {
                update_worktree_path(&tx, &primary.id, &new_path, now)?;
            }
        }

        tx.commit()?;
        Ok(updated)
    }
}

fn normalized_name(name: Option<String>) -> Option<String> {
    name.map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service, TempEnv};
    use crate::domain::{ForestError, RepositoryHealth, RepositoryId, RepositoryMode};
    use crate::git::testing::{init_repository_at, run_git};
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::path::Path;

    fn git_repo(path: &Path) -> std::path::PathBuf {
        init_repository_at(path);
        path.to_path_buf()
    }

    #[test]
    fn import_repository_resolves_git_root_and_metadata() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let repo = git_repo(&env.root.join("linked"));
        fs::create_dir_all(repo.join("src")).expect("nested");
        run_git(
            &repo,
            &["remote", "add", "origin", "https://example.test/app.git"],
        );

        let state = service
            .import_repository(None, repo.join("src"))
            .expect("import");
        assert_eq!(state.repositories.len(), 1);
        let imported = &state.repositories[0];
        assert_eq!(imported.name, "linked");
        assert_eq!(imported.path, repo.canonicalize().unwrap());
        assert_eq!(imported.mode, crate::domain::RepositoryMode::Linked);
        assert_eq!(imported.primary_branch.as_deref(), Some("main"));
        assert_eq!(
            imported.remote_url.as_deref(),
            Some("https://example.test/app.git")
        );
        assert!(imported.last_refreshed_at.is_some());
        assert_eq!(imported.health, RepositoryHealth::Available);
        assert!(imported.last_reconciled_at.is_some());
    }

    #[test]
    fn import_repository_rejects_non_git_directories() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let error = service
            .import_repository(Some("Nope".into()), env.root.join("linked"))
            .expect_err("not git");
        assert!(matches!(error, ForestError::InvalidRepository));
    }

    #[test]
    fn import_repository_rejects_duplicate_canonical_roots() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let repo = git_repo(&env.root.join("linked"));
        service
            .import_repository(Some("First".into()), repo.clone())
            .expect("first");
        let error = service
            .import_repository(Some("Second".into()), repo.join("."))
            .expect_err("duplicate");
        assert!(matches!(error, ForestError::DuplicatePath));
    }

    #[test]
    fn refresh_and_remove_update_index_without_touching_disk() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let repo = git_repo(&env.root.join("linked"));
        let state = service
            .import_repository(Some("Keep".into()), repo.clone())
            .expect("import");
        let id = state.repositories[0].id.clone();
        run_git(
            &repo,
            &["remote", "add", "origin", "https://example.test/keep.git"],
        );

        let refreshed = service.refresh_repository(id.clone()).expect("refresh");
        assert_eq!(
            refreshed.repositories[0].remote_url.as_deref(),
            Some("https://example.test/keep.git")
        );
        assert_eq!(
            refreshed.repositories[0].health,
            RepositoryHealth::Available
        );

        let removed = service.remove_repository(id).expect("remove");
        assert!(removed.repositories.is_empty());
        assert!(repo.is_dir());
        assert!(repo.join(".git").exists());
    }

    #[test]
    fn batch_import_skips_indexed_roots_and_collects_failures() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let first = git_repo(&env.root.join("linked"));
        let second = git_repo(&env.root.join("managed"));
        service
            .import_repository(Some("Linked".into()), first.clone())
            .expect("first");

        let result = service
            .import_repositories(vec![first, second.clone(), env.root.join("does-not-exist")])
            .expect("batch");
        assert_eq!(result.imported.len(), 1);
        assert_eq!(result.imported[0].path, second.canonicalize().unwrap());
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].reason, "already_indexed");
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].code, "path_not_directory");
        assert_eq!(result.state.repositories.len(), 2);
    }

    #[test]
    fn existing_managed_records_remain_readable() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let repo = git_repo(&env.root.join("managed"));
        let now = chrono::Utc::now();
        crate::persistence::insert_repository(
            service.db_connection_for_test(),
            &crate::domain::Repository {
                id: crate::domain::RepositoryId::from_string("managed-1"),
                name: "Managed Legacy".into(),
                path: repo.canonicalize().unwrap(),
                mode: crate::domain::RepositoryMode::Managed,
                primary_branch: Some("main".into()),
                remote_url: None,
                last_refreshed_at: Some(now),
                health: RepositoryHealth::Unknown,
                health_detail: None,
                last_reconciled_at: None,
                created_at: now,
                updated_at: now,
            },
        )
        .expect("insert managed");

        let repositories = service.list_repositories().expect("list");
        assert_eq!(repositories.len(), 1);
        assert_eq!(repositories[0].mode, crate::domain::RepositoryMode::Managed);
        assert_eq!(repositories[0].name, "Managed Legacy");
        assert_eq!(repositories[0].health, RepositoryHealth::Unknown);
    }

    #[test]
    fn reconcile_returns_the_healthy_repository_when_another_is_deleted() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let healthy = git_repo(&env.root.join("healthy"));
        let doomed = git_repo(&env.root.join("doomed"));
        service
            .import_repository(Some("Healthy".into()), healthy.clone())
            .expect("healthy");
        let doomed_id = service
            .import_repository(Some("Doomed".into()), doomed.clone())
            .expect("doomed")
            .repositories
            .into_iter()
            .find(|repository| repository.name == "Doomed")
            .expect("doomed row")
            .id;
        fs::remove_dir_all(&doomed).expect("delete doomed");

        let state = service.reconcile_repositories().expect("reconcile");
        assert_eq!(state.repositories.len(), 2);
        let healthy_row = state
            .repositories
            .iter()
            .find(|repository| repository.name == "Healthy")
            .expect("healthy");
        let doomed_row = state
            .repositories
            .iter()
            .find(|repository| repository.id == doomed_id)
            .expect("doomed");
        assert_eq!(healthy_row.health, RepositoryHealth::Available);
        assert_eq!(doomed_row.health, RepositoryHealth::Missing);
        assert_eq!(
            doomed_row.health_detail.as_deref(),
            Some("Missing or moved")
        );
    }

    #[test]
    fn reconcile_follows_a_symlink_to_a_moved_canonical_root() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let original = git_repo(&env.root.join("original"));
        let imported = service
            .import_repository(Some("Moved".into()), original.clone())
            .expect("import");
        let id = imported.repositories[0].id.clone();
        let _ = service.list_worktrees(id.clone());
        let moved = env.root.join("relocated");
        fs::rename(&original, &moved).expect("move");
        symlink(&moved, &original).expect("symlink old path");

        let state = service.reconcile_repositories().expect("reconcile");
        let row = state
            .repositories
            .iter()
            .find(|repository| repository.id == id)
            .expect("row");
        assert_eq!(row.health, RepositoryHealth::Available);
        assert_eq!(row.path, moved.canonicalize().unwrap());
    }

    #[test]
    fn reconcile_marks_invalid_git_metadata() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let repo = git_repo(&env.root.join("broken"));
        service
            .import_repository(Some("Broken".into()), repo.clone())
            .expect("import");
        fs::remove_dir_all(repo.join(".git")).expect("strip git");

        let state = service.reconcile_repositories().expect("reconcile");
        assert_eq!(state.repositories[0].health, RepositoryHealth::Invalid);
        assert_eq!(
            state.repositories[0].health_detail.as_deref(),
            Some("Not a Git repository")
        );
    }

    #[test]
    fn reconcile_keeps_a_healthy_repository_when_another_is_unavailable() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let healthy = git_repo(&env.root.join("healthy"));
        let blocked = git_repo(&env.root.join("blocked"));
        service
            .import_repository(Some("Healthy".into()), healthy)
            .expect("healthy");
        service
            .import_repository(Some("Blocked".into()), blocked.clone())
            .expect("blocked");
        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o000)).expect("lock");

        let state = service.reconcile_repositories().expect("reconcile");
        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o755)).expect("unlock");

        let healthy_row = state
            .repositories
            .iter()
            .find(|repository| repository.name == "Healthy")
            .expect("healthy");
        let blocked_row = state
            .repositories
            .iter()
            .find(|repository| repository.name == "Blocked")
            .expect("blocked");
        assert_eq!(healthy_row.health, RepositoryHealth::Available);
        assert_eq!(blocked_row.health, RepositoryHealth::Unavailable);
        assert!(blocked_row.health_detail.is_some());
    }

    #[test]
    fn relocate_repository_updates_the_primary_worktree_path() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let original = git_repo(&env.root.join("original"));
        let imported = service
            .import_repository(Some("Relocate".into()), original.clone())
            .expect("import");
        let id = imported.repositories[0].id.clone();
        let worktrees = service.list_worktrees(id.clone()).expect("list");
        let primary = worktrees
            .into_iter()
            .find(|item| item.is_primary)
            .expect("primary");
        let moved = env.root.join("moved");
        fs::rename(&original, &moved).expect("move");

        let state = service
            .relocate_repository(id.clone(), moved.clone())
            .expect("relocate");
        let row = &state.repositories[0];
        assert_eq!(row.id, id);
        assert_eq!(row.name, "Relocate");
        assert_eq!(row.mode, RepositoryMode::Linked);
        assert_eq!(row.path, moved.canonicalize().unwrap());
        assert_eq!(row.health, RepositoryHealth::Available);

        let worktrees = service.list_worktrees(id).expect("relist");
        let relocated = worktrees
            .iter()
            .find(|item| item.id == primary.id)
            .expect("same id");
        assert_eq!(relocated.path, moved.canonicalize().unwrap());
    }

    #[test]
    fn relocate_repository_rejects_a_root_owned_by_another_id() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let first = git_repo(&env.root.join("first"));
        let second = git_repo(&env.root.join("second"));
        let first_id = service
            .import_repository(Some("First".into()), first.clone())
            .expect("first")
            .repositories[0]
            .id
            .clone();
        let second_state = service
            .import_repository(Some("Second".into()), second.clone())
            .expect("second");
        let second_path = second_state
            .repositories
            .iter()
            .find(|repository| repository.name == "Second")
            .expect("second row")
            .path
            .clone();

        let error = service
            .relocate_repository(first_id.clone(), second.clone())
            .expect_err("duplicate");
        assert!(matches!(error, ForestError::DuplicatePath));

        let repositories = service.list_repositories().expect("list");
        let first_row = repositories
            .iter()
            .find(|repository| repository.id == first_id)
            .expect("first");
        assert_eq!(first_row.path, first.canonicalize().unwrap());
        assert_eq!(
            repositories
                .iter()
                .find(|repository| repository.name == "Second")
                .expect("second")
                .path,
            second_path
        );
    }

    #[test]
    fn relocate_repository_rejects_an_unknown_id() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let error = service
            .relocate_repository(
                RepositoryId::from_string("missing"),
                env.root.join("linked"),
            )
            .expect_err("missing");
        assert!(matches!(error, ForestError::RepositoryNotFound));
    }
}
