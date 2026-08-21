use std::path::Path;

use crate::domain::ForestError;

use super::runner::GitRunner;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorktreeStatus {
    pub branch: Option<String>,
    pub detached: bool,
    pub tracked_changes: u32,
    pub untracked_files: u32,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

pub fn inspect_worktree_status(
    git: &GitRunner,
    path: &Path,
) -> Result<WorktreeStatus, ForestError> {
    if !path.is_dir() {
        return Err(ForestError::WorktreeMissing);
    }

    let output = git.run_success(
        path,
        &["status", "--porcelain=v2", "--branch", "--ignored", "-z"],
    )?;
    Ok(parse_status_v2(&output.stdout))
}

pub fn parse_status_v2(stdout: &[u8]) -> WorktreeStatus {
    let mut status = WorktreeStatus::default();
    for chunk in split_status_chunks(stdout) {
        if chunk.is_empty() {
            continue;
        }
        if let Some(header) = chunk.strip_prefix("# ") {
            parse_branch_header(&mut status, header);
            continue;
        }
        match chunk.as_bytes().first().copied() {
            Some(b'1' | b'2' | b'u') => status.tracked_changes += 1,
            Some(b'?' | b'!') => status.untracked_files += 1,
            _ => {}
        }
    }
    status
}

fn split_status_chunks(stdout: &[u8]) -> Vec<String> {
    let text = String::from_utf8_lossy(stdout);
    if text.contains('\0') {
        text.split('\0')
            .flat_map(|chunk| chunk.lines())
            .map(str::trim)
            .filter(|chunk| !chunk.is_empty())
            .map(ToOwned::to_owned)
            .collect()
    } else {
        text.lines()
            .map(str::trim)
            .filter(|chunk| !chunk.is_empty())
            .map(ToOwned::to_owned)
            .collect()
    }
}

fn parse_branch_header(status: &mut WorktreeStatus, header: &str) {
    if let Some(head) = header.strip_prefix("branch.head ") {
        if head == "(detached)" {
            status.detached = true;
            status.branch = None;
        } else {
            status.branch = Some(head.to_owned());
        }
        return;
    }
    if let Some(ab) = header.strip_prefix("branch.ab ") {
        let mut ahead = None;
        let mut behind = None;
        for token in ab.split_whitespace() {
            if let Some(value) = token.strip_prefix('+') {
                ahead = value.parse().ok();
            } else if let Some(value) = token.strip_prefix('-') {
                behind = value.parse().ok();
            }
        }
        status.ahead = ahead;
        status.behind = behind;
    }
}

#[cfg(test)]
mod tests {
    use super::{inspect_worktree_status, parse_status_v2};
    use crate::git::runner::GitRunner;
    use crate::git::testing::{run_git, TempGit};
    use std::fs;

    #[test]
    fn parses_ahead_behind_and_change_counts() {
        let status = parse_status_v2(
            b"# branch.oid abcdef\n# branch.head feat/demo\n# branch.ab +2 -3\n1 .M N... file.txt\0? untracked.txt\0! ignored.env\0",
        );
        assert_eq!(status.branch.as_deref(), Some("feat/demo"));
        assert_eq!(status.tracked_changes, 1);
        assert_eq!(status.untracked_files, 2);
        assert_eq!(status.ahead, Some(2));
        assert_eq!(status.behind, Some(3));
        assert!(!status.detached);
    }

    #[test]
    fn inspects_dirty_and_untracked_files_from_git() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        fs::write(repo.join("README.md"), "dirty\n").expect("dirty");
        fs::write(repo.join("notes.txt"), "new\n").expect("untracked");

        let status = inspect_worktree_status(&GitRunner::new(), &repo).expect("status");
        assert_eq!(status.tracked_changes, 1);
        assert_eq!(status.untracked_files, 1);
        assert_eq!(status.ahead, None);
        assert_eq!(status.behind, None);
    }

    #[test]
    fn inspects_ahead_behind_without_network() {
        let env = TempGit::new();
        let remote = env.init_repo("remote.git");
        env.commit_file(&remote, "README.md", "hello\n", "initial");
        let clone = env.path("clone");
        run_git(
            env.root(),
            &["clone", remote.to_str().unwrap(), clone.to_str().unwrap()],
        );
        env.commit_file(&clone, "local.txt", "ahead\n", "ahead");

        let status = inspect_worktree_status(&GitRunner::new(), &clone).expect("status");
        assert_eq!(status.ahead, Some(1));
        assert_eq!(status.behind, Some(0));
    }

    #[test]
    fn inspects_ignored_files_as_local_files() {
        let env = TempGit::new();
        let repo = env.init_repo("ignored");
        env.commit_file(&repo, ".gitignore", ".env\n", "ignore local environment");
        fs::write(repo.join(".env"), "SECRET=local\n").expect("ignored file");

        let status = inspect_worktree_status(&GitRunner::new(), &repo).expect("status");
        assert_eq!(status.tracked_changes, 0);
        assert_eq!(status.untracked_files, 1);
    }
}
