ALTER TABLE repositories ADD COLUMN health TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health IN ('unknown', 'available', 'missing', 'invalid', 'unavailable'));
ALTER TABLE repositories ADD COLUMN health_detail TEXT;
ALTER TABLE repositories ADD COLUMN last_reconciled_at TEXT;
