mod agent_definitions;
mod agent_sessions;
mod database;
mod repositories;
mod settings;
mod worktrees;

pub use database::Database;

pub(crate) use agent_definitions::{
    agent_exists, get_agent_definition, list_agent_definitions, seed_builtin_agents,
};
#[cfg(test)]
pub(crate) use agent_sessions::{get_agent_session, list_sessions_for_worktree};
pub(crate) use agent_sessions::{insert_agent_session, list_agent_sessions, update_agent_session};
pub(crate) use repositories::{
    delete_by_id, find_by_id, find_by_path, insert_repository, list_repositories, update_repository,
};
pub(crate) use settings::{load_configuration, save_configuration};
pub(crate) use worktrees::{
    delete_worktree, find_by_id as find_worktree_by_id, find_by_repository_and_path,
    has_active_session, list_by_repository, touch_worktree_used, upsert_worktree, WorktreeRecord,
};
