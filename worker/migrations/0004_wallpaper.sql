CREATE TABLE IF NOT EXISTS wallpaper_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  object_key TEXT,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO wallpaper_config (id, object_key, content_type, size_bytes, version, updated_at)
VALUES (1, NULL, NULL, 0, 1, unixepoch());