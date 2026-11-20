// The owner's panel: who uses the app, what level they are, and what the owner has opened for them.
// Only the people named in ADMINS reach it; to everyone else these addresses do not exist.
import type { AuthUser } from './auth';
import { DAY_MS, type Env } from './env';
import { badRequest, json, notFound, readJson } from './http';
import { RENEW_GRACE_MS } from './plus';
import { weekStart } from './time';
import { rows, type Ctx } from './users';
import { bool, int, oneOf } from './validate';

/**
 * ADMINS lists who owns the bot: Telegram ids and @usernames, separated by commas or spaces.
 * An id is the safer of the two: a username can be given up and taken by someone else.
 */
export function isAdmin(env: Env, auth: AuthUser): boolean {
  const username = auth.username?.toLowerCase();
  return (env.ADMINS ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((entry) => (entry.startsWith('@') ? !!username && entry.slice(1).toLowerCase() === username : entry === String(auth.id)));
}

export interface Grant {
  levels: number;
  plus: number;
  sparks: number;
  wardrobe: number;
}

export const GRANT = 'SELECT levels, plus, sparks, wardrobe FROM grants WHERE user_id = ?1';

/** The most Sparks the owner can give one person. */
const MAX_SPARKS = 100_000;

const PAGE = 50;

const SORTS = {
  seen: 'u.seen_at DESC, u.id DESC',
  level: 'COALESCE(s.level, 0) DESC, COALESCE(s.xp, 0) DESC, u.id DESC',
  new: 'u.created_at DESC, u.id DESC',
} as const;

// ?1 is what was typed ('' for everyone), ?2 the same as a LIKE pattern.
const MATCH = "(?1 = '' OR u.first_name LIKE ?2 ESCAPE '\\' OR u.username LIKE ?2 ESCAPE '\\' OR CAST(u.id AS TEXT) = ?1)";

// Paid Plus counts while its period runs (a subscription that renews by itself gets an hour more).
const PAID = `e.expires_at + CASE WHEN e.renew = 'active' THEN ${RENEW_GRACE_MS} ELSE 0 END`;

interface Row {
  id: number;
  first_name: string;
  username: string | null;
  lang: string;
  tz: string;
  created_at: number;
  seen_at: number;
  last_active_day: string | null;
  can_message: number;
  blocked: number;
  reminders_enabled: number;
  level: number;
  xp: number;
  total_xp: number;
  week_xp: number;
  streak: number;
  paid_until: number | null;
  grant_levels: number;
  grant_plus: number;
  grant_sparks: number;
  grant_wardrobe: number;
}

/** GET /api/admin/users?q=&sort=seen|level|new&offset=0 */
export async function getAdminUsers(c: Ctx): Promise<Response> {
  const params = c.url.searchParams;
  const sort = oneOf(params.get('sort') ?? 'seen', 'sort', ['seen', 'level', 'new'] as const);
  const offset = Number(params.get('offset') ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw badRequest('offset: integer 0-1000000 expected');
  // A name, a username (with or without @) or an id.
  const q = (params.get('q') ?? '').trim().replace(/^@/, '').slice(0, 64);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  const db = c.env.DB;
  const { now } = c;
  const [list, found, people, plus, open] = await db.batch([
    db
      .prepare(
        `SELECT u.id, u.first_name, u.username, u.lang, u.tz, u.created_at, u.seen_at, u.last_active_day,
                u.can_message, u.blocked, u.reminders_enabled,
                COALESCE(s.level, 0) AS level, COALESCE(s.xp, 0) AS xp, COALESCE(s.total_xp, 0) AS total_xp,
                CASE WHEN s.week_start = ?3 THEN s.week_xp ELSE 0 END AS week_xp, COALESCE(s.streak, 0) AS streak,
                ${PAID} AS paid_until, COALESCE(g.levels, 0) AS grant_levels, COALESCE(g.plus, 0) AS grant_plus,
                COALESCE(g.sparks, 0) AS grant_sparks, COALESCE(g.wardrobe, 0) AS grant_wardrobe
         FROM users u
         LEFT JOIN scores s ON s.user_id = u.id
         LEFT JOIN entitlements e ON e.user_id = u.id
         LEFT JOIN grants g ON g.user_id = u.id
         WHERE ${MATCH}
         ORDER BY ${SORTS[sort]} LIMIT ?4 OFFSET ?5`,
      )
      .bind(q, like, weekStart(now), PAGE, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${MATCH}`).bind(q, like),
    db
      .prepare(
        `SELECT COUNT(*) AS users,
                COALESCE(SUM(seen_at >= ?1), 0) AS today, COALESCE(SUM(seen_at >= ?2), 0) AS week,
                COALESCE(SUM(seen_at >= ?3), 0) AS month, COALESCE(SUM(created_at >= ?2), 0) AS fresh
         FROM users`,
      )
      .bind(now - DAY_MS, now - 7 * DAY_MS, now - 30 * DAY_MS),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u
         LEFT JOIN entitlements e ON e.user_id = u.id
         LEFT JOIN grants g ON g.user_id = u.id
         WHERE g.plus = 1 OR ${PAID} > ?1`,
      )
      .bind(now),
    db.prepare('SELECT COUNT(*) AS n FROM grants WHERE levels = 1'),
  ]);

  const total = rows<{ n: number }>(found)[0]?.n ?? 0;
  const stats = rows<{ users: number; today: number; week: number; month: number; fresh: number }>(people)[0];
  const users = rows<Row>(list).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    username: r.username,
    lang: r.lang,
    tz: r.tz,
    createdAt: r.created_at,
    seenAt: r.seen_at,
    lastActiveDay: r.last_active_day,
    level: r.level,
    // Everything they have earned; someone on an app from before the panel has only the proven part yet.
    xp: Math.max(r.xp, r.total_xp),
    provenXp: r.total_xp,
    weekXp: r.week_xp,
    streak: r.streak,
    canMessage: r.can_message === 1,
    blocked: r.blocked === 1,
    reminders: r.reminders_enabled === 1,
    paidUntil: r.paid_until !== null && r.paid_until > now ? r.paid_until : null,
    levelsOpen: r.grant_levels === 1,
    plusGift: r.grant_plus === 1,
    sparksGift: r.grant_sparks,
    wardrobeOpen: r.grant_wardrobe === 1,
  }));
  return json({
    stats: {
      users: stats?.users ?? 0,
      today: stats?.today ?? 0,
      week: stats?.week ?? 0,
      month: stats?.month ?? 0,
      fresh: stats?.fresh ?? 0,
      plus: rows<{ n: number }>(plus)[0]?.n ?? 0,
      levelsOpen: rows<{ n: number }>(open)[0]?.n ?? 0,
    },
    users,
    total,
    more: offset + users.length < total,
    now,
  });
}

