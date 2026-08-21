ALTER TABLE repositories ADD COLUMN primary_branch TEXT;
ALTER TABLE repositories ADD COLUMN remote_url TEXT;
ALTER TABLE repositories ADD COLUMN last_refreshed_at TEXT;
