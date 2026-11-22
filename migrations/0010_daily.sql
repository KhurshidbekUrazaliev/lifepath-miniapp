-- The ayah and the hadith of the day, picked at random from Quran.com and Sahih al-Bukhari by the first
-- caller of each day (worker/src/daily.ts). `made_at` is when it was last tried; `done` once both are in.
CREATE TABLE IF NOT EXISTS daily (
  day TEXT PRIMARY KEY,
  ayah TEXT,
  hadith TEXT,
  made_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