/** PUT /api/admin/access { id, levels?, plus?, sparks?, wardrobe? }: opens or closes something for one person, or sets how many Sparks they were given. */
export async function putAdminAccess(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const id = int(body.id, 'id', 1, Number.MAX_SAFE_INTEGER);
  const levels = body.levels === undefined ? undefined : bool(body.levels, 'levels');
  const plus = body.plus === undefined ? undefined : bool(body.plus, 'plus');
  const sparks = body.sparks === undefined ? undefined : int(body.sparks, 'sparks', 0, MAX_SPARKS);
  const wardrobe = body.wardrobe === undefined ? undefined : bool(body.wardrobe, 'wardrobe');
  if (levels === undefined && plus === undefined && sparks === undefined && wardrobe === undefined) {
    throw badRequest('levels, plus, sparks or wardrobe expected');
  }

  const db = c.env.DB;
  const [person, granted] = await db.batch([db.prepare('SELECT id FROM users WHERE id = ?1').bind(id), db.prepare(GRANT).bind(id)]);
  if (!rows<{ id: number }>(person)[0]) throw notFound();
  const old = rows<Grant>(granted)[0];
  const next = {
    levels: levels ?? old?.levels === 1,
    plus: plus ?? old?.plus === 1,
    sparks: sparks ?? old?.sparks ?? 0,
    wardrobe: wardrobe ?? old?.wardrobe === 1,
  };
  await db
    .prepare(
      `INSERT INTO grants (user_id, levels, plus, sparks, wardrobe, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (user_id) DO UPDATE SET
         levels = excluded.levels, plus = excluded.plus, sparks = excluded.sparks, wardrobe = excluded.wardrobe,
         updated_at = excluded.updated_at`,
    )
    .bind(id, Number(next.levels), Number(next.plus), next.sparks, Number(next.wardrobe), c.now)
    .run();
  return json({ id, levelsOpen: next.levels, plusGift: next.plus, sparksGift: next.sparks, wardrobeOpen: next.wardrobe });
}
