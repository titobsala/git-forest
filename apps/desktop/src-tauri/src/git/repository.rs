use std::path::{Path, PathBuf};

use crate::domain::ForestError;

use super::runner::GitRunner;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryInspection {
    pub root: PathBuf,
    pub primary_branch: Option<String>,
    pub remote_url: Option<String>,
}

pub fn resolve_repository_root(git: &GitRunner, path: &Path) -> Result<PathBuf, ForestError> {
    let output = git.run_success(path, &["rev-parse", "--show-toplevel"])?;
    let root = PathBuf::from(output.stdout_trim());
    root.canonicalize()
        .map_err(|_| ForestError::InvalidRepository)
}

pub fn inspect_repository(
    git: &GitRunner,
    path: &Path,
) -> Result<RepositoryInspection, ForestError> {
    let root = resolve_repository_root(git, path)?;
    let primary_branch = primary_branch(git, &root)?;
    let remote_url = git.run_optional(&root, &["remote", "get-url", "origin"])?;
    Ok(RepositoryInspection {
        root,
        primary_branch,
        remote_url,
    })
}

fn primary_branch(git: &GitRunner, root: &Path) -> Result<Option<String>, ForestError> {
    if let Some(origin_head) = git.run_optional(
        root,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )? {
        return Ok(Some(shorten_origin_head(&origin_head)));
    }

    git.run_optional(root, &["symbolic-ref", "--short", "HEAD"])
}

fn shorten_origin_head(value: &str) -> String {
    value
        .strip_prefix("refs/remotes/origin/")
        .unwrap_or(value)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{inspect_repository, resolve_repository_root};
    use crate::domain::ForestError;
    use crate::git::runner::GitRunner;
    use crate::git::testing::TempGit;
    use std::fs;

    #[test]
    fn resolves_repository_root_from_a_nested_directory() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let nested = repo.join("src/nested");
        fs::create_dir_all(&nested).expect("nested");

        let root = resolve_repository_root(&GitRunner::new(), &nested).expect("root");
        assert_eq!(root, repo.canonicalize().unwrap());
    }

    #[test]
    fn inspects_origin_head_and_remote_url() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        env.add_remote(&repo, "https://example.test/exog.git");
        env.set_origin_head(&repo, "develop");

        let inspection = inspect_repository(&GitRunner::new(), &repo).expect("inspect");
        assert_eq!(inspection.primary_branch.as_deref(), Some("develop"));
        assert_eq!(
            inspection.remote_url.as_deref(),
            Some("https://example.test/exog.git")
        );
    }

    #[test]
    fn falls_back_to_the_checked_out_branch_without_origin() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");

        let inspection = inspect_repository(&GitRunner::new(), &repo).expect("inspect");
        assert_eq!(inspection.primary_branch.as_deref(), Some("main"));
        assert_eq!(inspection.remote_url, None);
    }

    #[test]
    fn inspects_a_linked_worktree_git_file() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let worktree = env.add_worktree(&repo, "feature-tree", "feat/demo", "main");

        assert!(worktree.join(".git").is_file());
        let inspection = inspect_repository(&GitRunner::new(), &worktree).expect("inspect");
        assert_eq!(inspection.root, worktree.canonicalize().unwrap());
        assert_eq!(inspection.primary_branch.as_deref(), Some("feat/demo"));
    }

    #[test]
    fn rejects_a_directory_that_is_not_a_git_repository() {
        let env = TempGit::new();
        let error = inspect_repository(&GitRunner::new(), env.root()).expect_err("not a repo");
        assert!(matches!(error, ForestError::InvalidRepository));
    }
}
