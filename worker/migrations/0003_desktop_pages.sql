PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS desktop_pages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE folders ADD COLUMN page_id TEXT REFERENCES desktop_pages(id) ON DELETE CASCADE;
ALTER TABLE links ADD COLUMN page_id TEXT REFERENCES desktop_pages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_desktop_pages_position ON desktop_pages(position, id);
CREATE INDEX IF NOT EXISTS idx_folders_page_position ON folders(page_id, position);
CREATE INDEX IF NOT EXISTS idx_links_page_position ON links(page_id, folder_id, position);

INSERT OR IGNORE INTO desktop_pages (id, name, position, created_at, updated_at)
VALUES ('desktop-page-home', '主页', 0, unixepoch(), unixepoch());

UPDATE folders
SET page_id = 'desktop-page-home'
WHERE page_id IS NULL;

UPDATE links
SET page_id = 'desktop-page-home'
WHERE page_id IS NULL;