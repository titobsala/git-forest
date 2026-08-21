use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::settings::parse_rfc3339;
use crate::domain::{ForestError, RepositoryId, WorktreeId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeRecord {
    pub id: WorktreeId,
    pub repository_id: RepositoryId,
    pub name: String,
    pub path: std::path::PathBuf,
    pub branch: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub fn list_by_repository(
    conn: &Connection,
    repository_id: &RepositoryId,
) -> Result<Vec<WorktreeRecord>, ForestError> {
    let mut statement = conn.prepare(
        "SELECT id, repository_id, name, path, branch, created_at, updated_at
         FROM worktrees
         WHERE repository_id = ?1
         ORDER BY name COLLATE NOCASE, path",
    )?;
    let rows = statement.query_map([repository_id.as_str()], read_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(map_record(row?)?);
    }
    Ok(records)
}

pub fn find_by_repository_and_path(
    conn: &Connection,
    repository_id: &RepositoryId,
    path: &Path,
) -> Result<Option<WorktreeRecord>, ForestError> {
    conn.query_row(
        "SELECT id, repository_id, name, path, branch, created_at, updated_at
         FROM worktrees
         WHERE repository_id = ?1 AND path = ?2",
        params![repository_id.as_str(), path.to_string_lossy().as_ref()],
        read_row,
    )
    .optional()?
    .map(map_record)
    .transpose()
}

pub fn upsert_worktree(conn: &Connection, record: &WorktreeRecord) -> Result<(), ForestError> {
    conn.execute(
        "INSERT INTO worktrees (id, repository_id, name, path, branch, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(repository_id, path) DO UPDATE SET
            name = excluded.name,
            branch = excluded.branch,
            updated_at = excluded.updated_at",
        params![
            record.id.as_str(),
            record.repository_id.as_str(),
            record.name,
            record.path.to_string_lossy().as_ref(),
            record.branch,
            record.created_at.to_rfc3339(),
            record.updated_at.to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn delete_worktree(conn: &Connection, id: &WorktreeId) -> Result<bool, ForestError> {
    let changed = conn.execute("DELETE FROM worktrees WHERE id = ?1", [id.as_str()])?;
    Ok(changed > 0)
}

pub fn find_by_id(
    conn: &Connection,
    id: &WorktreeId,
) -> Result<Option<WorktreeRecord>, ForestError> {
    conn.query_row(
        "SELECT id, repository_id, name, path, branch, created_at, updated_at
         FROM worktrees
         WHERE id = ?1",
        [id.as_str()],
        read_row,
    )
    .optional()?
    .map(map_record)
    .transpose()
}

pub fn has_active_session(
    conn: &Connection,
    worktree_id: &WorktreeId,
) -> Result<bool, ForestError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_sessions
         WHERE worktree_id = ?1 AND status IN ('starting', 'running')",
        [worktree_id.as_str()],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

type WorktreeRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    String,
    String,
);

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorktreeRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
    ))
}

fn map_record(
    (id, repository_id, name, path, branch, created_at, updated_at): WorktreeRow,
) -> Result<WorktreeRecord, ForestError> {
    Ok(WorktreeRecord {
        id: WorktreeId::from_string(id),
        repository_id: RepositoryId::from_string(repository_id),
        name,
        path: path.into(),
        branch,
        created_at: parse_rfc3339(&created_at)?,
        updated_at: parse_rfc3339(&updated_at)?,
    })
}
