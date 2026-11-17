// Buddy streaks: two friends keep one streak together. One of them shares their invite link, the other
// accepts it, and from then on a day counts when both did at least one thing in the app that day, each
// by their own calendar. The app reports the day it was last active with its activity (rankings.ts).
import { baseUrl, DAY_MS, LANGS, type Lang } from './env';
import { HttpError, json, notFound, readJson } from './http';
import { TEXT } from './i18n';
import { openButton, tg } from './telegram';
import { canonicalTimeZone, localDay, parseDay } from './time';
import { blockedStatement, loadUser, rows, type Ctx } from './users';
import { day as dayField, match } from './validate';

/** Buddies one person can have at once. */
export const MAX_BUDDIES = 5;
const ID_RE = /^[a-z0-9]{8}$/;
// No look-alike characters (0/o, 1/l/i), in case someone reads a code aloud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newId(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const langOf = (v: string | null | undefined): Lang => ((LANGS as readonly string[]).includes(v ?? '') ? (v as Lang) : 'en');

// ---------- the rules (no database in here) ----------

/** The calendar day `delta` days from a YYYY-MM-DD day. */
export function shiftDay(day: string, delta: number): string {
  const ymd = parseDay(day);
  if (!ymd) return day;
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + delta)).toISOString().slice(0, 10);
}

/** The app's own day is believed only within a day of the server's date: no time zone is further away. */
export function nearToday(day: string | null | undefined, now: number): day is string {
  const ymd = parseDay(day);
  if (!ymd) return false;
  return Math.abs(Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) - Math.floor(now / DAY_MS) * DAY_MS) <= DAY_MS;
}

/** Has this side done its part on its own `today`? (A later day means its phone's clock is ahead of ours.) */
export const doneOn = (day: string | null, today: string): boolean => day !== null && day >= today;

const activeOn = (day: string | null, prev: string | null, on: string): boolean => day === on || prev === on;

export interface PairDays {
  a_day: string | null;
  a_prev: string | null;
  b_day: string | null;
  b_prev: string | null;
  both_day: string | null;
  streak: number;
}

/**
 * Does the streak still count? It does while the day after the last shared one is not lost: each side
 * either was active on it, or its own calendar has not gone past it yet.
 */
export function streakAlive(p: PairDays, todayA: string, todayB: string): boolean {
  if (!p.both_day || p.streak < 1) return false;
  const next = shiftDay(p.both_day, 1);
  return (todayA <= next || activeOn(p.a_day, p.a_prev, next)) && (todayB <= next || activeOn(p.b_day, p.b_prev, next));
}

// ---------- the database ----------

interface PairRow extends PairDays {
  id: string;
  a: number;
  b: number;
  best: number;
  a_nudged: string | null;
  b_nudged: string | null;
  created_at: number;
  a_name: string | null;
  a_tz: string | null;
  a_lang: string | null;
  a_can: number | null;
  a_blocked: number | null;
  a_label: string | null;
  b_name: string | null;
  b_tz: string | null;
  b_lang: string | null;
  b_can: number | null;
  b_blocked: number | null;
  b_label: string | null;
}

const PAIRS = `
  SELECT p.*,
         ua.first_name AS a_name, ua.tz AS a_tz, ua.lang AS a_lang, ua.can_message AS a_can, ua.blocked AS a_blocked, ua.open_label AS a_label,
         ub.first_name AS b_name, ub.tz AS b_tz, ub.lang AS b_lang, ub.can_message AS b_can, ub.blocked AS b_blocked, ub.open_label AS b_label
  FROM buddies p JOIN users ua ON ua.id = p.a JOIN users ub ON ub.id = p.b`;
const MINE = `${PAIRS} WHERE p.a = ?1 OR p.b = ?1 ORDER BY p.created_at, p.id`;
const ONE = `${PAIRS} WHERE p.id = ?1`;
const BY_USERS = `${PAIRS} WHERE p.a = ?1 AND p.b = ?2`;
const CODE = 'SELECT code FROM buddy_invites WHERE user_id = ?1';
const COUNT = 'SELECT COUNT(*) AS n FROM buddies WHERE a = ?1 OR b = ?1';

