// Friend challenges: someone starts one (what to count, for how many days), shares the invite link, and
// friends join. A member's score is how far their counter has moved since they joined; the app sends the
// counters with its activity. When a challenge ends, the cron tells each member how they did.
import { baseUrl, DAY_MS, LANGS, type Env, type Lang } from './env';
import { describe, HttpError, json, notFound, readJson } from './http';
import { TEXT, type ChallengeKind } from './i18n';
import { openButton, tg } from './telegram';
import { blockedStatement, loadUser, rows, type Ctx } from './users';
import { int, match, obj, oneOf } from './validate';

export const KINDS: readonly ChallengeKind[] = ['xp', 'prayer', 'quran', 'focus'];
const MAX_DAYS = 30;
const MAX_MEMBERS = 30;
/** Challenges one person can be in at once, and how many of those they may have started. */
const MAX_ACTIVE = 10;
const MAX_OWNED = 5;
/** Ended challenges stay on the list this long; the hourly clean-up deletes them after a month. */
const RECENT_MS = 7 * DAY_MS;
const KEEP_MS = 30 * DAY_MS;
/** Result messages per cron run (the reminders use most of the run's subrequests). */
const RESULTS_BATCH = 8;
const MAX_COUNTER = 1_000_000_000;
const ID_RE = /^[a-z0-9]{8}$/;
// No look-alike characters (0/o, 1/l/i), in case someone reads a code aloud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export type Counters = Record<ChallengeKind, number>;

/** How much a score may grow: per day for most kinds, and no faster than the clock for focus minutes. */
export function cap(kind: ChallengeKind, elapsedMs: number): number {
  const ms = Math.max(0, elapsedMs);
  const days = Math.floor(ms / DAY_MS) + 1;
  if (kind === 'xp') return 5000 * days;
  if (kind === 'prayer') return 5 * days;
  if (kind === 'quran') return 604 * days;
  return Math.ceil(ms / 60_000) + 5;
}

export const scoreFor = (kind: ChallengeKind, base: number, counter: number, elapsedMs: number): number =>
  Math.max(0, Math.min(cap(kind, elapsedMs), counter - base));

