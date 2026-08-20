use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub struct TempGit {
    root: PathBuf,
}

impl TempGit {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!("git-forest-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("temp git root");
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn path(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }

    pub fn init_repo(&self, name: &str) -> PathBuf {
        let path = self.path(name);
        init_repository_at(&path);
        path
    }

    pub fn commit_file(&self, repo: &Path, relative: &str, contents: &str, message: &str) {
        let file = repo.join(relative);
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).expect("file parent");
        }
        std::fs::write(&file, contents).expect("write file");
        run_git(repo, &["add", "--", relative]);
        run_git(repo, &["commit", "-m", message]);
    }

    pub fn add_remote(&self, repo: &Path, url: &str) {
        run_git(repo, &["remote", "add", "origin", url]);
    }

    pub fn set_origin_head(&self, repo: &Path, branch: &str) {
        run_git(
            repo,
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                &format!("refs/remotes/origin/{branch}"),
            ],
        );
    }

    pub fn add_worktree(&self, repo: &Path, directory: &str, branch: &str, base: &str) -> PathBuf {
        let path = self.path(directory);
        run_git(
            repo,
            &[
                "worktree",
                "add",
                "-b",
                branch,
                path.to_str().expect("utf-8 path"),
                base,
            ],
        );
        path
    }
}

impl Drop for TempGit {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub fn init_repository_at(path: &Path) {
    std::fs::create_dir_all(path).expect("repo dir");
    run_git(path, &["init", "-b", "main"]);
    run_git(path, &["config", "user.name", "Git Forest Tests"]);
    run_git(path, &["config", "user.email", "forest@example.test"]);
    run_git(path, &["config", "commit.gpgsign", "false"]);
}

pub fn isolated_git(cwd: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .current_dir(cwd)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_AUTHOR_NAME", "Git Forest Tests")
        .env("GIT_AUTHOR_EMAIL", "forest@example.test")
        .env("GIT_COMMITTER_NAME", "Git Forest Tests")
        .env("GIT_COMMITTER_EMAIL", "forest@example.test")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_COMMON_DIR")
        .stdin(Stdio::null());
    command
}

pub fn run_git(cwd: &Path, args: &[&str]) {
    let output = isolated_git(cwd)
        .args(args)
        .output()
        .unwrap_or_else(|error| panic!("spawn git {args:?}: {error}"));
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