// Whose invite a code is, the day streak their app last reported, how many buddies they have, and the
// pair they already make with the caller (?2).
const INVITE = `
  SELECT i.user_id, u.first_name, u.lang, u.can_message, u.blocked, u.open_label, u.last_active_day,
         (SELECT streak FROM scores WHERE user_id = i.user_id) AS day_streak,
         (SELECT COUNT(*) FROM buddies WHERE a = i.user_id OR b = i.user_id) AS theirs,
         (SELECT id FROM buddies WHERE (a = i.user_id AND b = ?2) OR (a = ?2 AND b = i.user_id)) AS pair
  FROM buddy_invites i JOIN users u ON u.id = i.user_id WHERE i.code = ?1`;

interface InviteRow {
  user_id: number;
  first_name: string | null;
  lang: string | null;
  can_message: number;
  blocked: number;
  open_label: string | null;
  last_active_day: string | null;
  day_streak: number | null;
  theirs: number;
  pair: string | null;
}

/** Is there a pair of the caller's that has not heard of this day yet? */
export const BUDDY_DAY_DUE = `
  SELECT 1 AS due FROM buddies
  WHERE (a = ?1 AND (a_day IS NULL OR a_day < ?2)) OR (b = ?1 AND (b_day IS NULL OR b_day < ?2)) LIMIT 1`;

/**
 * Statements that write `day` as the caller's active day into each of their pairs. When the buddy was
 * active that day too, it becomes the pair's last shared day: the streak grows by one if the shared day
 * before it was the day before, and starts again at one otherwise. One statement does all of it at
 * once, so two buddies reporting in the same moment cannot miss each other.
 */
export function activeDayStatements(db: D1Database, userId: number, day: string): D1PreparedStatement[] {
  const before = shiftDay(day, -1);
  return (['a', 'b'] as const).map((me) => {
    const other = me === 'a' ? 'b' : 'a';
    const shared = `(${other}_day = ?2 OR ${other}_prev = ?2) AND (both_day IS NULL OR both_day < ?2)`;
    const grown = 'CASE WHEN both_day = ?3 THEN streak + 1 ELSE 1 END';
    return db
      .prepare(
        `UPDATE buddies SET
           ${me}_prev = ${me}_day, ${me}_day = ?2,
           streak = CASE WHEN ${shared} THEN ${grown} ELSE streak END,
           best = CASE WHEN ${shared} THEN MAX(best, ${grown}) ELSE best END,
           both_day = CASE WHEN ${shared} THEN ?2 ELSE both_day END
         WHERE ${me} = ?1 AND (${me}_day IS NULL OR ${me}_day < ?2)`,
      )
      .bind(userId, day, before);
  });
}

const zone = (tz: string | null | undefined): string => canonicalTimeZone(tz) ?? 'UTC';

/** One side of a pair, read off its row. */
function side(p: PairRow, who: 'a' | 'b') {
  return who === 'a'
    ? { id: p.a, day: p.a_day, nudged: p.a_nudged, name: p.a_name, tz: zone(p.a_tz), lang: p.a_lang, can: p.a_can, blocked: p.a_blocked, label: p.a_label }
    : { id: p.b, day: p.b_day, nudged: p.b_nudged, name: p.b_name, tz: zone(p.b_tz), lang: p.b_lang, can: p.b_can, blocked: p.b_blocked, label: p.b_label };
}

/** A pair as one of the two sees it. */
function view(p: PairRow, viewer: number, now: number) {
  const me = side(p, p.a === viewer ? 'a' : 'b');
  const them = side(p, p.a === viewer ? 'b' : 'a');
  const today = { a: localDay(zone(p.a_tz), now), b: localDay(zone(p.b_tz), now) };
  const myToday = p.a === viewer ? today.a : today.b;
  const theirToday = p.a === viewer ? today.b : today.a;
  const meDone = doneOn(me.day, myToday);
  const theyDone = doneOn(them.day, theirToday);
  const nudged = me.nudged === myToday;
  return {
    id: p.id,
    name: them.name ?? '',
    since: p.created_at,
    // A streak that can no longer grow shows as 0; the next shared day starts it again at 1.
    streak: streakAlive(p, today.a, today.b) ? p.streak : 0,
    best: p.best,
    meDone,
    theyDone,
    nudged,
    canNudge: meDone && !theyDone && !nudged && them.can === 1 && them.blocked !== 1,
  };
}

