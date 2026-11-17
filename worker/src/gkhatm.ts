// Group khatm: friends or a family read the Qurʼan together. One person starts it and shares the invite
// link; each member takes the juz they will read and marks them when they are read. When all thirty are
// read the round is complete, the bot tells everyone once, and whoever started it can begin the next.
import { baseUrl, DAY_MS, type Env } from './env';
import { badRequest, describe, HttpError, json, notFound, readJson } from './http';
import { TEXT } from './i18n';
import { openButton, tg } from './telegram';
import { localDay } from './time';
import { blockedStatement, loadUser, rows, type Ctx } from './users';
import { day as dayField, int, match, oneOf, str } from './validate';
import { langOf, nearToday, newId, shiftDay } from './buddies';

export const JUZ = 30;
const MAX_MEMBERS = 40;
/** Unfinished khatms one person can be in at once, and how many of those they may have started. */
const MAX_ACTIVE = 5;
const MAX_OWNED = 3;
/** XP for a juz marked read, and the most a day brings from it. */
export const JUZ_XP = 20;
export const JUZ_XP_DAY = 40;
/** A khatm nobody has touched for this long is deleted by the hourly clean-up. */
const KEEP_MS = 180 * DAY_MS;
/** A finish date may be at most this far ahead. */
const MAX_DUE_DAYS = 730;
/** "It is complete" messages that go out side by side (Telegram allows about thirty a second). */
const TELL_AT_ONCE = 5;
const ID_RE = /^[a-z0-9]{8}$/;
const KEY_RE = /^[a-z0-9]{6}$/;
const ACTIONS = ['take', 'release', 'read', 'unread'] as const;

interface KhatmRow {
  id: string;
  owner: number;
  title: string;
  due: string | null;
  round: number;
  done_at: number | null;
  owner_name: string | null;
}

interface MemberRow {
  khatm_id: string;
  user_id: number;
  key: string;
  first_name: string | null;
}

interface PartRow {
  khatm_id: string;
  juz: number;
  user_id: number;
  done_at: number | null;
  xp: number;
  first_name: string | null;
}

/** A khatm as one person sees it. Other members are known by their name and a key, never by their Telegram id. */
function view(k: KhatmRow, allMembers: MemberRow[], allParts: PartRow[], me: number) {
  const members = allMembers.filter((m) => m.khatm_id === k.id);
  const parts = allParts.filter((p) => p.khatm_id === k.id);
  return {
    id: k.id,
    title: k.title,
    due: k.due,
    round: k.round,
    owner: k.owner_name ?? '',
    isOwner: k.owner === me,
    joined: members.some((m) => m.user_id === me),
    done: k.done_at !== null,
    read: parts.filter((p) => p.done_at !== null).length,
    members: members.map((m) => {
      const theirs = parts.filter((p) => p.user_id === m.user_id);
      return {
        key: m.key,
        name: m.first_name ?? '',
        isMe: m.user_id === me,
        isOwner: m.user_id === k.owner,
        taken: theirs.length,
        read: theirs.filter((p) => p.done_at !== null).length,
      };
    }),
    // Only the juz somebody took; the rest are free.
    parts: parts.map((p) => ({ juz: p.juz, name: p.first_name ?? '', mine: p.user_id === me, done: p.done_at !== null })),
  };
}

const KHATMS = 'SELECT k.*, o.first_name AS owner_name FROM gkhatms k LEFT JOIN users o ON o.id = k.owner';
const MEMBERS = 'SELECT m.khatm_id, m.user_id, m.key, u.first_name FROM gkhatm_members m LEFT JOIN users u ON u.id = m.user_id';
const PARTS = 'SELECT p.khatm_id, p.juz, p.user_id, p.done_at, p.xp, u.first_name FROM gkhatm_parts p LEFT JOIN users u ON u.id = p.user_id';
const MEMBER_ORDER = 'ORDER BY m.joined_at, m.user_id';

const ONE = `${KHATMS} WHERE k.id = ?1`;
const ONE_MEMBERS = `${MEMBERS} WHERE m.khatm_id = ?1 ${MEMBER_ORDER}`;
const ONE_PARTS = `${PARTS} WHERE p.khatm_id = ?1 ORDER BY p.juz`;

