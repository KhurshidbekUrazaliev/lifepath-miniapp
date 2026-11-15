-- The owner's panel: who uses the app, and what the owner has opened for someone.

-- When each person last opened the app (written at most every ten minutes).
ALTER TABLE users ADD COLUMN seen_at INTEGER NOT NULL DEFAULT 0;
UPDATE users SET seen_at = updated_at;

-- All the XP the app counts, so the panel can show it next to the level. (total_xp is only the XP that
-- has proof: that is what the rankings compare.)
ALTER TABLE scores ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

-- What the owner has opened for a person. One row per person who was ever given something.
CREATE TABLE grants (
  user_id    INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  levels     INTEGER NOT NULL DEFAULT 0,             -- 1: everything that waits for a level is open
  plus       INTEGER NOT NULL DEFAULT 0,             -- 1: LifePath Plus without paying
  sparks     INTEGER NOT NULL DEFAULT 0,             -- Sparks given on top of the ones they earned
  updated_at INTEGER NOT NULL
);
