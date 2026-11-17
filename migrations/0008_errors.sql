-- Errors the app reports about itself, so that a release which breaks on some phones is noticed.
-- One row for each build and message, with a count. Nothing here says who it happened to.
CREATE TABLE errors (
  key      TEXT    PRIMARY KEY,                      -- a hash of the build and the message
  build    TEXT    NOT NULL,                         -- which build of the app (made when it is built; About shows it)
  kind     TEXT    NOT NULL CHECK (kind IN ('render', 'error', 'promise')),
  message  TEXT    NOT NULL,                         -- at most 200 characters
  stack    TEXT    NOT NULL DEFAULT '',              -- the top lines of the first one
  screen   TEXT    NOT NULL DEFAULT '',              -- where the latest one happened
  platform TEXT    NOT NULL DEFAULT '',              -- and on what: ios, android, tdesktop...
  tg       TEXT    NOT NULL DEFAULT '',              -- Telegram's version there
  lang     TEXT    NOT NULL DEFAULT '',
  count    INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_at  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX errors_build ON errors (build, last_at);
CREATE INDEX errors_last_at ON errors (last_at);
