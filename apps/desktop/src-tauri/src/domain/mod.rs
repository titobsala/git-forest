pub mod agent;
pub mod app_info;
pub mod error;
pub mod forest;
pub mod ids;
pub mod repository;
pub mod scan;
pub mod terminal;
pub mod worktree;

pub use agent::{AgentAvailability, AgentDefinition, AgentLaunchResult, AgentLaunchSpec};
pub use app_info::AppInfo;
pub use error::{CommandError, ForestError};
pub use forest::{
    ForestConfiguration, ForestPaths, ForestState, LaunchBehavior, TerminalProviderId,
    ThemePreference, WorktreeNamingStrategy,
};
pub use ids::{AgentDefinitionId, RepositoryId, WorktreeId};
pub use repository::{Repository, RepositoryMode};
pub use scan::{
    ImportFailure, ImportRepositoriesResult, ImportSkip, ScanCandidate, ScanCompletedPayload,
    ScanProgressPayload,
};
pub use terminal::TerminalLaunchResult;
pub use worktree::{
    CreateWorktreeInput, CreateWorktreePreview, CreateWorktreeResult, RemovalBlocker,
    RemoveWorktreeResult, Worktree, WorktreeRemovalPreview,
};
