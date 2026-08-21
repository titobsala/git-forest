pub mod discovery;
pub mod refs;
pub mod repository;
pub mod runner;
pub mod status;
pub mod worktree;

#[cfg(test)]
pub mod testing;

pub use discovery::{
    default_ignore_names, discover_repositories, display_name, DEFAULT_SCAN_DEPTH, MAX_SCAN_DEPTH,
};
pub use refs::LocalBranch;
pub use repository::inspect_repository;
pub use runner::GitRunner;