// The caller's khatms: the ones still being read first, newest first.
const MY_IDS = 'SELECT khatm_id FROM gkhatm_members WHERE user_id = ?1';
const MINE = `${KHATMS} WHERE k.id IN (${MY_IDS}) ORDER BY k.done_at IS NOT NULL, k.created_at DESC`;
const MINE_MEMBERS = `${MEMBERS} WHERE m.khatm_id IN (${MY_IDS}) ${MEMBER_ORDER}`;
const MINE_PARTS = `${PARTS} WHERE p.khatm_id IN (${MY_IDS}) ORDER BY p.juz`;

// How many unfinished khatms the caller is in, and how many of them they started.
const ACTIVE = `
  SELECT COUNT(*) AS n, COALESCE(SUM(k.owner = ?1), 0) AS owned
  FROM gkhatm_members m JOIN gkhatms k ON k.id = m.khatm_id
  WHERE m.user_id = ?1 AND k.done_at IS NULL`;

const IS_MEMBER = 'SELECT 1 AS yes FROM gkhatm_members WHERE khatm_id = ?1 AND user_id = ?2';
const ADD_MEMBER = 'INSERT INTO gkhatm_members (khatm_id, user_id, key, joined_at) VALUES (?1, ?2, ?3, ?4)';
const TOUCH = 'UPDATE gkhatms SET updated_at = ?2 WHERE id = ?1';
// Somebody who goes gives back what they have not read; what they did read stays read.
const FREE_UNREAD = 'DELETE FROM gkhatm_parts WHERE khatm_id = ?1 AND user_id = ?2 AND done_at IS NULL';
const DROP_MEMBER = 'DELETE FROM gkhatm_members WHERE khatm_id = ?1 AND user_id = ?2';

/** The three statements that read one khatm whole. */
const whole = (db: D1Database, kid: string): D1PreparedStatement[] => [
  db.prepare(ONE).bind(kid),
  db.prepare(ONE_MEMBERS).bind(kid),
  db.prepare(ONE_PARTS).bind(kid),
];

/** The view built from the last three results of a batch that ended with `whole`. */
function viewOf(out: D1Result[], me: number) {
  const k = rows<KhatmRow>(out[out.length - 3])[0];
  if (!k) throw notFound();
  return view(k, rows<MemberRow>(out[out.length - 2]), rows<PartRow>(out[out.length - 1]), me);
}

/** GET /api/gkhatm: the caller's group khatms. */
export async function getGroupKhatms(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(MINE).bind(id), db.prepare(MINE_MEMBERS).bind(id), db.prepare(MINE_PARTS).bind(id)]);
  if (writes.length) await db.batch(writes);
  const members = rows<MemberRow>(results[1]);
  const parts = rows<PartRow>(results[2]);
  return json({ khatms: rows<KhatmRow>(results[0]).map((k) => view(k, members, parts, id)) });
}

/** GET /api/gkhatm/one?id=…: one khatm, also for someone deciding whether to join it. */
export async function getGroupKhatm(c: Ctx): Promise<Response> {
  const kid = match(c.url.searchParams.get('id'), 'id', ID_RE);
  const db = c.env.DB;
  const { writes, results } = await loadUser(c, {}, whole(db, kid));
  if (writes.length) await db.batch(writes);
  return json({ khatm: viewOf(results, c.auth.id) });
}

/** POST /api/gkhatm { title, due? }: starts a khatm with the caller as its first member. */
export async function postGroupKhatm(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const title = str(typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ') : body.title, 'title', 40);
  const due = body.due === undefined || body.due === null || body.due === '' ? null : dayField(body.due, 'due');
  const today = new Date(c.now).toISOString().slice(0, 10);
  if (due !== null && (due < shiftDay(today, -1) || due > shiftDay(today, MAX_DUE_DAYS))) throw badRequest('due: a day from today to two years ahead expected');

  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(ACTIVE).bind(id)]);
  const active = rows<{ n: number; owned: number }>(results[0])[0] ?? { n: 0, owned: 0 };
  if (active.n >= MAX_ACTIVE || active.owned >= MAX_OWNED) throw new HttpError(409, 'limit');

  const kid = newId();
  writes.push(
    db.prepare('INSERT INTO gkhatms (id, owner, title, due, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(kid, id, title, due, c.now),
    db.prepare(ADD_MEMBER).bind(kid, id, newId(6), c.now),
    ...whole(db, kid),
  );
  return json({ khatm: viewOf(await db.batch(writes), id) });
}

