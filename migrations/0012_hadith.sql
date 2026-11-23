-- Hadith the companion's Hadis button has looked at (worker/src/hadith.ts), so each is fetched and
-- translated once. id is "<book>:<number>"; data is null for one that does not suit the button
-- (too long, or not the Prophet's own words). The Uzbek is the AI's, so Uzbek users see one only
-- after the owner checked it in the admin screen: uz_ok 0 = waiting, 1 = approved, -1 = not for Uzbek.
CREATE TABLE hadith_cache (
  id      TEXT PRIMARY KEY,
  data    TEXT,
  made_at INTEGER NOT NULL,
  uz_ok   INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX hadith_cache_uz ON hadith_cache (uz_ok, made_at);

-- The hadith of the day, as the owner chose it (from the checked ones) for a date. A date with none
-- by 12:00 in Busan (03:00 UTC) has no hadith from the server, and the app shows one of its own 87.
CREATE TABLE daily_pick (
  day       TEXT PRIMARY KEY,
  id        TEXT NOT NULL,
  data      TEXT NOT NULL,
  chosen_at INTEGER NOT NULL
) WITHOUT ROWID;
