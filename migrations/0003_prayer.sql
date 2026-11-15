-- Prayer reminders. Prayer times move a little every day, so the Worker works each one out itself
-- (with the app's own calculation, src/lib/prayerTimes.ts) and they keep arriving on days the app
-- is not opened. One row per user with where and how to calculate; one reminder row per prayer.
CREATE TABLE prayer_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  lat     REAL    NOT NULL,                         -- rounded to 0.01°, about a kilometre
  lon     REAL    NOT NULL,
  tz      TEXT    NOT NULL,                         -- the place's time zone; messages show its clock
  method  TEXT    NOT NULL,                         -- a key of METHODS in prayerTimes.ts
  asr     TEXT    NOT NULL CHECK (asr IN ('standard', 'hanafi')),
  before  INTEGER NOT NULL DEFAULT 0 CHECK (before BETWEEN 0 AND 60) -- minutes ahead of the prayer
);

-- reminders.kind gains 'prayer' (id "~fajr" and so on; hour and minute only record the last time
-- worked out). SQLite cannot change a CHECK constraint, so the table is rebuilt.
CREATE TABLE reminders_new (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id      TEXT    NOT NULL,
  kind    TEXT    NOT NULL DEFAULT 'item' CHECK (kind IN ('item', 'nudge', 'prayer')),
  text    TEXT    NOT NULL,
  hour    INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute  INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
  days    TEXT,
  date    TEXT,
  open    TEXT,
  next_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
) WITHOUT ROWID;

INSERT INTO reminders_new (user_id, id, kind, text, hour, minute, days, date, open, next_at)
  SELECT user_id, id, kind, text, hour, minute, days, date, open, next_at FROM reminders;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX reminders_next_at ON reminders (next_at);