/** GET /api/buddies: the caller's buddies and, when they have made one, their invite code. */
export async function getBuddies(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(MINE).bind(id), db.prepare(CODE).bind(id)]);
  if (writes.length) await db.batch(writes);
  return json({
    buddies: rows<PairRow>(results[0]).map((p) => view(p, id, c.now)),
    code: rows<{ code: string }>(results[1])[0]?.code ?? null,
    max: MAX_BUDDIES,
  });
}

/** POST /api/buddies/invite: the caller's invite code, made the first time it is asked for. */
export async function postBuddyInvite(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(CODE).bind(id)]);
  let code = rows<{ code: string }>(results[0])[0]?.code;
  if (!code) {
    writes.push(
      db.prepare('INSERT INTO buddy_invites (code, user_id, created_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO NOTHING').bind(newId(), id, c.now),
      db.prepare(CODE).bind(id),
    );
    const out = await db.batch(writes);
    code = rows<{ code: string }>(out[out.length - 1])[0]?.code;
    if (!code) throw new HttpError(500, 'server');
  } else if (writes.length) {
    await db.batch(writes);
  }
  return json({ code });
}

/** GET /api/buddies/invite?code=…: whose invite this is, for the person deciding whether to accept it. */
export async function getBuddyInvite(c: Ctx): Promise<Response> {
  const code = match(c.url.searchParams.get('code'), 'code', ID_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(INVITE).bind(code, id), db.prepare(COUNT).bind(id)]);
  if (writes.length) await db.batch(writes);
  const inv = rows<InviteRow>(results[0])[0];
  if (!inv) throw notFound();
  return json({
    invite: {
      name: inv.first_name ?? '',
      mine: inv.user_id === id,
      buddy: inv.pair !== null,
      full: inv.theirs >= MAX_BUDDIES,
      limit: (rows<{ n: number }>(results[1])[0]?.n ?? 0) >= MAX_BUDDIES,
    },
  });
}

/**
 * POST /api/buddies/accept { code, activeDay? }: the caller becomes the buddy of whoever shared the
 * code (accepting twice changes nothing). The pair starts from the day each was last active, so a day
 * both have already done counts at once. The caller's app says its own day here; the other one's is the
 * last their app reported.
 */
export async function postBuddyAccept(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const code = match(body.code, 'code', ID_RE);
  const reported = body.activeDay === undefined || body.activeDay === null ? null : dayField(body.activeDay, 'activeDay');

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [db.prepare(INVITE).bind(code, id), db.prepare(COUNT).bind(id)]);
  const inv = rows<InviteRow>(results[0])[0];
  if (!inv) throw notFound();
  if (inv.user_id === id) throw new HttpError(409, 'self');
  const [a, b] = id < inv.user_id ? [id, inv.user_id] : [inv.user_id, id];
  if (inv.pair) {
    writes.push(db.prepare(BY_USERS).bind(a, b));
    const out = await db.batch(writes);
    const pair = rows<PairRow>(out[out.length - 1])[0];
    if (!pair) throw notFound();
    return json({ buddy: view(pair, id, c.now) });
  }
  if ((rows<{ n: number }>(results[1])[0]?.n ?? 0) >= MAX_BUDDIES) throw new HttpError(409, 'limit');
  if (inv.theirs >= MAX_BUDDIES) throw new HttpError(409, 'full');

  const myDay = nearToday(reported, c.now) ? reported : null;
  // An app that has never counted an active day still reports today as the last one (so that the
  // evening nudge leaves a newcomer alone). Its day streak is 0 then, which tells the two apart.
  const theirDay = (inv.day_streak ?? 0) > 0 && nearToday(inv.last_active_day, c.now) ? inv.last_active_day : null;
  const shared = myDay !== null && myDay === theirDay;
  writes.push(
    db
      .prepare(
        `INSERT INTO buddies (id, a, b, a_day, b_day, both_day, streak, best, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8) ON CONFLICT (a, b) DO NOTHING`,
      )
      .bind(newId(), a, b, a === id ? myDay : theirDay, b === id ? myDay : theirDay, shared ? myDay : null, shared ? 1 : 0, c.now),
    db.prepare(BY_USERS).bind(a, b),
  );
  const out = await db.batch(writes);
  const pair = rows<PairRow>(out[out.length - 1])[0];
  if (!pair) throw new HttpError(500, 'server');

  // Tell whoever shared the link.
  if (inv.can_message === 1 && inv.blocked !== 1) {
    const text = TEXT[langOf(inv.lang)];
    const res = await tg(c.env, 'sendMessage', {
      chat_id: inv.user_id,
      text: text.buddyAccepted(user.first_name || '🙂'),
      reply_markup: openButton(inv.open_label || text.open, baseUrl(c.env.APP_URL), 'buddies'),
    });
    if (res.status === 403) await blockedStatement(db, inv.user_id, c.now).run();
  }
  return json({ buddy: view(pair, id, c.now) });
}

