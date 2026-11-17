-- Group khatm: friends or a family read the Qurʼan together. One person starts it and shares the invite
-- link; each member takes the juz they will read and marks them when they are read. When all thirty
-- are read the round is complete, and the one who started it can begin the next round.
CREATE TABLE gkhatms (
  id         TEXT    PRIMARY KEY,                    -- 8 letters and digits; invite links carry it
  owner      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  due        TEXT,                                   -- YYYY-MM-DD the group wants to finish by, if any
  round      INTEGER NOT NULL DEFAULT 1,
  done_at    INTEGER,                                -- when the thirtieth juz of this round was marked read
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL                        -- the last change: a khatm nobody touches for half a year is deleted
);
CREATE INDEX gkhatms_updated_at ON gkhatms (updated_at);

CREATE TABLE gkhatm_members (
  khatm_id       TEXT    NOT NULL REFERENCES gkhatms (id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key            TEXT    NOT NULL,                   -- what the app calls this member by (never their Telegram id)
  joined_at      INTEGER NOT NULL,
  notified_round INTEGER NOT NULL DEFAULT 0,         -- the last finished round the bot told them about
  PRIMARY KEY (khatm_id, user_id),
  UNIQUE (khatm_id, key)
) WITHOUT ROWID;
CREATE INDEX gkhatm_members_user ON gkhatm_members (user_id);

-- A juz somebody took. A free juz has no row.
CREATE TABLE gkhatm_parts (
  khatm_id TEXT    NOT NULL REFERENCES gkhatms (id) ON DELETE CASCADE,
  juz      INTEGER NOT NULL CHECK (juz BETWEEN 1 AND 30),
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  taken_at INTEGER NOT NULL,
  done_at  INTEGER,                                  -- set when its reader marks it read
  done_day TEXT,                                     -- the reader's own calendar day then: XP is capped per day
  xp       INTEGER NOT NULL DEFAULT 0,               -- the XP the app gave for the mark (taken back with it)
  PRIMARY KEY (khatm_id, juz)
) WITHOUT ROWID;
CREATE INDEX gkhatm_parts_user ON gkhatm_parts (user_id, done_day);
