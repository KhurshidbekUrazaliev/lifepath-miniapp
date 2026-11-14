-- LifePath: initial schema (Cloudflare D1 / SQLite).
-- Times are epoch milliseconds (UTC) unless a column says otherwise.

CREATE TABLE users (
  id                INTEGER PRIMARY KEY,            -- Telegram user id
  first_name        TEXT    NOT NULL DEFAULT '',
  username          TEXT,
  tg_lang           TEXT,                           -- language_code reported by Telegram
  lang              TEXT    NOT NULL DEFAULT 'en',  -- app language: en, uz or ru
  tz                TEXT    NOT NULL DEFAULT 'UTC', -- IANA time zone
  can_message       INTEGER NOT NULL DEFAULT 0,     -- 1 when the bot may message the user
  reminders_enabled INTEGER NOT NULL DEFAULT 0,
  open_label        TEXT    NOT NULL DEFAULT '',    -- localized text of the reminder button
  last_active_day   TEXT,                           -- YYYY-MM-DD in the user's time zone
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- One row per reminder the user has scheduled, plus one row ('~nudge') for the daily nudge.
CREATE TABLE reminders (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id      TEXT    NOT NULL,                         -- id chosen by the app
  kind    TEXT    NOT NULL DEFAULT 'item' CHECK (kind IN ('item', 'nudge')),
  text    TEXT    NOT NULL,
  hour    INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute  INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
  days    TEXT,                                     -- weekdays as digits, 1 = Sunday to 7 = Saturday. NULL for a one-off
  date    TEXT,                                     -- YYYY-MM-DD for a one-off
  open    TEXT,                                     -- deep-link parameter for the button
  next_at INTEGER NOT NULL,                         -- next fire time
  PRIMARY KEY (user_id, id)
) WITHOUT ROWID;

-- The cron reads only the rows that are due.
CREATE INDEX reminders_next_at ON reminders (next_at);

-- Ranking profile and score of a user.
CREATE TABLE scores (
  user_id    INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  opted_in   INTEGER NOT NULL DEFAULT 0,
  name       TEXT,                                  -- display name shown to others
  country    TEXT,                                  -- ISO 3166-1 alpha-2
  total_xp   INTEGER NOT NULL DEFAULT 0,
  week_xp    INTEGER NOT NULL DEFAULT 0,
  week_start INTEGER NOT NULL DEFAULT 0,            -- Monday 00:00 UTC of the week week_xp belongs to
  level      INTEGER NOT NULL DEFAULT 0,
  streak     INTEGER NOT NULL DEFAULT 0,
  day        INTEGER NOT NULL DEFAULT 0,            -- UTC day number that day_base belongs to
  day_base   INTEGER NOT NULL DEFAULT 0,            -- week_xp at the start of that day (daily growth cap)
  xp_at      INTEGER NOT NULL DEFAULT 0             -- when the score last changed (breaks ties)
);

-- Rankings scan only the people who opted in, and only one country when asked.
CREATE INDEX scores_board ON scores (country) WHERE opted_in = 1;

-- LifePath Plus: one row per user who has ever paid.
CREATE TABLE entitlements (
  user_id    INTEGER PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  renew      TEXT    NOT NULL DEFAULT 'none',       -- active, canceled, failed, refunded or none
  charge_id  TEXT,                                  -- payment behind the current period
  updated_at INTEGER NOT NULL
);

-- Ledger of Telegram Stars payments. charge_id is telegram_payment_charge_id.
CREATE TABLE payments (
  charge_id      TEXT    PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  amount         INTEGER NOT NULL,                  -- Stars
  currency       TEXT    NOT NULL,
  payload        TEXT    NOT NULL,
  recurring      INTEGER NOT NULL DEFAULT 0,
  sub_expires_at INTEGER,                           -- subscription_expiration_date, when present
  status         TEXT    NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  created_at     INTEGER NOT NULL,
  refunded_at    INTEGER
);

CREATE INDEX payments_user ON payments (user_id);

-- Small key/value store: bot_username, app_url, pause_until.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
