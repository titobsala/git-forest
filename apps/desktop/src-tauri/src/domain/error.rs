use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ForestError {
    #[error("database error: {0}")]
    Database(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("platform path error: {0}")]
    Platform(String),
    #[error("invalid timestamp: {0}")]
    InvalidTimestamp(String),
    #[error("forest configuration is missing")]
    ConfigurationMissing,
    #[error("repository path must be absolute")]
    PathNotAbsolute,
    #[error("repository path does not exist or is not a directory")]
    PathNotDirectory,
    #[error("a repository is already registered at this path")]
    DuplicatePath,
    #[error("repository name must not be empty")]
    EmptyName,
    #[error("forest root must be an absolute path")]
    ForestRootNotAbsolute,
    #[error("unknown default agent: {0}")]
    UnknownAgent(String),
    #[error("application state lock was poisoned")]
    MutexPoisoned,
    #[error("git is not installed or is not available on PATH")]
    GitNotInstalled,
    #[error("the selected directory is not a git repository")]
    InvalidRepository,
    #[error("git command failed: {0}")]
    GitCommandFailed(String),
    #[error("git reference was not found: {0}")]
    MissingRef(String),
    #[error("repository was not found")]
    RepositoryNotFound,
    #[error("worktree was not found")]
    WorktreeNotFound,
    #[error("branch already exists: {0}")]
    BranchAlreadyExists(String),
    #[error("a worktree already exists at this path or branch")]
    WorktreeAlreadyExists,
    #[error("worktree has uncommitted or untracked changes")]
    DirtyWorktree,
    #[error("invalid branch name: {0}")]
    InvalidBranchName(String),
    #[error("worktree destination is unavailable")]
    WorktreePathUnavailable,
    #[error("the primary worktree cannot be removed")]
    CannotRemovePrimaryWorktree,
    #[error("worktree is locked")]
    WorktreeLocked,
    #[error("worktree directory is missing")]
    WorktreeMissing,
    #[error("worktree has an active agent session")]
    ActiveAgentSession,
    #[error("a repository scan is already running")]
    ScanInProgress,
    #[error("repository scan was not found")]
    ScanNotFound,
    #[error("scan root does not exist or is not a directory")]
    ScanRootNotDirectory,
    #[error("scan depth is invalid")]
    InvalidScanDepth,
    #[error("path is outside the managed forest worktree root")]
    PathOutsideForest,
    #[error("worktree directory name is empty or invalid")]
    EmptySlug,
    #[error("this worktree can only be removed with explicit force")]
    ForceRequired,
    #[error("{0} is not available")]
    TerminalUnavailable(String),
    #[error("failed to launch the terminal: {0}")]
    TerminalLaunchFailed(String),
    #[error("the configured agent is not available: {0}")]
    AgentUnavailable(String),
    #[error("failed to launch the agent: {0}")]
    AgentLaunchFailed(String),
}

impl From<rusqlite::Error> for ForestError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error.to_string())
    }
}

impl From<std::io::Error> for ForestError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

impl From<serde_json::Error> for ForestError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<ForestError> for CommandError {
    fn from(error: ForestError) -> Self {
        let code = match &error {
            ForestError::Database(_) => "database",
            ForestError::Io(_) => "io",
            ForestError::Serialization(_) => "serialization",
            ForestError::Platform(_) => "platform",
            ForestError::InvalidTimestamp(_) => "invalid_timestamp",
            ForestError::ConfigurationMissing => "configuration_missing",
            ForestError::PathNotAbsolute => "path_not_absolute",
            ForestError::PathNotDirectory => "path_not_directory",
            ForestError::DuplicatePath => "duplicate_path",
            ForestError::EmptyName => "empty_name",
            ForestError::ForestRootNotAbsolute => "forest_root_not_absolute",
            ForestError::UnknownAgent(_) => "unknown_agent",
            ForestError::MutexPoisoned => "mutex_poisoned",
            ForestError::GitNotInstalled => "git_not_installed",
            ForestError::InvalidRepository => "invalid_repository",
            ForestError::GitCommandFailed(_) => "git_command_failed",
            ForestError::MissingRef(_) => "missing_ref",
            ForestError::RepositoryNotFound => "repository_not_found",
            ForestError::WorktreeNotFound => "worktree_not_found",
            ForestError::BranchAlreadyExists(_) => "branch_already_exists",
            ForestError::WorktreeAlreadyExists => "worktree_already_exists",
            ForestError::DirtyWorktree => "dirty_worktree",
            ForestError::InvalidBranchName(_) => "invalid_branch_name",
            ForestError::WorktreePathUnavailable => "worktree_path_unavailable",
            ForestError::CannotRemovePrimaryWorktree => "cannot_remove_primary_worktree",
            ForestError::WorktreeLocked => "worktree_locked",
            ForestError::WorktreeMissing => "worktree_missing",
            ForestError::ActiveAgentSession => "active_agent_session",
            ForestError::ScanInProgress => "scan_in_progress",
            ForestError::ScanNotFound => "scan_not_found",
            ForestError::ScanRootNotDirectory => "scan_root_not_directory",
            ForestError::InvalidScanDepth => "invalid_scan_depth",
            ForestError::PathOutsideForest => "path_outside_forest",
            ForestError::EmptySlug => "empty_slug",
            ForestError::ForceRequired => "force_required",
            ForestError::TerminalUnavailable(_) => "terminal_unavailable",
            ForestError::TerminalLaunchFailed(_) => "terminal_launch_failed",
            ForestError::AgentUnavailable(_) => "agent_unavailable",
            ForestError::AgentLaunchFailed(_) => "agent_launch_failed",
        };

        Self {
            code: code.to_owned(),
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommandError, ForestError};

    #[test]
    fn maps_duplicate_path_to_a_stable_command_code() {
        let error = CommandError::from(ForestError::DuplicatePath);
        assert_eq!(error.code, "duplicate_path");
        assert_eq!(
            error.message,
            "a repository is already registered at this path"
        );
    }

    #[test]
    fn maps_git_failures_to_stable_command_codes() {
        assert_eq!(
            CommandError::from(ForestError::GitNotInstalled).code,
            "git_not_installed"
        );
        assert_eq!(
            CommandError::from(ForestError::InvalidRepository).code,
            "invalid_repository"
        );
        assert_eq!(
            CommandError::from(ForestError::MissingRef("main".into())).code,
            "missing_ref"
        );
    }

    #[test]
    fn maps_terminal_and_agent_failures_to_stable_command_codes() {
        assert_eq!(
            CommandError::from(ForestError::TerminalUnavailable("Warp".into())).code,
            "terminal_unavailable"
        );
        assert_eq!(
            CommandError::from(ForestError::TerminalLaunchFailed("xdg-open failed".into())).code,
            "terminal_launch_failed"
        );
        assert_eq!(
            CommandError::from(ForestError::AgentUnavailable("codex".into())).code,
            "agent_unavailable"
        );
        assert_eq!(
            CommandError::from(ForestError::AgentLaunchFailed("missing tab config".into())).code,
            "agent_launch_failed"
        );
    }
}
