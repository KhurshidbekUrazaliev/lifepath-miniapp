// PUT /api/reminders: replaces the user's whole reminder set.
import { OPEN_RE } from './env';
import { badRequest, json, readJson } from './http';
import { TEXT } from './i18n';
import { clockAt, nextPrayerFire, parsePrayer, prayerId, prayerKeyOf, samePrefs, type PrayerPrefs } from './prayer';
import { ALL_DAYS, nextFire, type Schedule } from './time';
import { loadUser, rows, type Ctx } from './users';
import { bool, day, int, lang, match, obj, str, timeZone } from './validate';

const MAX_ITEMS = 60;
const MAX_TEXT = 300;
const MAX_LABEL = 40;
/** Ids the app may use. The nudge's own id contains "~", so it can never collide with one. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const NUDGE_ID = '~nudge';

/** A reminder as stored, without its fire time. A prayer's time comes from prayer_prefs instead of the schedule. */
export interface Reminder extends Schedule {
  id: string;
  kind: 'item' | 'nudge' | 'prayer';
  text: string;
  open: string | null;
}

export interface ReminderRow extends Reminder {
  next_at: number;
}

const COLUMNS = 'id, kind, text, hour, minute, days, date, open, next_at';

const UPSERT = `
  INSERT INTO reminders (user_id, id, kind, text, hour, minute, days, date, open, next_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT (user_id, id) DO UPDATE SET
    kind = excluded.kind, text = excluded.text, hour = excluded.hour, minute = excluded.minute,
    days = excluded.days, date = excluded.date, open = excluded.open, next_at = excluded.next_at`;

const given = (v: unknown): boolean => v !== undefined && v !== null;

function parseItem(raw: unknown, index: number): Reminder {
  const at = `items[${index}]`;
  const o = obj(raw, at);
  if (given(o.days) && given(o.date)) throw badRequest(`${at}: days and date cannot be combined`);

  // No days and no date means every day.
  let days: string | null = given(o.date) ? null : ALL_DAYS;
  if (given(o.days)) {
    if (!Array.isArray(o.days) || o.days.length < 1 || o.days.length > 7) {
      throw badRequest(`${at}.days: 1-7 weekdays expected`);
    }
    days = [...new Set(o.days.map((d) => int(d, `${at}.days`, 1, 7)))].sort().join('');
  }
  return {
    id: match(o.id, `${at}.id`, ID_RE),
    kind: 'item',
    text: str(o.text, `${at}.text`, MAX_TEXT),
    hour: int(o.hour, `${at}.hour`, 0, 23),
    minute: int(o.minute, `${at}.minute`, 0, 59),
    days,
    date: given(o.date) ? day(o.date, `${at}.date`) : null,
    open: given(o.open) ? match(o.open, `${at}.open`, OPEN_RE) : null,
  };
}

const same = (a: Reminder, b: Reminder): boolean =>
  a.kind === b.kind &&
  a.text === b.text &&
  // A prayer row's hour and minute only record the last time worked out.
  (a.kind === 'prayer' || (a.hour === b.hour && a.minute === b.minute)) &&
  a.days === b.days &&
  a.date === b.date &&
  a.open === b.open;

