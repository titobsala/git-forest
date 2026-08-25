ALTER TABLE worktrees ADD COLUMN last_used_at TEXT;
CREATE INDEX idx_worktrees_last_used_at ON worktrees(last_used_at);
