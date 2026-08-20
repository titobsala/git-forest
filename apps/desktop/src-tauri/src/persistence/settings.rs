use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{ForestConfiguration, ForestError};

const FOREST_CONFIGURATION_KEY: &str = "forest_configuration";

pub fn load_configuration(conn: &Connection) -> Result<Option<ForestConfiguration>, ForestError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value_json FROM settings WHERE key = ?1",
            [FOREST_CONFIGURATION_KEY],
            |row| row.get(0),
        )
        .optional()?;

    match value {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}

pub fn save_configuration(
    conn: &Connection,
    configuration: &ForestConfiguration,
) -> Result<(), ForestError> {
    let json = serde_json::to_string(configuration)?;
    conn.execute(
        "INSERT INTO settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at",
        params![FOREST_CONFIGURATION_KEY, json, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn parse_rfc3339(value: &str) -> Result<DateTime<Utc>, ForestError> {
    DateTime::parse_from_rfc3339(value)
        .map(|parsed| parsed.with_timezone(&Utc))
        .map_err(|error| ForestError::InvalidTimestamp(error.to_string()))
}