interface OwnerRow {
  id: number;
  lang: string;
  can_message: number;
  blocked: number;
  open_label: string;
}

/** POST /api/gkhatm/join { id }: joins a khatm (joining twice changes nothing). */
export async function postKhatmJoin(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [
    ...whole(db, kid),
    db.prepare(ACTIVE).bind(id),
    db.prepare('SELECT u.id, u.lang, u.can_message, u.blocked, u.open_label FROM users u JOIN gkhatms k ON k.owner = u.id WHERE k.id = ?1').bind(kid),
  ]);
  const k = rows<KhatmRow>(results[0])[0];
  if (!k) throw notFound();
  const members = rows<MemberRow>(results[1]);
  if (members.some((m) => m.user_id === id)) {
    if (writes.length) await db.batch(writes);
    return json({ khatm: view(k, members, rows<PartRow>(results[2]), id) });
  }
  if (members.length >= MAX_MEMBERS) throw new HttpError(409, 'full');
  if ((rows<{ n: number }>(results[3])[0]?.n ?? 0) >= MAX_ACTIVE) throw new HttpError(409, 'limit');

  writes.push(db.prepare(ADD_MEMBER).bind(kid, id, newId(6), c.now), db.prepare(TOUCH).bind(kid, c.now), ...whole(db, kid));
  const joined = viewOf(await db.batch(writes), id);

  // Tell whoever started it.
  const owner = rows<OwnerRow>(results[4])[0];
  if (owner && owner.id !== id && owner.can_message === 1 && owner.blocked !== 1) {
    const text = TEXT[langOf(owner.lang)];
    const res = await tg(c.env, 'sendMessage', {
      chat_id: owner.id,
      text: text.khatmJoined(user.first_name || '🙂', k.title),
      reply_markup: openButton(owner.open_label || text.open, baseUrl(c.env.APP_URL), `k_${kid}`),
    });
    if (res.status === 403) await blockedStatement(db, owner.id, c.now).run();
  }
  return json({ khatm: joined });
}

/** POST /api/gkhatm/leave { id }: a member leaves. Whoever started it deletes it instead. */
export async function postKhatmLeave(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(ONE).bind(kid)]);
  const k = rows<KhatmRow>(results[0])[0];
  if (k?.owner === id) throw new HttpError(409, 'owner');
  writes.push(db.prepare(FREE_UNREAD).bind(kid, id), db.prepare(DROP_MEMBER).bind(kid, id));
  await db.batch(writes);
  return json({ ok: true });
}

/** POST /api/gkhatm/remove { id, key }: whoever started the khatm takes a member out of it. */
export async function postKhatmRemove(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const key = match(body.key, 'key', KEY_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [
    db.prepare(ONE).bind(kid),
    db.prepare('SELECT user_id FROM gkhatm_members WHERE khatm_id = ?1 AND key = ?2').bind(kid, key),
  ]);
  const k = rows<KhatmRow>(results[0])[0];
  if (!k || k.owner !== id) throw notFound();
  const member = rows<{ user_id: number }>(results[1])[0];
  if (!member) throw notFound();
  if (member.user_id === id) throw new HttpError(409, 'owner');
  writes.push(db.prepare(FREE_UNREAD).bind(kid, member.user_id), db.prepare(DROP_MEMBER).bind(kid, member.user_id), db.prepare(TOUCH).bind(kid, c.now), ...whole(db, kid));
  return json({ khatm: viewOf(await db.batch(writes), id) });
}

interface TellRow {
  user_id: number;
  lang: string;
  can_message: number;
  blocked: number;
  open_label: string;
}

