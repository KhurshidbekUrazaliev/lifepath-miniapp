-- Web push (worker/src/push.ts): the browsers and home-screen apps (iPhone, desktop) that asked to
-- get the reminders as notifications. The endpoint is the push service's address for that browser.
CREATE TABLE push_subs (
  endpoint   TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX push_subs_user ON push_subs (user_id, created_at);
