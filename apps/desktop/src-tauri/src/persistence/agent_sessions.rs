use rusqlite::{params, Connection, OptionalExtension};

use super::settings::parse_rfc3339;
use crate::domain::{
    AgentDefinitionId, AgentSession, AgentSessionId, AgentSessionStatus, ForestError, WorktreeId,
};

const SESSION_COLUMNS: &str = "id, worktree_id, agent_definition_id, status, pid, process_start_ticks, launched_at, last_seen_at, exited_at";

pub fn insert_agent_session(conn: &Connection, session: &AgentSession) -> Result<(), ForestError> {
    conn.execute(
        "INSERT INTO agent_sessions (
            id, worktree_id, agent_definition_id, status, pid, process_start_ticks,
            launched_at, last_seen_at, exited_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            session.id.as_str(),
            session.worktree_id.as_str(),
            session.agent_definition_id.as_str(),
            session.status.as_str(),
            session.pid,
            session.process_start_ticks,
            session.launched_at.map(|value| value.to_rfc3339()),
            session.last_seen_at.map(|value| value.to_rfc3339()),
            session.exited_at.map(|value| value.to_rfc3339()),
        ],
    )?;
    Ok(())
}

pub fn update_agent_session(conn: &Connection, session: &AgentSession) -> Result<(), ForestError> {
    let changed = conn.execute(
        "UPDATE agent_sessions SET
            status = ?1,
            pid = ?2,
            process_start_ticks = ?3,
            last_seen_at = ?4,
            exited_at = ?5
         WHERE id = ?6",
        params![
            session.status.as_str(),
            session.pid,
            session.process_start_ticks,
            session.last_seen_at.map(|value| value.to_rfc3339()),
            session.exited_at.map(|value| value.to_rfc3339()),
            session.id.as_str(),
        ],
    )?;
    if changed == 0 {
        return Err(ForestError::Serialization(format!(
            "agent session was not found: {}",
            session.id.as_str()
        )));
    }
    Ok(())
}

pub fn list_agent_sessions(conn: &Connection) -> Result<Vec<AgentSession>, ForestError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {SESSION_COLUMNS} FROM agent_sessions
         ORDER BY launched_at DESC, id DESC"
    ))?;
    let rows = statement.query_map([], read_row)?;
    rows.map(|row| map_session(row?))
        .collect::<Result<Vec<_>, _>>()
}

#[allow(dead_code)]
pub fn list_sessions_for_worktree(
    conn: &Connection,
    worktree_id: &WorktreeId,
) -> Result<Vec<AgentSession>, ForestError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {SESSION_COLUMNS} FROM agent_sessions
         WHERE worktree_id = ?1
         ORDER BY launched_at DESC, id DESC"
    ))?;
    let rows = statement.query_map([worktree_id.as_str()], read_row)?;
    rows.map(|row| map_session(row?))
        .collect::<Result<Vec<_>, _>>()
}

#[allow(dead_code)]
pub fn get_agent_session(
    conn: &Connection,
    id: &AgentSessionId,
) -> Result<Option<AgentSession>, ForestError> {
    conn.query_row(
        &format!("SELECT {SESSION_COLUMNS} FROM agent_sessions WHERE id = ?1"),
        [id.as_str()],
        read_row,
    )
    .optional()?
    .map(map_session)
    .transpose()
}

#[allow(dead_code)]
pub fn count_active_sessions(conn: &Connection) -> Result<i64, ForestError> {
    let count = conn.query_row(
        "SELECT COUNT(*) FROM agent_sessions WHERE status IN ('starting', 'running')",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn list_finished_sessions(conn: &Connection) -> Result<Vec<AgentSession>, ForestError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {SESSION_COLUMNS} FROM agent_sessions
         WHERE status IN ('exited', 'failed')
         ORDER BY launched_at DESC, id DESC"
    ))?;
    let rows = statement.query_map([], read_row)?;
    rows.map(|row| map_session(row?))
        .collect::<Result<Vec<_>, _>>()
}

pub fn delete_finished_sessions(conn: &Connection) -> Result<u32, ForestError> {
    let changed = conn.execute(
        "DELETE FROM agent_sessions WHERE status IN ('exited', 'failed')",
        [],
    )?;
    Ok(changed as u32)
}

type SessionRow = (
    String,
    String,
    String,
    String,
    Option<i64>,
    Option<i64>,
    Option<String>,
    Option<String>,
    Option<String>,
);

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRow> {
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
    ))
}

