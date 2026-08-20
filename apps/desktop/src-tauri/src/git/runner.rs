use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use crate::domain::ForestError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitRunner {
    program: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitOutput {
    pub success: bool,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

impl GitOutput {
    pub fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }

    pub fn stdout_trim(&self) -> String {
        self.stdout_text().trim().to_owned()
    }

    pub fn ensure_success(&self, args: &[&str]) -> Result<&Self, ForestError> {
        if self.success {
            return Ok(self);
        }
        Err(map_git_failure(args, &self.stderr))
    }
}

impl GitRunner {
    pub fn new() -> Self {
        Self {
            program: PathBuf::from("git"),
        }
    }

    pub fn with_program(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
        }
    }

    pub fn run(&self, cwd: &Path, args: &[&str]) -> Result<GitOutput, ForestError> {
        if !cwd.is_dir() {
            return Err(ForestError::PathNotDirectory);
        }

        let output = self.build(cwd, args).output().map_err(map_spawn_error)?;
        Ok(GitOutput::from(output))
    }

    pub fn run_success(&self, cwd: &Path, args: &[&str]) -> Result<GitOutput, ForestError> {
        let output = self.run(cwd, args)?;
        output.ensure_success(args)?;
        Ok(output)
    }

    pub fn run_optional(&self, cwd: &Path, args: &[&str]) -> Result<Option<String>, ForestError> {
        let output = self.run(cwd, args)?;
        if output.success {
            let value = output.stdout_trim();
            if value.is_empty() {
                return Ok(None);
            }
            return Ok(Some(value));
        }
        if is_invalid_repository(&output.stderr) {
            return Err(ForestError::InvalidRepository);
        }
        Ok(None)
    }

    pub(crate) fn build(&self, cwd: &Path, args: &[&str]) -> Command {
        let mut command = Command::new(&self.program);
        command
            .current_dir(cwd)
            .arg("-c")
            .arg("color.ui=never")
            .arg("-c")
            .arg("core.quotepath=false")
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_PAGER", "cat")
            .env("PAGER", "cat")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_COMMON_DIR")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }
}

impl Default for GitRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Output> for GitOutput {
    fn from(output: Output) -> Self {
        Self {
            success: output.status.success(),
            stdout: output.stdout,
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        }
    }
}

fn map_spawn_error(error: std::io::Error) -> ForestError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ForestError::GitNotInstalled
    } else {
        ForestError::Io(error.to_string())
    }
}

pub(crate) fn map_git_failure(args: &[&str], stderr: &str) -> ForestError {
    if is_invalid_repository(stderr) {
        return ForestError::InvalidRepository;
    }

    let lower = stderr.to_ascii_lowercase();
    if lower.contains("needed a single revision")
        || lower.contains("unknown revision")
        || lower.contains("bad revision")
        || lower.contains("ambiguous argument")
        || lower.contains("invalid object name")
        || lower.contains("not a valid object name")
    {
        return ForestError::MissingRef(args.last().copied().unwrap_or("ref").to_owned());
    }
    if lower.contains("already exists") && lower.contains("branch") {
        return ForestError::BranchAlreadyExists(stderr.to_owned());
    }
    if lower.contains("already used by worktree")
        || lower.contains("already exists") && args.contains(&"worktree")
    {
        return ForestError::WorktreeAlreadyExists;
    }
    if lower.contains("not a valid branch name") || lower.contains("is not a valid branch name") {
        return ForestError::InvalidBranchName(stderr.to_owned());
    }

    let command = args.join(" ");
    if stderr.is_empty() {
        ForestError::GitCommandFailed(format!("git {command}"))
    } else {
        ForestError::GitCommandFailed(format!("git {command}: {stderr}"))
    }
}

fn is_invalid_repository(stderr: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    lower.contains("not a git repository")
        || lower.contains("this operation must be run in a work tree")
}

#[cfg(test)]
mod tests {
    use super::{map_git_failure, GitRunner};
    use crate::domain::ForestError;
    use crate::git::testing::{isolated_git, TempGit};
    use std::path::Path;

    #[test]
    fn builds_a_non_shell_command_with_color_disabled() {
        let runner = GitRunner::new();
        let command = runner.build(Path::new("/tmp"), &["status", "--porcelain=v2"]);
        let rendered = format!("{command:?}");

        assert!(rendered.contains("git"));
        assert!(rendered.contains("color.ui=never"));
        assert!(rendered.contains("status"));
        assert!(rendered.contains("--porcelain=v2"));
        assert!(!rendered.contains("sh -c"));
        assert!(!rendered.contains("bash -c"));
    }

    #[test]
    fn maps_missing_binary_to_git_not_installed() {
        let runner = GitRunner::with_program("/nonexistent/git-forest-missing-git");
        let env = TempGit::new();
        let error = runner
            .run(env.root(), &["rev-parse", "--show-toplevel"])
            .expect_err("missing binary");
        assert!(matches!(error, ForestError::GitNotInstalled));
    }

    #[test]
    fn maps_invalid_repository_stderr() {
        let error = map_git_failure(
            &["rev-parse", "--show-toplevel"],
            "fatal: not a git repository (or any of the parent directories): .git",
        );
        assert!(matches!(error, ForestError::InvalidRepository));
    }

    #[test]
    fn reports_version_from_a_real_git_executable() {
        let env = TempGit::new();
        let runner = GitRunner::new();
        let output = runner
            .run_success(env.root(), &["--version"])
            .expect("git --version");
        assert!(output.stdout_trim().starts_with("git version"));
    }

    #[test]
    fn isolated_git_helper_does_not_use_a_shell() {
        let rendered = format!("{:?}", isolated_git(Path::new("/tmp")).arg("status"));
        assert!(rendered.contains("git"));
        assert!(!rendered.contains("sh -c"));
    }
}
