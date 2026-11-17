-- Buddy streaks: two friends keep one streak together. One of them shares their invite link and the
-- other accepts it. A day counts when both did at least one thing in the app that day, each by their
-- own calendar; the app reports the day it was last active with its activity.
CREATE TABLE buddy_invites (
  code       TEXT    PRIMARY KEY,                    -- 8 letters and digits; a person's invite link carries it
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE buddies (
  id         TEXT    PRIMARY KEY,                    -- 8 letters and digits
  a          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- the smaller of the two user ids
  b          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- the larger one
  a_day      TEXT,                                   -- the last day a was active (YYYY-MM-DD, their own calendar)
  a_prev     TEXT,                                   -- and the active day before that: calendars can be a day apart
  b_day      TEXT,
  b_prev     TEXT,
  both_day   TEXT,                                   -- the last day both were active
  streak     INTEGER NOT NULL DEFAULT 0,             -- shared days in a row, ending at both_day
  best       INTEGER NOT NULL DEFAULT 0,
  a_nudged   TEXT,                                   -- the day (a's calendar) a last nudged b: one nudge a day
  b_nudged   TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (a, b),
  CHECK (a < b)
);
CREATE INDEX buddies_b ON buddies (b);