/** The app's counters: { xp, prayer, quran, focus }, each a whole number. */
export function readCounters(v: unknown): Counters {
  const o = obj(v, 'counters');
  const out = {} as Counters;
  for (const k of KINDS) out[k] = int(o[k], `counters.${k}`, 0, MAX_COUNTER);
  return out;
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const langOf = (v: string | null | undefined): Lang => ((LANGS as readonly string[]).includes(v ?? '') ? (v as Lang) : 'en');

interface ChallengeRow {
  id: string;
  owner: number;
  kind: ChallengeKind;
  days: number;
  starts_at: number;
  ends_at: number;
  owner_name: string | null;
}

interface MemberRow {
  challenge_id: string;
  user_id: number;
  score: number;
  updated_at: number;
  first_name: string | null;
}

/** Best score first; on a tie, whoever got there first. */
const standings = (members: MemberRow[]): MemberRow[] =>
  [...members].sort((a, b) => b.score - a.score || a.updated_at - b.updated_at || a.user_id - b.user_id);

function view(ch: ChallengeRow, members: MemberRow[], me: number, now: number) {
  const list = standings(members.filter((m) => m.challenge_id === ch.id));
  return {
    id: ch.id,
    kind: ch.kind,
    days: ch.days,
    startsAt: ch.starts_at,
    endsAt: ch.ends_at,
    ended: ch.ends_at <= now,
    owner: ch.owner_name ?? '',
    isOwner: ch.owner === me,
    joined: list.some((m) => m.user_id === me),
    members: list.map((m, i) => ({ rank: i + 1, name: m.first_name ?? '', score: m.score, isMe: m.user_id === me })),
  };
}

const MEMBERS = `
  SELECT m.challenge_id, m.user_id, m.score, m.updated_at, u.first_name
  FROM challenge_members m LEFT JOIN users u ON u.id = m.user_id`;

const ONE = 'SELECT c.*, o.first_name AS owner_name FROM challenges c LEFT JOIN users o ON o.id = c.owner WHERE c.id = ?1';
const ONE_MEMBERS = `${MEMBERS} WHERE m.challenge_id = ?1`;

// The caller's challenges that are running or ended less than a week ago (?2 = now - a week).
const MINE = `
  SELECT c.*, o.first_name AS owner_name
  FROM challenges c JOIN challenge_members me ON me.challenge_id = c.id AND me.user_id = ?1
  LEFT JOIN users o ON o.id = c.owner
  WHERE c.ends_at > ?2 ORDER BY c.ends_at`;
const MINE_MEMBERS = `${MEMBERS}
  WHERE m.challenge_id IN (
    SELECT c.id FROM challenges c JOIN challenge_members me ON me.challenge_id = c.id AND me.user_id = ?1 WHERE c.ends_at > ?2)`;

// How many running challenges the caller is in, and how many of them they started.
const ACTIVE = `
  SELECT COUNT(*) AS n, COALESCE(SUM(c.owner = ?1), 0) AS owned
  FROM challenge_members m JOIN challenges c ON c.id = m.challenge_id
  WHERE m.user_id = ?1 AND c.ends_at > ?2`;

/** The caller's memberships in running challenges, for updating their scores. */
export const ACTIVE_MEMBERSHIPS = `
  SELECT m.challenge_id, m.base, m.score, m.joined_at, c.kind, c.starts_at
  FROM challenge_members m JOIN challenges c ON c.id = m.challenge_id
  WHERE m.user_id = ?1 AND c.ends_at > ?2`;

export interface Membership {
  challenge_id: string;
  base: number;
  score: number;
  joined_at: number;
  kind: ChallengeKind;
  starts_at: number;
}

/** Statements that move the caller's scores to match their counters (only the ones that changed). */
export function scoreUpdates(db: D1Database, memberships: Membership[], counters: Counters, userId: number, now: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const m of memberships) {
    const score = scoreFor(m.kind, m.base, counters[m.kind], now - Math.max(m.starts_at, m.joined_at));
    if (score === m.score) continue;
    out.push(
      db
        .prepare('UPDATE challenge_members SET score = ?3, updated_at = ?4 WHERE challenge_id = ?1 AND user_id = ?2')
        .bind(m.challenge_id, userId, score, now),
    );
  }
  return out;
}

/** GET /api/challenges: the caller's challenges, running and recently ended. */
export async function getChallenges(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const id = c.auth.id;
  const since = c.now - RECENT_MS;
  const { writes, results } = await loadUser(c, {}, [db.prepare(MINE).bind(id, since), db.prepare(MINE_MEMBERS).bind(id, since)]);
  if (writes.length) await db.batch(writes);
  const members = rows<MemberRow>(results[1]);
  return json({ challenges: rows<ChallengeRow>(results[0]).map((ch) => view(ch, members, id, c.now)) });
}

/** GET /api/challenges/one?id=…: one challenge, also for someone deciding whether to join it. */
export async function getChallenge(c: Ctx): Promise<Response> {
  const cid = match(c.url.searchParams.get('id'), 'id', ID_RE);
  const db = c.env.DB;
  const { writes, results } = await loadUser(c, {}, [db.prepare(ONE).bind(cid), db.prepare(ONE_MEMBERS).bind(cid)]);
  if (writes.length) await db.batch(writes);
  const ch = rows<ChallengeRow>(results[0])[0];
  if (!ch) throw notFound();
  return json({ challenge: view(ch, rows<MemberRow>(results[1]), c.auth.id, c.now) });
}

