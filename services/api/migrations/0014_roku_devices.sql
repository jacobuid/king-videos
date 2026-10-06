CREATE TABLE roku_pairings (
  token_hash TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  requester_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX roku_pairings_requester ON roku_pairings(requester_hash, created_at);
CREATE TABLE roku_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Roku',
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX roku_devices_user ON roku_devices(user_id);
