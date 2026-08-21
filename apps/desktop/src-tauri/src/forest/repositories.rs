use std::path::PathBuf;

use chrono::Utc;

use crate::domain::{
    CommandError, ForestError, ForestState, ImportFailure, ImportRepositoriesResult, ImportSkip,
    Repository, RepositoryId, RepositoryMode,
};
use crate::git::{display_name, inspect_repository};
use crate::persistence::{
    delete_by_id, find_by_id, find_by_path, insert_repository, update_repository,
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
        let mut repository =
            find_by_id(self.db.connection(), &id)?.ok_or(ForestError::RepositoryNotFound)?;
        let inspection = inspect_repository(&self.git, &repository.path)?;
        let now = Utc::now();
        repository.path = inspection.root;
        repository.primary_branch = inspection.primary_branch;
        repository.remote_url = inspection.remote_url;
        repository.last_refreshed_at = Some(now);
        repository.updated_at = now;
        update_repository(self.db.connection(), &repository)?;
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
            created_at: now,
            updated_at: now,
        })
    }

    fn persist_import(&self, repository: Repository) -> Result<(), ForestError> {
        insert_repository(self.db.connection(), &repository)
    }
}

fn normalized_name(name: Option<String>) -> Option<String> {
    name.map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::super::tests::{open_service, TempEnv};
    use crate::domain::ForestError;
    use crate::git::testing::{init_repository_at, run_git};
    use std::fs;
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
                created_at: now,
                updated_at: now,
            },
        )
        .expect("insert managed");

        let repositories = service.list_repositories().expect("list");
        assert_eq!(repositories.len(), 1);
        assert_eq!(repositories[0].mode, crate::domain::RepositoryMode::Managed);
        assert_eq!(repositories[0].name, "Managed Legacy");
    }
}
