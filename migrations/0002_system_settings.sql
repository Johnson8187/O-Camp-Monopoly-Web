-- Migration for system settings (DO toggle, maintenance mode, etc.)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('do_enabled', '1', datetime('now'));
