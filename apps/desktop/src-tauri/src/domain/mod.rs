pub mod agent;
pub mod app_info;
pub mod cleanup;
pub mod error;
pub mod forest;
pub mod ids;
pub mod repository;
pub mod scan;
pub mod terminal;
pub mod worktree;

pub use agent::{
    AgentAvailability, AgentDefinition, AgentLaunchResult, AgentLaunchSpec, AgentSession,
    AgentSessionStatus,
};
pub use app_info::AppInfo;
pub use cleanup::{
    CleanupCategory, CleanupOperationResult, CleanupPreview, CleanupRequest, CleanupResult,
    CleanupSessionCandidate, CleanupSourceError, CleanupWarpConfigCandidate,
    CleanupWorktreeCandidate,
};
pub use error::{CommandError, ForestError};
pub use forest::{
    ForestConfiguration, ForestPaths, ForestState, LaunchBehavior, TerminalProviderId,
    ThemePreference, WorktreeNamingStrategy,
};
pub use ids::{AgentDefinitionId, AgentSessionId, RepositoryId, WorktreeId};
pub use repository::{Repository, RepositoryHealth, RepositoryMode};
pub use scan::{
    ImportFailure, ImportRepositoriesResult, ImportSkip, ScanCandidate, ScanCompletedPayload,
    ScanProgressPayload,
};
pub use terminal::TerminalLaunchResult;
pub use worktree::{
    CreateWorktreeInput, CreateWorktreePreview, CreateWorktreeResult, LocalFileCandidate,
    LocalFileCopyFailure, LocalFileCopyResult, RemovalBlocker, RemoveWorktreeResult, Worktree,
    WorktreeRemovalPreview,
};
