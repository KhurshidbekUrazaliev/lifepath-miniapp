-- A user who blocked the bot stays unreachable until they write to it or unblock it, even though
-- the Mini App's launch data keeps saying that they once allowed the bot to message them.
ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