/** POST /api/buddies/leave { id }: either of the two ends the pair. */
export async function postBuddyLeave(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const pid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const { writes } = await loadUser(c);
  writes.push(db.prepare('DELETE FROM buddies WHERE id = ?1 AND (a = ?2 OR b = ?2)').bind(pid, c.auth.id));
  await db.batch(writes);
  return json({ ok: true });
}

/**
 * POST /api/buddies/nudge { id }: the bot tells the buddy that the caller has done today's part. Once a
 * day per pair and sender, only from someone who has done theirs, and only to a buddy who has not.
 */
export async function postBuddyNudge(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const pid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [db.prepare(ONE).bind(pid)]);
  const p = rows<PairRow>(results[0])[0];
  if (!p || (p.a !== id && p.b !== id)) throw notFound();
  const mine = p.a === id ? 'a' : 'b';
  const me = side(p, mine);
  const them = side(p, mine === 'a' ? 'b' : 'a');
  const today = { a: localDay(zone(p.a_tz), c.now), b: localDay(zone(p.b_tz), c.now) };
  const myToday = today[mine];
  if (!doneOn(me.day, myToday)) throw new HttpError(409, 'not_done');
  if (doneOn(them.day, today[mine === 'a' ? 'b' : 'a'])) throw new HttpError(409, 'done');
  if (me.nudged === myToday) throw new HttpError(409, 'nudged');
  if (them.can !== 1 || them.blocked === 1) throw new HttpError(409, 'unreachable');

  // Claimed before the message goes out, so two taps cannot send two.
  const column = `${mine}_nudged`;
  writes.push(db.prepare(`UPDATE buddies SET ${column} = ?2 WHERE id = ?1 AND (${column} IS NULL OR ${column} <> ?2)`).bind(pid, myToday));
  const out = await db.batch(writes);
  if (out[out.length - 1]?.meta.changes !== 1) throw new HttpError(409, 'nudged');

  const text = TEXT[langOf(them.lang)];
  const res = await tg(c.env, 'sendMessage', {
    chat_id: them.id,
    text: text.buddyNudge(user.first_name || '🙂', streakAlive(p, today.a, today.b) ? p.streak : 0),
    reply_markup: openButton(them.label || text.open, baseUrl(c.env.APP_URL), 'buddies'),
  });
  if (!res.ok) {
    // It did not arrive: the nudge may be tried again, unless the buddy cannot be written to at all.
    const gone = res.status === 403 || (res.status === 400 && /chat not found/i.test(res.description ?? ''));
    await db.batch([
      db.prepare(`UPDATE buddies SET ${column} = NULL WHERE id = ?1`).bind(pid),
      ...(gone ? [blockedStatement(db, them.id, c.now)] : []),
    ]);
    throw new HttpError(gone ? 409 : 502, gone ? 'unreachable' : 'telegram');
  }
  return json({ ok: true });
}
