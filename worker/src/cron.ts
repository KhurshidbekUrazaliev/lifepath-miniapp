// The cron (every minute): sends the reminders and nudges that are due, as a message from the bot
// and as a notification to every browser or home-screen app that asked for them (push.ts).
import { baseUrl, LANGS, type Env, type Lang } from './env';
import { TEXT } from './i18n';
import { nextPrayerFire, prayerKeyOf, prayerText, prefsFromRow } from './prayer';
import { pushReady, sendPush, type PushMessage, type PushSub } from './push';
import type { ReminderRow } from './reminders';
import { openButton, tg } from './telegram';
import { localDay, nextFire } from './time';
import { blockedStatement, rows } from './users';

/** Reminders per run. */
const BATCH = 30;
/**
 * Sends per run, Telegram messages and push notifications together. With the database calls this stays
 * well under the free plan's 50 subrequests; what does not fit waits for the next minute.
 */
const SENDS = 30;
/** A slot this late is dropped instead of delivered. */
const STALE_MS = 2 * 60 * 60 * 1000;
/** A prayer reminder is no use much after its time. */
const PRAYER_STALE_MS = 30 * 60 * 1000;
/** The longest pause a 429 from Telegram can cause. */
const MAX_PAUSE_MS = 60 * 60 * 1000;
/** The pause after any other failure that stops a run (Telegram down, bad token). */
const OUTAGE_PAUSE_MS = 5 * 60 * 1000;

interface Due extends ReminderRow {
  user_id: number;
  tz: string;
  lang: string;
  can_message: number;
  reminders_enabled: number;
  open_label: string;
  last_active_day: string | null;
  // From prayer_prefs, for prayer reminders (null otherwise).
  lat: number | null;
  lon: number | null;
  place_tz: string | null;
  method: string | null;
  asr: string | null;
  before: number | null;
}

const DUE = `
  SELECT r.user_id, r.id, r.kind, r.text, r.hour, r.minute, r.days, r.date, r.open, r.next_at,
         u.tz, u.lang, u.can_message, u.reminders_enabled, u.open_label, u.last_active_day,
         p.lat, p.lon, p.tz AS place_tz, p.method, p.asr, p.before
  FROM reminders r CROSS JOIN users u ON u.id = r.user_id
  LEFT JOIN prayer_prefs p ON p.user_id = r.user_id AND r.kind = 'prayer'
  WHERE r.next_at <= ?1
  ORDER BY r.next_at
  LIMIT ?2`;

const prefsOf = (r: Due) => (r.kind === 'prayer' ? prefsFromRow({ ...r, tz: r.place_tz }) : null);

/** The slot after this one: a prayer's next time, the schedule's next time, or null for a one-off. */
function following(r: Due, after: number): number | null {
  if (r.kind === 'prayer') {
    const prefs = prefsOf(r);
    const key = prayerKeyOf(r.id);
    return prefs && key ? nextPrayerFire(prefs, key, after) : null;
  }
  return r.date ? null : nextFire(r, r.tz, after);
}

/** The message to send. A prayer reminder shows the prayer's time on the place's clock. */
function messageText(r: Due): string {
  const prefs = prefsOf(r);
  if (!prefs) return r.text;
  const lang: Lang = (LANGS as readonly string[]).includes(r.lang) ? (r.lang as Lang) : 'en';
  return prayerText(r.text, r.next_at + prefs.before * 60_000, prefs.tz, lang);
}

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

/** Whether a claimed slot should be sent at all. The slot is used up either way. */
function wanted(r: Due, now: number): boolean {
  if (r.reminders_enabled !== 1) return false;
  if (now - r.next_at > (r.kind === 'prayer' ? PRAYER_STALE_MS : STALE_MS)) return false;
  // The nudge is only for a day on which the user has not been active yet.
  if (r.kind === 'nudge' && r.last_active_day !== null && r.last_active_day >= localDay(r.tz, now)) return false;
  return true;
}