/** POST /api/challenges { kind, days, counters }: starts a challenge with the caller as its first member. */
export async function postChallenge(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kind = oneOf(body.kind, 'kind', KINDS);
  const days = int(body.days, 'days', 1, MAX_DAYS);
  const counters = readCounters(body.counters);

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [db.prepare(ACTIVE).bind(id, c.now)]);
  const active = rows<{ n: number; owned: number }>(results[0])[0] ?? { n: 0, owned: 0 };
  if (active.n >= MAX_ACTIVE || active.owned >= MAX_OWNED) throw new HttpError(409, 'limit');

  const ch: ChallengeRow = { id: newId(), owner: id, kind, days, starts_at: c.now, ends_at: c.now + days * DAY_MS, owner_name: user.first_name };
  writes.push(
    db
      .prepare('INSERT INTO challenges (id, owner, kind, days, starts_at, ends_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(ch.id, id, kind, days, ch.starts_at, ch.ends_at),
    db
      .prepare('INSERT INTO challenge_members (challenge_id, user_id, base, joined_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)')
      .bind(ch.id, id, counters[kind], c.now),
  );
  await db.batch(writes);
  const me: MemberRow = { challenge_id: ch.id, user_id: id, score: 0, updated_at: c.now, first_name: user.first_name };
  return json({ challenge: view(ch, [me], id, c.now) });
}

interface OwnerRow {
  id: number;
  lang: string;
  can_message: number;
  blocked: number;
  open_label: string;
}

/** POST /api/challenges/join { id, counters }: joins a running challenge (joining twice changes nothing). */
export async function postJoin(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const cid = match(body.id, 'id', ID_RE);
  const counters = readCounters(body.counters);

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [
    db.prepare(ONE).bind(cid),
    db.prepare(ONE_MEMBERS).bind(cid),
    db.prepare(ACTIVE).bind(id, c.now),
    db.prepare('SELECT u.id, u.lang, u.can_message, u.blocked, u.open_label FROM users u JOIN challenges c ON c.owner = u.id WHERE c.id = ?1').bind(cid),
  ]);
  const ch = rows<ChallengeRow>(results[0])[0];
  if (!ch) throw notFound();
  const members = rows<MemberRow>(results[1]);
  if (members.some((m) => m.user_id === id)) {
    if (writes.length) await db.batch(writes);
    return json({ challenge: view(ch, members, id, c.now) });
  }
  if (ch.ends_at <= c.now) throw new HttpError(409, 'ended');
  if (members.length >= MAX_MEMBERS) throw new HttpError(409, 'full');
  if ((rows<{ n: number }>(results[2])[0]?.n ?? 0) >= MAX_ACTIVE) throw new HttpError(409, 'limit');

  writes.push(
    db
      .prepare('INSERT INTO challenge_members (challenge_id, user_id, base, joined_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)')
      .bind(cid, id, counters[ch.kind], c.now),
  );
  await db.batch(writes);
  const joined = [...members, { challenge_id: cid, user_id: id, score: 0, updated_at: c.now, first_name: user.first_name }];

  // Tell whoever started it.
  const owner = rows<OwnerRow>(results[3])[0];
  if (owner && owner.id !== id && owner.can_message === 1 && owner.blocked !== 1) {
    const text = TEXT[langOf(owner.lang)];
    const res = await tg(c.env, 'sendMessage', {
      chat_id: owner.id,
      text: text.challengeJoined(user.first_name || '🙂', text.challengeKinds[ch.kind]),
      reply_markup: openButton(owner.open_label || text.open, baseUrl(c.env.APP_URL), `ch_${cid}`),
    });
    if (res.status === 403) await blockedStatement(db, owner.id, c.now).run();
  }
  return json({ challenge: view(ch, joined, id, c.now) });
}

/** POST /api/challenges/leave { id }: leaves a challenge; the last one out deletes it. */
export async function postLeave(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const cid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const { writes } = await loadUser(c);
  writes.push(
    db.prepare('DELETE FROM challenge_members WHERE challenge_id = ?1 AND user_id = ?2').bind(cid, c.auth.id),
    db.prepare('DELETE FROM challenges WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM challenge_members WHERE challenge_id = ?1)').bind(cid),
  );
  await db.batch(writes);
  return json({ ok: true });
}

interface ResultRow {
  challenge_id: string;
  user_id: number;
  kind: ChallengeKind;
  lang: string;
  can_message: number;
  blocked: number;
  open_label: string;
}

