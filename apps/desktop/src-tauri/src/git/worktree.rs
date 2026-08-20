use std::path::{Path, PathBuf};

use crate::domain::ForestError;

use super::runner::GitRunner;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitWorktree {
    pub path: PathBuf,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub detached: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    pub prunable: bool,
    pub prunable_reason: Option<String>,
    pub bare: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeAddRequest<'a> {
    pub path: &'a Path,
    pub branch: &'a str,
    pub base: &'a str,
}

pub fn list_worktrees(git: &GitRunner, repo: &Path) -> Result<Vec<GitWorktree>, ForestError> {
    let output = git.run_success(repo, &["worktree", "list", "--porcelain", "-z"])?;
    parse_worktree_list(&output.stdout)
}

pub fn parse_worktree_list(stdout: &[u8]) -> Result<Vec<GitWorktree>, ForestError> {
    let text = String::from_utf8_lossy(stdout);
    let mut worktrees = Vec::new();
    let mut current: Option<GitWorktree> = None;

    for field in text.split('\0') {
        if field.is_empty() {
            if let Some(worktree) = current.take() {
                worktrees.push(worktree);
            }
            continue;
        }

        if let Some(path) = field.strip_prefix("worktree ") {
            if let Some(worktree) = current.take() {
                worktrees.push(worktree);
            }
            current = Some(GitWorktree {
                path: PathBuf::from(path),
                head: None,
                branch: None,
                detached: false,
                locked: false,
                lock_reason: None,
                prunable: false,
                prunable_reason: None,
                bare: false,
            });
            continue;
        }

        let Some(worktree) = current.as_mut() else {
            continue;
        };
        if let Some(head) = field.strip_prefix("HEAD ") {
            worktree.head = Some(head.to_owned());
        } else if let Some(branch) = field.strip_prefix("branch ") {
            worktree.branch = Some(
                branch
                    .strip_prefix("refs/heads/")
                    .unwrap_or(branch)
                    .to_owned(),
            );
        } else if field == "detached" {
            worktree.detached = true;
            worktree.branch = None;
        } else if field == "bare" {
            worktree.bare = true;
        } else if field == "locked" {
            worktree.locked = true;
        } else if let Some(reason) = field.strip_prefix("locked ") {
            worktree.locked = true;
            worktree.lock_reason = Some(reason.to_owned());
        } else if field == "prunable" {
            worktree.prunable = true;
        } else if let Some(reason) = field.strip_prefix("prunable ") {
            worktree.prunable = true;
            worktree.prunable_reason = Some(reason.to_owned());
        }
    }

    if let Some(worktree) = current.take() {
        worktrees.push(worktree);
    }
    Ok(worktrees)
}

pub fn add_worktree(
    git: &GitRunner,
    repo: &Path,
    request: WorktreeAddRequest<'_>,
) -> Result<(), ForestError> {
    let path = request
        .path
        .to_str()
        .ok_or(ForestError::WorktreePathUnavailable)?;
    git.run_success(
        repo,
        &["worktree", "add", "-b", request.branch, path, request.base],
    )?;
    Ok(())
}

pub fn remove_worktree(
    git: &GitRunner,
    repo: &Path,
    path: &Path,
    force: bool,
) -> Result<(), ForestError> {
    let path = path.to_str().ok_or(ForestError::WorktreePathUnavailable)?;
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(path);
    git.run_success(repo, &args)?;
    Ok(())
}

#[cfg(test)]
pub fn lock_worktree(
    git: &GitRunner,
    repo: &Path,
    path: &Path,
    reason: &str,
) -> Result<(), ForestError> {
    let path = path.to_str().ok_or(ForestError::WorktreePathUnavailable)?;
    git.run_success(repo, &["worktree", "lock", "--reason", reason, path])?;
    Ok(())
}

pub fn branch_checked_out(worktrees: &[GitWorktree], branch: &str) -> bool {
    worktrees
        .iter()
        .any(|worktree| worktree.branch.as_deref() == Some(branch))
}

