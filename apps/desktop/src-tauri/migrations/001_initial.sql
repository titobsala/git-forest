CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE repositories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL CHECK (mode IN ('managed', 'linked')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE worktrees (
    id TEXT PRIMARY KEY NOT NULL,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    branch TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (repository_id, path)
);

CREATE TABLE agent_definitions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    args_json TEXT NOT NULL DEFAULT '[]',
    is_builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id),
    status TEXT NOT NULL,
    pid INTEGER,
    launched_at TEXT,
    last_seen_at TEXT,
    exited_at TEXT
);

CREATE INDEX idx_worktrees_repository_id ON worktrees(repository_id);
CREATE INDEX idx_agent_sessions_worktree_id ON agent_sessions(worktree_id);
