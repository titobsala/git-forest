use rusqlite::{params, Connection};

use crate::domain::{AgentDefinition, AgentDefinitionId, ForestError};

const BUILTIN_AGENTS: &[(&str, &str, &str)] = &[
    ("codex", "Codex", "codex"),
    ("claude", "Claude Code", "claude"),
    ("opencode", "OpenCode", "opencode"),
    ("cursor", "Cursor CLI", "cursor"),
];

pub fn seed_builtin_agents(conn: &Connection) -> Result<(), ForestError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM agent_definitions", [], |row| {
        row.get(0)
    })?;
    if count > 0 {
        return Ok(());
    }

    for (id, name, command) in BUILTIN_AGENTS {
        conn.execute(
            "INSERT INTO agent_definitions (id, name, command, args_json, is_builtin)
             VALUES (?1, ?2, ?3, '[]', 1)",
            params![id, name, command],
        )?;
    }

    Ok(())
}

pub fn list_agent_definitions(conn: &Connection) -> Result<Vec<AgentDefinition>, ForestError> {
    let mut statement = conn.prepare(
        "SELECT id, name, command, args_json, is_builtin
         FROM agent_definitions
         ORDER BY name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;

    let mut definitions = Vec::new();
    for row in rows {
        let (id, name, command, args_json, is_builtin) = row?;
        definitions.push(AgentDefinition {
            id: AgentDefinitionId::from_string(id),
            name,
            command,
            args: serde_json::from_str(&args_json)?,
            is_builtin: is_builtin != 0,
        });
    }
    Ok(definitions)
}

pub fn agent_exists(conn: &Connection, id: &str) -> Result<bool, ForestError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_definitions WHERE id = ?1",
        [id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
