ALTER TABLE agent_sessions ADD COLUMN process_start_ticks INTEGER;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
