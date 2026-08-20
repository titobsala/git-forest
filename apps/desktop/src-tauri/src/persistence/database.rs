use std::path::Path;

use chrono::Utc;
use rusqlite::Connection;

use crate::domain::ForestError;

const INITIAL_MIGRATION: &str = include_str!("../../migrations/001_initial.sql");

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

        if self.schema_version()? < 1 {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(INITIAL_MIGRATION)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
                [Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
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
    use super::Database;
    use std::path::PathBuf;

    fn temp_db_path() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("git-forest-db-{}", uuid::Uuid::new_v4()));
        let path = root.join("forest.db");
        (root, path)
    }

    #[test]
    fn migration_001_applies_once_and_is_idempotent() {
        let (root, path) = temp_db_path();
        let db = Database::open(&path).expect("open");
        let first = db.migrate().expect("first migrate");
        let second = db.migrate().expect("second migrate");

        assert_eq!(first, 1);
        assert_eq!(second, 1);

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
}
