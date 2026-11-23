-- The Android app (worker/src/app.ts). It is not opened by Telegram, so it signs in through the bot:
-- the app asks for a code, the user opens the bot with it and presses Start, and the app collects
-- a session token. Only a hash of the token is kept.
CREATE TABLE IF NOT EXISTS app_logins (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  user_id INTEGER,
  -- Set when the bot confirms; handed to the app once, then the row is deleted.
  token TEXT
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions (user_id);

-- The shared copy of a user's data, laid out like Telegram CloudStorage (src/lib/cloudCodec.ts):
-- the Mini App and the Android app both sync with it. The journal ("j" chunks) is never stored here.
CREATE TABLE IF NOT EXISTS user_kv (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