export async function putReminders(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const enabled = bool(body.enabled, 'enabled');
  const tz = timeZone(body.tz);
  const language = lang(body.lang);
  const openLabel = given(body.openLabel) && body.openLabel !== '' ? str(body.openLabel, 'openLabel', MAX_LABEL) : TEXT[language].open;
  const lastActiveDay = given(body.lastActiveDay) ? day(body.lastActiveDay, 'lastActiveDay') : null;
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) {
    throw badRequest(`items: array of at most ${MAX_ITEMS} expected`);
  }
  const wanted = body.items.map(parseItem);
  if (new Set(wanted.map((w) => w.id)).size !== wanted.length) throw badRequest('items: every id must be unique');
  const prayer = parsePrayer(body.prayer, MAX_TEXT);

  const nudge = given(body.nudge) ? obj(body.nudge, 'nudge') : { enabled: false };
  if (bool(nudge.enabled, 'nudge.enabled')) {
    wanted.push({
      id: NUDGE_ID,
      kind: 'nudge',
      text: str(nudge.text, 'nudge.text', MAX_TEXT),
      hour: int(nudge.hour, 'nudge.hour', 0, 23),
      minute: int(nudge.minute, 'nudge.minute', 0, 59),
      days: ALL_DAYS,
      date: null,
      open: null,
    });
  }

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, previousTz, writes, results } = await loadUser(c, { tz, lang: language }, [
    db.prepare(`SELECT ${COLUMNS} FROM reminders WHERE user_id = ?1`).bind(id),
    db.prepare('SELECT lat, lon, tz, method, asr, before FROM prayer_prefs WHERE user_id = ?1').bind(id),
  ]);
  const stored = new Map(rows<ReminderRow>(results[0]).map((row) => [row.id, row]));

  // Prayer reminders: where and how to work out the times, then one row per prayer.
  const storedPrefs = rows<PrayerPrefs>(results[1])[0] ?? null;
  const prefs = enabled && prayer ? prayer.prefs : null;
  const prefsKept = samePrefs(storedPrefs, prefs);
  if (prefs && !prefsKept) {
    writes.push(
      db
        .prepare(
          `INSERT INTO prayer_prefs (user_id, lat, lon, tz, method, asr, before) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT (user_id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, tz = excluded.tz,
             method = excluded.method, asr = excluded.asr, before = excluded.before`,
        )
        .bind(id, prefs.lat, prefs.lon, prefs.tz, prefs.method, prefs.asr, prefs.before),
    );
  } else if (!prefs && storedPrefs) {
    writes.push(db.prepare('DELETE FROM prayer_prefs WHERE user_id = ?1').bind(id));
  }
  if (prefs && prayer) {
    for (const item of prayer.items) {
      wanted.push({ id: prayerId(item.key), kind: 'prayer', text: item.text, hour: 0, minute: 0, days: ALL_DAYS, date: null, open: 'prayer' });
    }
  }

  // Write only what changed. An unchanged reminder keeps its fire time, so syncing the same set
  // again costs no writes and can neither skip nor repeat a slot.
  const sameZone = previousTz === tz;
  const kept = new Set<string>();
  let count = 0;
  for (const w of enabled ? wanted : []) {
    const old = stored.get(w.id);
    // A prayer's time does not depend on the phone's time zone, only on its place.
    if (!(old && (w.kind === 'prayer' ? prefsKept : sameZone) && same(old, w))) {
      const key = w.kind === 'prayer' ? prayerKeyOf(w.id) : null;
      const next = prefs && key ? nextPrayerFire(prefs, key, c.now) : nextFire(w, tz, c.now);
      if (next === null) continue; // a one-off whose time has passed
      const { hour, minute } = prefs && key ? clockAt(prefs.tz, next) : w;
      writes.push(db.prepare(UPSERT).bind(id, w.id, w.kind, w.text, hour, minute, w.days, w.date, w.open, next));
    }
    kept.add(w.id);
    if (w.kind === 'item') count++;
  }
  if (kept.size === 0) {
    if (stored.size > 0) writes.push(db.prepare('DELETE FROM reminders WHERE user_id = ?1').bind(id));
  } else {
    for (const key of stored.keys()) {
      if (!kept.has(key)) writes.push(db.prepare('DELETE FROM reminders WHERE user_id = ?1 AND id = ?2').bind(id, key));
    }
  }

  const lastDay = lastActiveDay ?? user.last_active_day;
  if (user.reminders_enabled !== Number(enabled) || user.open_label !== openLabel || user.last_active_day !== lastDay) {
    writes.push(
      db
        .prepare('UPDATE users SET reminders_enabled = ?2, open_label = ?3, last_active_day = ?4, updated_at = ?5 WHERE id = ?1')
        .bind(id, Number(enabled), openLabel, lastDay, c.now),
    );
  }
  if (writes.length) await db.batch(writes);
  return json({ ok: true, count, canMessage: user.can_message === 1 });
}

/** Statements that move every reminder of a user to its next time in a new time zone. Prayers keep their place's time. */
export async function reschedule(db: D1Database, userId: number, tz: string, now: number): Promise<D1PreparedStatement[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM reminders WHERE user_id = ?1 AND kind != 'prayer'`)
    .bind(userId)
    .all<ReminderRow>();
  return results.map((row) => {
    const next = nextFire(row, tz, now);
    return next === null
      ? db.prepare('DELETE FROM reminders WHERE user_id = ?1 AND id = ?2').bind(userId, row.id)
      : db.prepare('UPDATE reminders SET next_at = ?3 WHERE user_id = ?1 AND id = ?2').bind(userId, row.id, next);
  });
}
