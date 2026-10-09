use std::path::Path;

use chrono::{DateTime, Utc};
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

pub fn list_by_repository(
    conn: &Connection,
    repository_id: &RepositoryId,
) -> Result<Vec<WorktreeRecord>, ForestError> {
    let mut statement = conn.prepare(
        "SELECT id, repository_id, name, path, branch, created_at, updated_at, last_used_at
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
        "SELECT id, repository_id, name, path, branch, created_at, updated_at, last_used_at
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
        "INSERT INTO worktrees (
            id, repository_id, name, path, branch, created_at, updated_at, last_used_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
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
            record.updated_at.to_rfc3339(),
            record.last_used_at.map(|value| value.to_rfc3339())
        ],
    )?;
    Ok(())
}

pub fn touch_worktree_used(
    conn: &Connection,
    id: &WorktreeId,
    at: DateTime<Utc>,
) -> Result<(), ForestError> {
    let changed = conn.execute(
        "UPDATE worktrees SET last_used_at = ?1 WHERE id = ?2",
        params![at.to_rfc3339(), id.as_str()],
    )?;
    if changed == 0 {
        return Err(ForestError::WorktreeNotFound);
    }
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
        "SELECT id, repository_id, name, path, branch, created_at, updated_at, last_used_at
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

pub fn has_protected_session(
    conn: &Connection,
    worktree_id: &WorktreeId,
) -> Result<bool, ForestError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_sessions
         WHERE worktree_id = ?1 AND status IN ('starting', 'running', 'unknown')",
        [worktree_id.as_str()],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn list_all(conn: &Connection) -> Result<Vec<WorktreeRecord>, ForestError> {
    let mut statement = conn.prepare(
        "SELECT id, repository_id, name, path, branch, created_at, updated_at, last_used_at
         FROM worktrees
         ORDER BY name COLLATE NOCASE, path",
    )?;
    let rows = statement.query_map([], read_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(map_record(row?)?);
    }
    Ok(records)
}

pub fn count_sessions_for_worktree(
    conn: &Connection,
    worktree_id: &WorktreeId,
) -> Result<u32, ForestError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_sessions WHERE worktree_id = ?1",
        [worktree_id.as_str()],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

pub fn update_worktree_path(
    conn: &Connection,
    id: &WorktreeId,
    path: &Path,
    updated_at: DateTime<Utc>,
) -> Result<(), ForestError> {
    let changed = conn.execute(
        "UPDATE worktrees SET path = ?2, updated_at = ?3 WHERE id = ?1",
        params![
            id.as_str(),
            path.to_string_lossy().as_ref(),
            updated_at.to_rfc3339()
        ],
    )?;
    if changed == 0 {
        return Err(ForestError::WorktreeNotFound);
    }
    Ok(())
}

pub fn delete_worktrees(conn: &Connection, ids: &[WorktreeId]) -> Result<u32, ForestError> {
    let mut removed = 0_u32;
    for id in ids {
        if delete_worktree(conn, id)? {
            removed += 1;
        }
    }
    Ok(removed)
}

type WorktreeRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    String,
    String,
    Option<String>,
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
        row.get(7)?,
    ))
}

fn map_record(
    (id, repository_id, name, path, branch, created_at, updated_at, last_used_at): WorktreeRow,
) -> Result<WorktreeRecord, ForestError> {
    Ok(WorktreeRecord {
        id: WorktreeId::from_string(id),
        repository_id: RepositoryId::from_string(repository_id),
        name,
        path: path.into(),
        branch,
        created_at: parse_rfc3339(&created_at)?,
        updated_at: parse_rfc3339(&updated_at)?,
        last_used_at: last_used_at.as_deref().map(parse_rfc3339).transpose()?,
    })
}

#[cfg(test)]
mod tests {
    use super::{find_by_id, touch_worktree_used, upsert_worktree, WorktreeRecord};
    use crate::domain::{RepositoryId, WorktreeId};
    use crate::persistence::Database;
    use chrono::{TimeZone, Utc};
    use std::path::{Path, PathBuf};

    fn open_migrated(root: &Path) -> Database {
        let db = Database::open(&root.join("forest.db")).expect("open");
        db.migrate().expect("migrate");
        db
    }

    fn seed_repository(db: &Database) {
        db.connection()
            .execute(
                "INSERT INTO repositories (id, name, path, mode, created_at, updated_at)
                 VALUES ('repo-1', 'Acme App', '/tmp/acme-app', 'linked', '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z')",
                [],
            )
            .expect("seed repo");
    }

    fn record(last_used_at: Option<chrono::DateTime<Utc>>) -> WorktreeRecord {
        let created = Utc.with_ymd_and_hms(2026, 8, 20, 9, 0, 0).unwrap();
        WorktreeRecord {
            id: WorktreeId::from_string("wt-1"),
            repository_id: RepositoryId::from_string("repo-1"),
            name: "feat-auth-142".into(),
            path: PathBuf::from("/tmp/feat-auth-142"),
            branch: Some("feat/auth-142".into()),
            created_at: created,
            updated_at: created,
            last_used_at,
        }
    }

    #[test]
    fn round_trips_last_used_at() {
        let root = std::env::temp_dir().join(format!("git-forest-wt-{}", uuid::Uuid::new_v4()));
        let db = open_migrated(&root);
        seed_repository(&db);
        let used = Utc.with_ymd_and_hms(2026, 8, 25, 10, 0, 0).unwrap();
        upsert_worktree(db.connection(), &record(Some(used))).expect("insert");

        let loaded = find_by_id(db.connection(), &WorktreeId::from_string("wt-1"))
            .expect("find")
            .expect("present");
        assert_eq!(loaded.last_used_at, Some(used));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn upsert_preserves_last_used_at() {
        let root = std::env::temp_dir().join(format!("git-forest-wt-{}", uuid::Uuid::new_v4()));
        let db = open_migrated(&root);
        seed_repository(&db);
        let used = Utc.with_ymd_and_hms(2026, 8, 25, 10, 0, 0).unwrap();
        upsert_worktree(db.connection(), &record(Some(used))).expect("insert");

        let mut next = record(None);
        next.name = "renamed".into();
        next.updated_at = Utc.with_ymd_and_hms(2026, 8, 25, 11, 0, 0).unwrap();
        upsert_worktree(db.connection(), &next).expect("update");

        let loaded = find_by_id(db.connection(), &WorktreeId::from_string("wt-1"))
            .expect("find")
            .expect("present");
        assert_eq!(loaded.name, "renamed");
        assert_eq!(loaded.last_used_at, Some(used));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn touch_records_usage_time() {
        let root = std::env::temp_dir().join(format!("git-forest-wt-{}", uuid::Uuid::new_v4()));
        let db = open_migrated(&root);
        seed_repository(&db);
        upsert_worktree(db.connection(), &record(None)).expect("insert");
        let used = Utc.with_ymd_and_hms(2026, 8, 25, 12, 0, 0).unwrap();
        touch_worktree_used(db.connection(), &WorktreeId::from_string("wt-1"), used)
            .expect("touch");

        let loaded = find_by_id(db.connection(), &WorktreeId::from_string("wt-1"))
            .expect("find")
            .expect("present");
        assert_eq!(loaded.last_used_at, Some(used));
        let _ = std::fs::remove_dir_all(root);
    }
}