/**
 * Tells every member that the round is complete, once: each member's row is claimed for this round
 * before anything goes out. The one who read the last juz is looking at the app and is not written to.
 */
async function announce(env: Env, k: KhatmRow, finisher: number, now: number): Promise<void> {
  const db = env.DB;
  const [due] = await db.batch([
    db
      .prepare(
        `SELECT m.user_id, u.lang, u.can_message, u.blocked, u.open_label
         FROM gkhatm_members m JOIN users u ON u.id = m.user_id WHERE m.khatm_id = ?1 AND m.notified_round < ?2`,
      )
      .bind(k.id, k.round),
    db.prepare('UPDATE gkhatm_members SET notified_round = ?2 WHERE khatm_id = ?1 AND notified_round < ?2').bind(k.id, k.round),
  ]);
  const list = rows<TellRow>(due).filter((m) => m.user_id !== finisher && m.can_message === 1 && m.blocked !== 1);
  const appUrl = baseUrl(env.APP_URL);
  const gone: D1PreparedStatement[] = [];
  for (let i = 0; i < list.length; i += TELL_AT_ONCE) {
    await Promise.all(
      list.slice(i, i + TELL_AT_ONCE).map(async (m) => {
        const text = TEXT[langOf(m.lang)];
        const res = await tg(env, 'sendMessage', {
          chat_id: m.user_id,
          text: text.khatmDone(k.title),
          reply_markup: openButton(m.open_label || text.open, appUrl, `k_${k.id}`),
        });
        if (res.status === 403) gone.push(blockedStatement(db, m.user_id, now));
        else if (!res.ok) console.error(`group khatm: sendMessage failed (${res.status}): ${res.description ?? ''}`);
      }),
    );
  }
  if (gone.length) await db.batch(gone);
}

/**
 * POST /api/gkhatm/juz { id, juz, action, day? }: a member takes a free juz, gives back one they have
 * not read, marks their own juz read, or takes that mark back. The answer carries the XP the app
 * should add (or, when it is negative, take back): 20 for a juz read, at most 40 on one day.
 */