fn map_session(
    (
        id,
        worktree_id,
        agent_definition_id,
        status,
        pid,
        process_start_ticks,
        launched_at,
        last_seen_at,
        exited_at,
    ): SessionRow,
) -> Result<AgentSession, ForestError> {
    Ok(AgentSession {
        id: AgentSessionId::from_string(id),
        worktree_id: WorktreeId::from_string(worktree_id),
        agent_definition_id: AgentDefinitionId::from_string(agent_definition_id),
        status: AgentSessionStatus::parse(&status)?,
        pid,
        process_start_ticks,
        launched_at: launched_at.as_deref().map(parse_rfc3339).transpose()?,
        last_seen_at: last_seen_at.as_deref().map(parse_rfc3339).transpose()?,
        exited_at: exited_at.as_deref().map(parse_rfc3339).transpose()?,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        count_active_sessions, get_agent_session, insert_agent_session, list_agent_sessions,
        list_sessions_for_worktree, update_agent_session,
    };
    use crate::domain::{
        AgentDefinitionId, AgentSession, AgentSessionId, AgentSessionStatus, WorktreeId,
    };
    use crate::persistence::Database;
    use chrono::{DateTime, TimeZone, Utc};

    fn open_seeded(root: &std::path::Path) -> Database {
        let db = Database::open(&root.join("forest.db")).expect("open");
        db.migrate().expect("migrate");
        db.connection()
            .execute(
                "INSERT INTO repositories (id, name, path, mode, created_at, updated_at)
                 VALUES ('repo-1', 'Acme App', '/tmp/acme-app', 'linked', '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z')",
                [],
            )
            .expect("repo");
        db.connection()
            .execute(
                "INSERT INTO worktrees (id, repository_id, name, path, branch, created_at, updated_at)
                 VALUES ('wt-1', 'repo-1', 'feat-auth-142', '/tmp/feat-auth-142', 'feat/auth-142', '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z')",
                [],
            )
            .expect("worktree");
        db.connection()
            .execute(
                "INSERT INTO agent_definitions (id, name, command, args_json, is_builtin)
                 VALUES ('codex', 'Codex', 'codex', '[]', 1)",
                [],
            )
            .expect("agent");
        db
    }

    fn session(id: &str, status: AgentSessionStatus, launched_at: Option<&str>) -> AgentSession {
        AgentSession {
            id: AgentSessionId::from_string(id),
            worktree_id: WorktreeId::from_string("wt-1"),
            agent_definition_id: AgentDefinitionId::from_string("codex"),
            status,
            pid: None,
            process_start_ticks: None,
            launched_at: launched_at.map(|value| {
                DateTime::parse_from_rfc3339(value)
                    .unwrap()
                    .with_timezone(&Utc)
            }),
            last_seen_at: None,
            exited_at: None,
        }
    }

    #[test]
    fn round_trips_every_status_and_process_identity() {
        let root = std::env::temp_dir().join(format!("git-forest-sess-{}", uuid::Uuid::new_v4()));
        let db = open_seeded(&root);
        let used = Utc.with_ymd_and_hms(2026, 8, 25, 10, 0, 0).unwrap();
        let mut record = session(
            "session-1",
            AgentSessionStatus::Running,
            Some("2026-08-25T10:00:00Z"),
        );
        record.pid = Some(4242);
        record.process_start_ticks = Some(99);
        record.last_seen_at = Some(used);
        insert_agent_session(db.connection(), &record).expect("insert");

        let loaded = get_agent_session(db.connection(), &record.id)
            .expect("get")
            .expect("present");
        assert_eq!(loaded.status, AgentSessionStatus::Running);
        assert_eq!(loaded.pid, Some(4242));
        assert_eq!(loaded.process_start_ticks, Some(99));
        assert_eq!(loaded.last_seen_at, Some(used));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn counts_only_starting_and_running_sessions() {
        let root = std::env::temp_dir().join(format!("git-forest-sess-{}", uuid::Uuid::new_v4()));
        let db = open_seeded(&root);
        insert_agent_session(
            db.connection(),
            &session(
                "s-start",
                AgentSessionStatus::Starting,
                Some("2026-08-25T10:00:00Z"),
            ),
        )
        .unwrap();
        insert_agent_session(
            db.connection(),
            &session(
                "s-run",
                AgentSessionStatus::Running,
                Some("2026-08-25T10:01:00Z"),
            ),
        )
        .unwrap();
        insert_agent_session(
            db.connection(),
            &session(
                "s-exit",
                AgentSessionStatus::Exited,
                Some("2026-08-25T10:02:00Z"),
            ),
        )
        .unwrap();
        insert_agent_session(
            db.connection(),
            &session(
                "s-unknown",
                AgentSessionStatus::Unknown,
                Some("2026-08-25T10:03:00Z"),
            ),
        )
        .unwrap();
        insert_agent_session(
            db.connection(),
            &session(
                "s-failed",
                AgentSessionStatus::Failed,
                Some("2026-08-25T10:04:00Z"),
            ),
        )
        .unwrap();

        assert_eq!(count_active_sessions(db.connection()).expect("count"), 2);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn lists_multiple_sessions_newest_first() {
        let root = std::env::temp_dir().join(format!("git-forest-sess-{}", uuid::Uuid::new_v4()));
        let db = open_seeded(&root);
        insert_agent_session(
            db.connection(),
            &session(
                "older",
                AgentSessionStatus::Exited,
                Some("2026-08-25T09:00:00Z"),
            ),
        )
        .unwrap();
        insert_agent_session(
            db.connection(),
            &session(
                "newer",
                AgentSessionStatus::Running,
                Some("2026-08-25T11:00:00Z"),
            ),
        )
        .unwrap();

        let listed = list_agent_sessions(db.connection()).expect("list");
        assert_eq!(
            listed
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            vec!["newer", "older"]
        );
        let for_worktree =
            list_sessions_for_worktree(db.connection(), &WorktreeId::from_string("wt-1"))
                .expect("by worktree");
        assert_eq!(for_worktree.len(), 2);

        let mut running = get_agent_session(db.connection(), &AgentSessionId::from_string("newer"))
            .unwrap()
            .unwrap();
        running.status = AgentSessionStatus::Exited;
        running.exited_at = Some(Utc.with_ymd_and_hms(2026, 8, 25, 12, 0, 0).unwrap());
        update_agent_session(db.connection(), &running).expect("update");
        let updated = get_agent_session(db.connection(), &running.id)
            .unwrap()
            .unwrap();
        assert_eq!(updated.status, AgentSessionStatus::Exited);
        assert_eq!(count_active_sessions(db.connection()).unwrap(), 0);
        let _ = std::fs::remove_dir_all(root);
    }
}
