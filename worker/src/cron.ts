// The cron (every minute): sends the reminders and nudges that are due.
import { baseUrl, type Env } from './env';
import { TEXT } from './i18n';
import type { ReminderRow } from './reminders';
import { openButton, tg } from './telegram';
import { localDay, nextFire } from './time';
import { blockedStatement, rows } from './users';

/** Messages per run. With three database calls this stays well under the free plan's 50 subrequests. */
const BATCH = 30;
/** A slot this late is dropped instead of delivered. */
const STALE_MS = 2 * 60 * 60 * 1000;
/** The longest pause a 429 from Telegram can cause. */
const MAX_PAUSE_MS = 60 * 60 * 1000;
/** The pause after any other failure that stops a run (Telegram down, bad token). */
const OUTAGE_PAUSE_MS = 5 * 60 * 1000;

interface Due extends ReminderRow {
  user_id: number;
  tz: string;
  can_message: number;
  reminders_enabled: number;
  open_label: string;
  last_active_day: string | null;
}

const DUE = `
  SELECT r.user_id, r.id, r.kind, r.text, r.hour, r.minute, r.days, r.date, r.open, r.next_at,
         u.tz, u.can_message, u.reminders_enabled, u.open_label, u.last_active_day
  FROM reminders r CROSS JOIN users u ON u.id = r.user_id
  WHERE r.next_at <= ?1
  ORDER BY r.next_at
  LIMIT ?2`;

// Undoes a claim when the message could not be sent, unless the row changed in the meantime.
const PUT_BACK = `
  INSERT INTO reminders (user_id, id, kind, text, hour, minute, days, date, open, next_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT (user_id, id) DO UPDATE SET next_at = excluded.next_at WHERE reminders.next_at = ?11`;

function putBack(db: D1Database, r: Due, claimedNext: number | null): D1PreparedStatement {
  return db
    .prepare(PUT_BACK)
    .bind(r.user_id, r.id, r.kind, r.text, r.hour, r.minute, r.days, r.date, r.open, r.next_at, claimedNext ?? -1);
}

/** Whether a claimed slot should become a message. The slot is used up either way. */
function wanted(r: Due, now: number, blocked: Set<number>): boolean {
  if (r.can_message !== 1 || r.reminders_enabled !== 1 || blocked.has(r.user_id)) return false;
  if (now - r.next_at > STALE_MS) return false;
  // The nudge is only for a day on which the user has not been active yet.
  if (r.kind === 'nudge' && r.last_active_day !== null && r.last_active_day >= localDay(r.tz, now)) return false;
  return true;
}

/** Sends everything due at `now` (the minute the cron was scheduled for), at most BATCH messages. */
export async function runReminders(env: Env, now: number): Promise<void> {
  if (!env.BOT_TOKEN) {
    console.error('cron: BOT_TOKEN is not set');
    return;
  }
  const db = env.DB;
  const [dueResult, metaResult] = await db.batch([
    db.prepare(DUE).bind(now, BATCH),
    db.prepare("SELECT key, value FROM meta WHERE key IN ('app_url', 'pause_until')"),
  ]);
  const due = rows<Due>(dueResult);
  if (due.length === 0) return;
  const meta = new Map(rows<{ key: string; value: string }>(metaResult).map((m) => [m.key, m.value]));
  if (Number(meta.get('pause_until') ?? 0) > now) return; // Telegram asked us to wait
  const appUrl = baseUrl(env.APP_URL) || baseUrl(meta.get('app_url'));

  // Claim every slot before sending: move the row to its next time, or delete a one-off. Only the
  // run whose claim changes the row sends the message, so a slot is never sent twice, not even
  // when two runs overlap. A run that dies after claiming loses those slots rather than repeat them.
  const next = due.map((r) => (r.date ? null : nextFire(r, r.tz, Math.max(now, r.next_at))));
  const claims = await db.batch(
    due.map((r, i) => {
      const at = next[i] ?? null;
      return at === null
        ? db.prepare('DELETE FROM reminders WHERE user_id = ?1 AND id = ?2 AND next_at = ?3').bind(r.user_id, r.id, r.next_at)
        : db.prepare('UPDATE reminders SET next_at = ?4 WHERE user_id = ?1 AND id = ?2 AND next_at = ?3').bind(r.user_id, r.id, r.next_at, at);
    }),
  );

  const after: D1PreparedStatement[] = [];
  const blocked = new Set<number>();
  let stopped = false;
  for (const [i, r] of due.entries()) {
    if (claims[i]?.meta.changes !== 1) continue; // another run has it, or the user just changed it
    if (stopped) {
      after.push(putBack(db, r, next[i] ?? null));
      continue;
    }
    if (!wanted(r, now, blocked)) continue;

    const res = await tg(env, 'sendMessage', {
      chat_id: r.user_id,
      text: r.text,
      reply_markup: openButton(r.open_label || TEXT.en.open, appUrl, r.open),
    });
    if (res.ok) continue;

    if (res.status === 403 || (res.status === 400 && /chat not found/i.test(res.description ?? ''))) {
      // The user blocked the bot or never started it: stop messaging them.
      blocked.add(r.user_id);
      after.push(blockedStatement(db, r.user_id, now));
      continue;
    }
    console.error(`cron: sendMessage failed (${res.status}): ${res.description ?? ''}`);
    if (res.status === 400) continue; // Telegram rejects this message for good

    // Telegram is throttling us (429 with retry_after) or is unavailable: put the rest back and
    // pause, so that later runs neither hammer Telegram nor keep rewriting the same rows.
    stopped = true;
    const pause = res.status === 429 ? Math.min((res.retryAfter ?? 1) * 1000, MAX_PAUSE_MS) : OUTAGE_PAUSE_MS;
    after.push(
      db
        .prepare("INSERT INTO meta (key, value) VALUES ('pause_until', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .bind(String(now + pause)),
    );
    // No answer at all (status 0) may mean the message did arrive, so that slot is not retried.
    if (res.status !== 0) after.push(putBack(db, r, next[i] ?? null));
  }
  if (after.length) await db.batch(after);
}
