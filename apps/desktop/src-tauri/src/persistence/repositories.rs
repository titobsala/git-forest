use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::settings::parse_rfc3339;
use crate::domain::{ForestError, Repository, RepositoryId, RepositoryMode};

pub fn list_repositories(conn: &Connection) -> Result<Vec<Repository>, ForestError> {
    let mut statement = conn.prepare(
        "SELECT id, name, path, mode, created_at, updated_at
         FROM repositories
         ORDER BY name COLLATE NOCASE, path",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;

    let mut repositories = Vec::new();
    for row in rows {
        let (id, name, path, mode, created_at, updated_at) = row?;
        repositories.push(map_repository(
            id, name, path, mode, created_at, updated_at,
        )?);
    }
    Ok(repositories)
}

pub fn find_by_path(conn: &Connection, path: &Path) -> Result<Option<Repository>, ForestError> {
    let row = conn
        .query_row(
            "SELECT id, name, path, mode, created_at, updated_at
             FROM repositories
             WHERE path = ?1",
            [path.to_string_lossy().as_ref()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?;

    match row {
        Some((id, name, path, mode, created_at, updated_at)) => Ok(Some(map_repository(
            id, name, path, mode, created_at, updated_at,
        )?)),
        None => Ok(None),
    }
}

pub fn insert_repository(conn: &Connection, repository: &Repository) -> Result<(), ForestError> {
    conn.execute(
        "INSERT INTO repositories (id, name, path, mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            repository.id.as_str(),
            repository.name,
            repository.path.to_string_lossy().as_ref(),
            repository.mode.as_str(),
            repository.created_at.to_rfc3339(),
            repository.updated_at.to_rfc3339()
        ],
    )?;
    Ok(())
}

fn map_repository(
    id: String,
    name: String,
    path: String,
    mode: String,
    created_at: String,
    updated_at: String,
) -> Result<Repository, ForestError> {
    Ok(Repository {
        id: RepositoryId::from_string(id),
        name,
        path: path.into(),
        mode: RepositoryMode::parse(&mode).map_err(ForestError::Database)?,
        created_at: parse_rfc3339(&created_at)?,
        updated_at: parse_rfc3339(&updated_at)?,
    })
}