export async function postKhatmJuz(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const juz = int(body.juz, 'juz', 1, JUZ);
  const action = oneOf(body.action, 'action', ACTIONS);
  const reported = body.day === undefined || body.day === null ? null : dayField(body.day, 'day');

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [
    db.prepare(ONE).bind(kid),
    db.prepare(IS_MEMBER).bind(kid, id),
    db.prepare('SELECT user_id, done_at, xp FROM gkhatm_parts WHERE khatm_id = ?1 AND juz = ?2').bind(kid, juz),
  ]);
  const k = rows<KhatmRow>(results[0])[0];
  if (!k) throw notFound();
  if (!rows(results[1])[0]) throw new HttpError(403, 'not_member');
  if (k.done_at !== null) throw new HttpError(409, 'complete');
  const part = rows<{ user_id: number; done_at: number | null; xp: number }>(results[2])[0];
  if (part && part.user_id !== id) throw new HttpError(409, 'taken');

  let change: D1PreparedStatement | null = null;
  let back = 0; // XP a mark taken back had brought
  if (action === 'take') {
    if (!part) change = db.prepare('INSERT INTO gkhatm_parts (khatm_id, juz, user_id, taken_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (khatm_id, juz) DO NOTHING').bind(kid, juz, id, c.now);
  } else if (!part) {
    throw new HttpError(409, 'not_yours');
  } else if (action === 'release') {
    if (part.done_at !== null) throw new HttpError(409, 'read');
    change = db.prepare('DELETE FROM gkhatm_parts WHERE khatm_id = ?1 AND juz = ?2 AND user_id = ?3 AND done_at IS NULL').bind(kid, juz, id);
  } else if (action === 'read') {
    if (part.done_at === null) {
      // The reader's own day. The XP is decided here, in the same statement, so two marks cannot both slip under the cap.
      const day = nearToday(reported, c.now) ? reported : localDay(user.tz, c.now);
      change = db
        .prepare(
          `UPDATE gkhatm_parts SET done_at = ?4, done_day = ?5,
             xp = CASE WHEN (SELECT COALESCE(SUM(xp), 0) FROM gkhatm_parts WHERE user_id = ?3 AND done_day = ?5) + ${JUZ_XP} <= ${JUZ_XP_DAY} THEN ${JUZ_XP} ELSE 0 END
           WHERE khatm_id = ?1 AND juz = ?2 AND user_id = ?3 AND done_at IS NULL`,
        )
        .bind(kid, juz, id, c.now, day);
    }
  } else if (part.done_at !== null) {
    back = part.xp;
    change = db.prepare('UPDATE gkhatm_parts SET done_at = NULL, done_day = NULL, xp = 0 WHERE khatm_id = ?1 AND juz = ?2 AND user_id = ?3 AND done_at IS NOT NULL').bind(kid, juz, id);
  }

  let at = -1; // where the change sits in the batch
  let completes = -1;
  if (change) {
    at = writes.push(change) - 1;
    writes.push(db.prepare(TOUCH).bind(kid, c.now));
    if (action === 'read') {
      completes =
        writes.push(
          db
            .prepare(
              `UPDATE gkhatms SET done_at = ?2 WHERE id = ?1 AND done_at IS NULL
                 AND (SELECT COUNT(*) FROM gkhatm_parts WHERE khatm_id = ?1 AND done_at IS NOT NULL) = ${JUZ}`,
            )
            .bind(kid, c.now),
        ) - 1;
    }
  }
  const out = await db.batch([...writes, ...whole(db, kid)]);
  const applied = at >= 0 && out[at]?.meta.changes === 1;
  const now = rows<PartRow>(out[out.length - 1]).find((p) => p.juz === juz);
  // Somebody else took it between the look and the write.
  if (action === 'take' && now && now.user_id !== id) throw new HttpError(409, 'taken');
  const xp = !applied ? 0 : action === 'read' ? (now?.xp ?? 0) : action === 'unread' ? -back : 0;
  const completed = completes >= 0 && out[completes]?.meta.changes === 1;
  const fresh = viewOf(out, id);
  if (completed) {
    try {
      await announce(c.env, k, id, c.now);
    } catch (e) {
      console.error('group khatm: telling the members failed:', describe(e));
    }
  }
  return json({ khatm: fresh, xp, completed });
}

/** POST /api/gkhatm/next { id }: whoever started a complete khatm begins its next round with an empty board. */
export async function postKhatmNext(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(ONE).bind(kid)]);
  const k = rows<KhatmRow>(results[0])[0];
  if (!k || k.owner !== id) throw notFound();
  if (k.done_at === null) throw new HttpError(409, 'not_complete');
  writes.push(
    // Only a complete round moves on, so two taps cannot skip a round.
    db.prepare('DELETE FROM gkhatm_parts WHERE khatm_id = ?1 AND EXISTS (SELECT 1 FROM gkhatms WHERE id = ?1 AND done_at IS NOT NULL)').bind(kid),
    db.prepare('UPDATE gkhatms SET round = round + 1, done_at = NULL, updated_at = ?2 WHERE id = ?1 AND done_at IS NOT NULL').bind(kid, c.now),
    ...whole(db, kid),
  );
  return json({ khatm: viewOf(await db.batch(writes), id) });
}

/** POST /api/gkhatm/delete { id }: whoever started the khatm deletes it for everyone. */
export async function postKhatmDelete(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kid = match(body.id, 'id', ID_RE);
  const db = c.env.DB;
  const { writes } = await loadUser(c);
  writes.push(db.prepare('DELETE FROM gkhatms WHERE id = ?1 AND owner = ?2').bind(kid, c.auth.id));
  const out = await db.batch(writes);
  // Its members and juz go with it, and the database counts those rows as changes too.
  if (!out[out.length - 1]?.meta.changes) throw notFound();
  return json({ ok: true });
}

/** Hourly: deletes the khatms nobody has touched for half a year. */
export async function cleanUpTogether(env: Env, now: number): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM gkhatms WHERE updated_at < ?1').bind(now - KEEP_MS).run();
  } catch (e) {
    console.error('group khatm clean-up:', describe(e));
  }
}
