mod agent_definitions;
mod database;
mod repositories;
mod settings;
mod worktrees;

pub use database::Database;

pub(crate) use agent_definitions::{agent_exists, list_agent_definitions, seed_builtin_agents};
pub(crate) use repositories::{
    delete_by_id, find_by_id, find_by_path, insert_repository, list_repositories, update_repository,
};
pub(crate) use settings::{load_configuration, save_configuration};
pub(crate) use worktrees::{
    delete_worktree, find_by_id as find_worktree_by_id, find_by_repository_and_path,
    has_active_session, list_by_repository, upsert_worktree, WorktreeRecord,
};