const RESULTS_DUE = `
  SELECT m.challenge_id, m.user_id, c.kind, u.lang, u.can_message, u.blocked, u.open_label
  FROM challenge_members m JOIN challenges c ON c.id = m.challenge_id JOIN users u ON u.id = m.user_id
  WHERE c.ends_at <= ?1 AND m.notified = 0
  ORDER BY c.ends_at LIMIT ?2`;

/**
 * Cron: tells the members of challenges that have ended how they did, a few messages per run. Each
 * member's row is claimed (notified = 1) before the message goes out, so nobody hears it twice.
 */
export async function runChallengeResults(env: Env, now: number): Promise<void> {
  if (!env.BOT_TOKEN) return;
  const db = env.DB;
  const [dueResult, metaResult] = await db.batch([
    db.prepare(RESULTS_DUE).bind(now, RESULTS_BATCH),
    db.prepare("SELECT key, value FROM meta WHERE key IN ('app_url', 'pause_until')"),
  ]);
  const due = rows<ResultRow>(dueResult);
  if (due.length === 0) return;
  const meta = new Map(rows<{ key: string; value: string }>(metaResult).map((m) => [m.key, m.value]));
  if (Number(meta.get('pause_until') ?? 0) > now) return; // Telegram asked us to wait
  const appUrl = baseUrl(env.APP_URL) || baseUrl(meta.get('app_url'));

  const ids = [...new Set(due.map((d) => d.challenge_id))];
  const claimed = await db.batch([
    ...due.map((d) =>
      db.prepare('UPDATE challenge_members SET notified = 1 WHERE challenge_id = ?1 AND user_id = ?2 AND notified = 0').bind(d.challenge_id, d.user_id),
    ),
    db.prepare(`${MEMBERS} WHERE m.challenge_id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...ids),
  ]);
  const all = rows<MemberRow>(claimed[due.length]);

  const after: D1PreparedStatement[] = [];
  for (const [i, d] of due.entries()) {
    if (claimed[i]?.meta.changes !== 1) continue; // another run has it
    if (d.can_message !== 1 || d.blocked === 1) continue;
    const list = standings(all.filter((m) => m.challenge_id === d.challenge_id));
    const place = list.findIndex((m) => m.user_id === d.user_id) + 1;
    if (place === 0) continue;
    const text = TEXT[langOf(d.lang)];
    const res = await tg(env, 'sendMessage', {
      chat_id: d.user_id,
      text: text.challengeOver(
        text.challengeKinds[d.kind],
        place,
        list.length,
        list[0]?.first_name || '🙂',
        text.challengeScore(d.kind, list[place - 1]?.score ?? 0),
      ),
      reply_markup: openButton(d.open_label || text.open, appUrl, `ch_${d.challenge_id}`),
    });
    if (res.ok) continue;
    if (res.status === 403 || (res.status === 400 && /chat not found/i.test(res.description ?? ''))) {
      after.push(blockedStatement(db, d.user_id, now));
      continue;
    }
    console.error(`challenges: sendMessage failed (${res.status}): ${res.description ?? ''}`);
    if (res.status === 400) continue;
    // Throttled or unavailable: what this run claimed and has not sent waits for a later run (except
    // this message when there was no answer at all: it may have arrived).
    for (let j = i + (res.status === 0 ? 1 : 0); j < due.length; j++) {
      const rest = due[j];
      if (!rest || claimed[j]?.meta.changes !== 1) continue;
      after.push(
        db.prepare('UPDATE challenge_members SET notified = 0 WHERE challenge_id = ?1 AND user_id = ?2').bind(rest.challenge_id, rest.user_id),
      );
    }
    break;
  }
  if (after.length) await db.batch(after);
}

/** Hourly: deletes challenges that ended a month ago and story pictures older than a day. */
export async function cleanUp(env: Env, now: number): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM challenges WHERE ends_at < ?1').bind(now - KEEP_MS),
      env.DB.prepare('DELETE FROM stories WHERE created_at < ?1').bind(now - DAY_MS),
    ]);
  } catch (e) {
    console.error('clean-up:', describe(e));
  }
}