// The browsers of the people with something due (the same rows DUE picks).
const SUBS = `
  SELECT user_id, endpoint, p256dh, auth FROM push_subs
  WHERE user_id IN (SELECT user_id FROM reminders WHERE next_at <= ?1 ORDER BY next_at LIMIT ?2)`;

/** A notification for a reminder. A short one is the title alone, as on the Android app. */
function pushMessage(r: Due, text: string): PushMessage {
  const short = text.length <= 70 && !text.includes('\n');
  return { title: short ? text : 'LifePath', body: short ? '' : text, open: r.open, tag: r.id };
}

/** Sends everything due at `now` (the minute the cron was scheduled for), at most BATCH messages. */
export async function runReminders(env: Env, now: number): Promise<void> {
  if (!env.BOT_TOKEN) {
    console.error('cron: BOT_TOKEN is not set');
    return;
  }
  const db = env.DB;
  const push = pushReady(env);
  const [dueResult, metaResult, subsResult] = await db.batch([
    db.prepare(DUE).bind(now, BATCH),
    db.prepare("SELECT key, value FROM meta WHERE key IN ('app_url', 'pause_until')"),
    db.prepare(push ? SUBS : 'SELECT NULL AS user_id LIMIT 0').bind(...(push ? [now, BATCH] : [])),
  ]);
  const due = rows<Due>(dueResult);
  if (due.length === 0) return;
  const subs = new Map<number, PushSub[]>();
  for (const s of rows<PushSub & { user_id: number }>(subsResult)) subs.set(s.user_id, [...(subs.get(s.user_id) ?? []), s]);
  const meta = new Map(rows<{ key: string; value: string }>(metaResult).map((m) => [m.key, m.value]));
  if (Number(meta.get('pause_until') ?? 0) > now) return; // Telegram asked us to wait
  const appUrl = baseUrl(env.APP_URL) || baseUrl(meta.get('app_url'));
  // Who the push services may contact about this site's notifications.
  const subject = appUrl.startsWith('https://') ? appUrl : 'https://lifepath.khurshidbekdev.workers.dev';

  // Claim every slot before sending: move the row to its next time, or delete a one-off. Only the
  // run whose claim changes the row sends the message, so a slot is never sent twice, not even
  // when two runs overlap. A run that dies after claiming loses those slots rather than repeat them.
  const next = due.map((r) => following(r, Math.max(now, r.next_at)));
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
  const gone = new Set<string>();
  let stopped = false;
  let sends = 0;
  for (const [i, r] of due.entries()) {
    if (claims[i]?.meta.changes !== 1) continue; // another run has it, or the user just changed it
    if (!wanted(r, now)) continue;
    const toBot = r.can_message === 1 && !blocked.has(r.user_id);
    const browsers = (subs.get(r.user_id) ?? []).filter((s) => !gone.has(s.endpoint));
    if (!toBot && browsers.length === 0) continue;
    // Telegram asked us to wait, or this run has sent all it may: the slot goes back for the next run.
    if (stopped || sends + Number(toBot) + browsers.length > SENDS) {
      after.push(putBack(db, r, next[i] ?? null));
      continue;
    }
    const text = messageText(r);

    // The browsers first: they do not depend on Telegram. A failure is not retried.
    for (const sub of browsers) {
      sends++;
      const status = await sendPush(env, sub, pushMessage(r, text), r.kind === 'prayer' ? PRAYER_STALE_MS / 1000 : STALE_MS / 1000, subject, now);
      if (status === 404 || status === 410) {
        gone.add(sub.endpoint);
        after.push(db.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(sub.endpoint));
      }
    }
    if (!toBot) continue;

    sends++;
    const res = await tg(env, 'sendMessage', {
      chat_id: r.user_id,
      text,
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
    // No answer at all (status 0) may mean the message did arrive, so that slot is not retried. Nor is
    // one whose notifications went out already: a second round of them would be worse than no message.
    if (res.status !== 0 && browsers.length === 0) after.push(putBack(db, r, next[i] ?? null));
  }
  if (after.length) await db.batch(after);
}
