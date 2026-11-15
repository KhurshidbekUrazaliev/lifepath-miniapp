-- Friend challenges: a short race between friends who joined by an invite link. Each member's score is
-- how far one of their counters (XP, prayers marked, Qurʼan pages, focus minutes) has moved since they
-- joined; the app reports the counters with its activity.
CREATE TABLE challenges (
  id         TEXT    PRIMARY KEY,                    -- 8 letters and digits; invite links carry it
  owner      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('xp', 'prayer', 'quran', 'focus')),
  days       INTEGER NOT NULL CHECK (days BETWEEN 1 AND 30),
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL
);
CREATE INDEX challenges_ends_at ON challenges (ends_at);

CREATE TABLE challenge_members (
  challenge_id TEXT    NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  base         INTEGER NOT NULL,                     -- the counter when they joined
  score        INTEGER NOT NULL DEFAULT 0,           -- how far it has moved since (capped per day)
  joined_at    INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,                     -- when the score last moved: ties go to whoever got there first
  notified     INTEGER NOT NULL DEFAULT 0,           -- 1 once the bot has sent them the result
  PRIMARY KEY (challenge_id, user_id)
) WITHOUT ROWID;
CREATE INDEX challenge_members_user ON challenge_members (user_id);

-- Pictures for Telegram Stories. A story needs an image at a public address; the app draws one and
-- keeps it here for a day.
CREATE TABLE stories (
  id         TEXT    PRIMARY KEY,                    -- random, so addresses cannot be guessed
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  image      BLOB    NOT NULL,                       -- a JPEG
  created_at INTEGER NOT NULL
);
CREATE INDEX stories_created_at ON stories (created_at);
CREATE INDEX stories_user ON stories (user_id);