pub fn path_in_use(worktrees: &[GitWorktree], path: &Path) -> bool {
    worktrees.iter().any(|worktree| {
        worktree.path == path
            || worktree
                .path
                .canonicalize()
                .ok()
                .is_some_and(|canonical| canonical == path)
    })
}

#[cfg(test)]
mod tests {
    use super::{
        add_worktree, list_worktrees, lock_worktree, parse_worktree_list, remove_worktree,
        WorktreeAddRequest,
    };
    use crate::domain::ForestError;
    use crate::git::runner::GitRunner;
    use crate::git::testing::TempGit;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn parses_nul_separated_worktree_records_with_spaces() {
        let stdout = b"worktree /tmp/my repo\0HEAD abcdef\0branch refs/heads/main\0\0worktree /tmp/other\0HEAD 123\0detached\0locked busy\0prunable git dir gone\0\0";
        let worktrees = parse_worktree_list(stdout).expect("parse");
        assert_eq!(worktrees.len(), 2);
        assert_eq!(worktrees[0].path, PathBuf::from("/tmp/my repo"));
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert!(worktrees[1].detached);
        assert!(worktrees[1].locked);
        assert_eq!(worktrees[1].lock_reason.as_deref(), Some("busy"));
        assert!(worktrees[1].prunable);
    }

    #[test]
    fn lists_primary_and_linked_worktrees() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let extra = env.path("feature tree");
        fs::create_dir_all(extra.parent().unwrap()).expect("parent");
        add_worktree(
            &GitRunner::new(),
            &repo,
            WorktreeAddRequest {
                path: &extra,
                branch: "feat/spaces",
                base: "main",
            },
        )
        .expect("add");

        let worktrees = list_worktrees(&GitRunner::new(), &repo).expect("list");
        assert_eq!(worktrees.len(), 2);
        assert!(worktrees
            .iter()
            .any(|item| item.branch.as_deref() == Some("main")));
        assert!(worktrees
            .iter()
            .any(|item| item.branch.as_deref() == Some("feat/spaces") && item.path == extra));
        assert!(extra.join(".git").is_file());
    }

    #[test]
    fn removes_a_clean_linked_worktree() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let extra = env.add_worktree(&repo, "extra", "feat/extra", "main");
        remove_worktree(&GitRunner::new(), &repo, &extra, false).expect("remove");
        assert!(!extra.exists());
        let remaining = list_worktrees(&GitRunner::new(), &repo).expect("list");
        assert_eq!(remaining.len(), 1);
        let branches = run_git_branches(&repo);
        assert!(branches.contains("feat/extra"));
    }

    #[test]
    fn dirty_removal_without_force_fails() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let extra = env.add_worktree(&repo, "extra", "feat/extra", "main");
        fs::write(extra.join("dirty.txt"), "nope\n").expect("dirty");
        let error = remove_worktree(&GitRunner::new(), &repo, &extra, false).expect_err("blocked");
        assert!(matches!(error, ForestError::GitCommandFailed(_)));
        assert!(extra.exists());
        remove_worktree(&GitRunner::new(), &repo, &extra, true).expect("force");
        assert!(!extra.exists());
    }

    #[test]
    fn lists_locked_worktrees() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let extra = env.add_worktree(&repo, "extra", "feat/extra", "main");
        lock_worktree(&GitRunner::new(), &repo, &extra, "busy").expect("lock");

        let worktrees = list_worktrees(&GitRunner::new(), &repo).expect("list");
        let extra_record = worktrees
            .iter()
            .find(|item| item.path == extra)
            .expect("extra");
        assert!(extra_record.locked);
        assert_eq!(extra_record.lock_reason.as_deref(), Some("busy"));
    }

    fn run_git_branches(repo: &std::path::Path) -> String {
        let output = crate::git::testing::isolated_git(repo)
            .args(["branch", "--list"])
            .output()
            .expect("branch list");
        String::from_utf8_lossy(&output.stdout).into_owned()
    }
}
