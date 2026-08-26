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
pub(crate) use agent_sessions::{
    delete_finished_sessions, insert_agent_session, list_agent_sessions, list_finished_sessions,
    update_agent_session,
};
#[cfg(test)]
pub(crate) use agent_sessions::{get_agent_session, list_sessions_for_worktree};
pub(crate) use repositories::{
    delete_by_id, find_by_id, find_by_path, insert_repository, list_repositories, update_repository,
};
pub(crate) use settings::{load_configuration, save_configuration};
pub(crate) use worktrees::{
    count_sessions_for_worktree, delete_worktree, delete_worktrees,
    find_by_id as find_worktree_by_id, find_by_repository_and_path, has_active_session,
    has_protected_session, list_all as list_all_worktrees, list_by_repository, touch_worktree_used,
    update_worktree_path, upsert_worktree, WorktreeRecord,
};
