use std::path::Path;

use chrono::Utc;
use rusqlite::Connection;

use crate::domain::ForestError;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/001_initial.sql"),
    include_str!("../../migrations/002_repository_metadata.sql"),
];

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, ForestError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Ok(Self { conn })
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn migrate(&self) -> Result<u32, ForestError> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                applied_at TEXT NOT NULL
            )",
            [],
        )?;

        let mut current = self.schema_version()?;
        for (index, sql) in MIGRATIONS.iter().enumerate() {
            let version = (index + 1) as u32;
            if current >= version {
                continue;
            }
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                rusqlite::params![version, Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
            current = version;
        }

        self.schema_version()
    }

    pub fn schema_version(&self) -> Result<u32, ForestError> {
        let version = self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }
}

#[cfg(test)]
mod tests {
    use super::{Database, MIGRATIONS};
    use std::path::PathBuf;

    fn temp_db_path() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("git-forest-db-{}", uuid::Uuid::new_v4()));
        let path = root.join("forest.db");
        (root, path)
    }

    #[test]
    fn migrations_apply_once_and_are_idempotent() {
        let (root, path) = temp_db_path();
        let db = Database::open(&path).expect("open");
        let first = db.migrate().expect("first migrate");
        let second = db.migrate().expect("second migrate");

        assert_eq!(first, MIGRATIONS.len() as u32);
        assert_eq!(second, MIGRATIONS.len() as u32);

        let count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'repositories'",
                [],
                |row| row.get(0),
            )
            .expect("table lookup");
        assert_eq!(count, 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migration_002_preserves_existing_repository_rows() {
        let (root, path) = temp_db_path();
        let db = Database::open(&path).expect("open");
        db.connection()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL
                );",
            )
            .expect("migrations table");
        db.connection().execute_batch(MIGRATIONS[0]).expect("001");
        db.connection()
            .execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-08-20T09:00:00Z')",
                [],
            )
            .expect("mark 001");
        db.connection()
            .execute(
                "INSERT INTO repositories (id, name, path, mode, created_at, updated_at)
                 VALUES ('repo-1', 'EXOG App', '/tmp/exog-app', 'linked', '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z')",
                [],
            )
            .expect("seed");

        let version = db.migrate().expect("upgrade");
        assert_eq!(version, 2);

        let (name, branch, remote, refreshed) = db
            .connection()
            .query_row(
                "SELECT name, primary_branch, remote_url, last_refreshed_at FROM repositories WHERE id = 'repo-1'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .expect("row");
        assert_eq!(name, "EXOG App");
        assert_eq!(branch, None);
        assert_eq!(remote, None);
        assert_eq!(refreshed, None);
        let _ = std::fs::remove_dir_all(root);
    }
}
