PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS desktop_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '▰',
  color TEXT NOT NULL DEFAULT '#f4c84a',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#e8d9dc',
  open_mode TEXT NOT NULL DEFAULT 'auto' CHECK (open_mode IN ('auto', 'same', 'new')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_folder_position ON links(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_client_time ON login_attempts(client_hash, attempted_at);

INSERT OR IGNORE INTO desktop_meta (id, version, updated_at)
VALUES (1, 1, unixepoch());

INSERT OR IGNORE INTO folders (id, name, icon, color, position, created_at, updated_at)
VALUES ('folder-lightwind', '轻风雨斜 OS', '✦', '#f4c84a', 0, unixepoch(), unixepoch());

INSERT OR IGNORE INTO links (id, folder_id, title, url, icon, color, open_mode, position, created_at, updated_at)
VALUES
  ('link-dynamic', 'folder-lightwind', '动态', '/dynamic/', '◫', '#e33a52', 'same', 0, unixepoch(), unixepoch()),
  ('link-about', 'folder-lightwind', '关于', '/about.html', '@', '#d8b4bd', 'same', 1, unixepoch(), unixepoch()),
  ('link-github', NULL, 'GitHub', 'https://github.com/QingFengYuXie', '⌘', '#ddd5d7', 'new', 1, unixepoch(), unixepoch()),
  ('link-contact', NULL, '联系我', 'mailto:2399975530@qq.com', '@', '#e8d9dc', 'same', 2, unixepoch(), unixepoch());
