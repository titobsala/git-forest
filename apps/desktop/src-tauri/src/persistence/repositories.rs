use std::path::Path;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use super::settings::parse_rfc3339;
use crate::domain::{ForestError, Repository, RepositoryHealth, RepositoryId, RepositoryMode};

const REPOSITORY_COLUMNS: &str = "id, name, path, mode, primary_branch, remote_url, last_refreshed_at, health, health_detail, last_reconciled_at, created_at, updated_at";

type RepositoryRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    String,
    String,
);

pub fn list_repositories(conn: &Connection) -> Result<Vec<Repository>, ForestError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {REPOSITORY_COLUMNS}
         FROM repositories
         ORDER BY name COLLATE NOCASE, path"
    ))?;
    let rows = statement.query_map([], read_row)?;
    let mut repositories = Vec::new();
    for row in rows {
        repositories.push(map_repository(row?)?);
    }
    Ok(repositories)
}

pub fn find_by_path(conn: &Connection, path: &Path) -> Result<Option<Repository>, ForestError> {
    let row = conn
        .query_row(
            &format!(
                "SELECT {REPOSITORY_COLUMNS}
                 FROM repositories
                 WHERE path = ?1"
            ),
            [path.to_string_lossy().as_ref()],
            read_row,
        )
        .optional()?;
    match row {
        Some(values) => Ok(Some(map_repository(values)?)),
        None => Ok(None),
    }
}

pub fn find_by_id(conn: &Connection, id: &RepositoryId) -> Result<Option<Repository>, ForestError> {
    let row = conn
        .query_row(
            &format!(
                "SELECT {REPOSITORY_COLUMNS}
                 FROM repositories
                 WHERE id = ?1"
            ),
            [id.as_str()],
            read_row,
        )
        .optional()?;
    match row {
        Some(values) => Ok(Some(map_repository(values)?)),
        None => Ok(None),
    }
}

pub fn insert_repository(conn: &Connection, repository: &Repository) -> Result<(), ForestError> {
    conn.execute(
        "INSERT INTO repositories (
            id, name, path, mode, primary_branch, remote_url, last_refreshed_at,
            health, health_detail, last_reconciled_at, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            repository.id.as_str(),
            repository.name,
            repository.path.to_string_lossy().as_ref(),
            repository.mode.as_str(),
            repository.primary_branch,
            repository.remote_url,
            rfc3339_opt(repository.last_refreshed_at),
            repository.health.as_str(),
            repository.health_detail,
            rfc3339_opt(repository.last_reconciled_at),
            repository.created_at.to_rfc3339(),
            repository.updated_at.to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn update_repository(conn: &Connection, repository: &Repository) -> Result<(), ForestError> {
    let changed = conn.execute(
        "UPDATE repositories SET
            name = ?2,
            path = ?3,
            mode = ?4,
            primary_branch = ?5,
            remote_url = ?6,
            last_refreshed_at = ?7,
            health = ?8,
            health_detail = ?9,
            last_reconciled_at = ?10,
            updated_at = ?11
         WHERE id = ?1",
        params![
            repository.id.as_str(),
            repository.name,
            repository.path.to_string_lossy().as_ref(),
            repository.mode.as_str(),
            repository.primary_branch,
            repository.remote_url,
            rfc3339_opt(repository.last_refreshed_at),
            repository.health.as_str(),
            repository.health_detail,
            rfc3339_opt(repository.last_reconciled_at),
            repository.updated_at.to_rfc3339()
        ],
    )?;
    if changed == 0 {
        return Err(ForestError::RepositoryNotFound);
    }
    Ok(())
}

pub fn delete_by_id(conn: &Connection, id: &RepositoryId) -> Result<bool, ForestError> {
    let changed = conn.execute("DELETE FROM repositories WHERE id = ?1", [id.as_str()])?;
    Ok(changed > 0)
}

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RepositoryRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
    ))
}

fn map_repository(
    (
        id,
        name,
        path,
        mode,
        primary_branch,
        remote_url,
        last_refreshed_at,
        health,
        health_detail,
        last_reconciled_at,
        created_at,
        updated_at,
    ): RepositoryRow,
) -> Result<Repository, ForestError> {
    Ok(Repository {
        id: RepositoryId::from_string(id),
        name,
        path: path.into(),
        mode: RepositoryMode::parse(&mode).map_err(ForestError::Database)?,
        primary_branch,
        remote_url,
        last_refreshed_at: last_refreshed_at
            .map(|value| parse_rfc3339(&value))
            .transpose()?,
        health: RepositoryHealth::parse(&health).map_err(ForestError::Database)?,
        health_detail,
        last_reconciled_at: last_reconciled_at
            .map(|value| parse_rfc3339(&value))
            .transpose()?,
        created_at: parse_rfc3339(&created_at)?,
        updated_at: parse_rfc3339(&updated_at)?,
    })
}

fn rfc3339_opt(value: Option<DateTime<Utc>>) -> Option<String> {
    value.map(|timestamp| timestamp.to_rfc3339())
}
