CREATE TABLE IF NOT EXISTS music_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS music_tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_music_tracks_position ON music_tracks(position);

INSERT OR IGNORE INTO music_meta (id, version, updated_at)
VALUES (1, 1, unixepoch());

INSERT OR IGNORE INTO music_tracks (id, title, url, position, created_at, updated_at)
VALUES (
  'track-default',
  '默认音乐',
  'https://aqqmusic.tc.qq.com/C400004JYkhl1ccbXL.m4a?guid=570938557&vkey=42950A34D64304D428C93616A08F00B56C650CCEEC25DEA15B6B2E62C3299994155260AC0D1FF6780BA27D7AFDF908AFFF7A7B76698B075B__v2b94c62d&uin=&fromtag=120032',
  0,
  unixepoch(),
  unixepoch()
);
