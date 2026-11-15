// Rankings: the score the app reports, the opt-in profile and the leaderboards.
import { DAY_MS } from './env';
import { badRequest, json, readJson } from './http';
import { weekStart } from './time';
import { ACTIVE_MEMBERSHIPS, readCounters, scoreUpdates, type Membership } from './challenges';
import { loadUser, rows, type Ctx } from './users';
import { bool, day, int, oneOf, str } from './validate';

const TOP = 50;
/** The weekly score may grow by at most this much per UTC day. */
const MAX_WEEK_GROWTH_PER_DAY = 5000;
const MAX_XP = 1_000_000_000;

interface ScoreRow {
  user_id: number;
  opted_in: number;
  name: string | null;
  country: string | null;
  total_xp: number;
  week_xp: number;
  week_start: number;
  level: number;
  streak: number;
  day: number;
  day_base: number;
  xp_at: number;
}

const SCORE = 'SELECT * FROM scores WHERE user_id = ?1';

/** POST /api/activity: the app reports the user's last active day and score. */
export async function postActivity(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const lastActiveDay = day(body.lastActiveDay, 'lastActiveDay');
  const totalXp = int(body.totalXp, 'totalXp', 0, MAX_XP);
  const weekXp = int(body.weekXp, 'weekXp', 0, MAX_XP);
  const claimedWeek = int(body.weekStart, 'weekStart', 0, Number.MAX_SAFE_INTEGER);
  const level = int(body.level, 'level', 0, 100_000);
  const streak = int(body.streak, 'streak', 0, 100_000);
  if (weekXp > totalXp) throw badRequest('weekXp: cannot exceed totalXp');
  // The counters friend challenges are scored on (sent by app versions that have challenges).
  const counters = body.counters === undefined ? null : readCounters(body.counters);

  const db = c.env.DB;
  const id = c.auth.id;
  const { user, writes, results } = await loadUser(c, {}, [
    db.prepare(SCORE).bind(id),
    ...(counters ? [db.prepare(ACTIVE_MEMBERSHIPS).bind(id, c.now)] : []),
  ]);
  if (counters) writes.push(...scoreUpdates(db, rows<Membership>(results[1]), counters, id, c.now));
  const old = rows<ScoreRow>(results[0])[0];

  // The weekly score counts only when the app agrees with the server on which week it is.
  const week = weekStart(c.now);
  const today = Math.floor(c.now / DAY_MS);
  let { week_xp, week_start, day: capDay, day_base } = old ?? { week_xp: 0, week_start: 0, day: 0, day_base: 0 };
  if (claimedWeek === week) {
    if (week_start !== week) [week_xp, day_base, capDay] = [0, 0, today]; // a new week starts from zero
    else if (capDay !== today) [day_base, capDay] = [week_xp, today]; // a new day starts from yesterday's score
    week_xp = Math.min(weekXp, day_base + MAX_WEEK_GROWTH_PER_DAY);
    week_start = week;
  }

  const changed =
    !old ||
    old.total_xp !== totalXp ||
    old.week_xp !== week_xp ||
    old.week_start !== week_start ||
    old.level !== level ||
    old.streak !== streak;
  if (changed) {
    const scoreMoved = !old || old.total_xp !== totalXp || old.week_xp !== week_xp || old.week_start !== week_start;
    writes.push(
      db
        .prepare(
          `INSERT INTO scores (user_id, total_xp, week_xp, week_start, level, streak, day, day_base, xp_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT (user_id) DO UPDATE SET
             total_xp = excluded.total_xp, week_xp = excluded.week_xp, week_start = excluded.week_start,
             level = excluded.level, streak = excluded.streak, day = excluded.day,
             day_base = excluded.day_base, xp_at = excluded.xp_at`,
        )
        .bind(id, totalXp, week_xp, week_start, level, streak, capDay, day_base, scoreMoved ? c.now : (old?.xp_at ?? c.now)),
    );
  }
  if (user.last_active_day !== lastActiveDay) {
    writes.push(db.prepare('UPDATE users SET last_active_day = ?2, updated_at = ?3 WHERE id = ?1').bind(id, lastActiveDay, c.now));
  }
  if (writes.length) await db.batch(writes);
  return json({ ok: true });
}

/** PUT /api/rankings/profile: join or leave the rankings and choose what others see. */
export async function putRankProfile(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const optedIn = bool(body.optedIn, 'optedIn');
  // A name is needed to appear on a board. Leaving the rankings may omit it, which keeps the old one.
  let name: string | null = null;
  if (optedIn || (body.name !== undefined && body.name !== null && body.name !== '')) {
    if (typeof body.name !== 'string') throw badRequest('name: string expected');
    name = str(body.name.replace(/\s+/g, ' '), 'name', 24);
  }
  let country: string | null = null;
  if (body.country !== undefined && body.country !== null && body.country !== '') {
    country = typeof body.country === 'string' ? body.country.toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(country)) throw badRequest('country: ISO 3166-1 alpha-2 code or null expected');
  }

  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(SCORE).bind(id)]);
  const old = rows<ScoreRow>(results[0])[0];
  const stored = { optedIn, name: name ?? old?.name ?? null, country };
  if (!old || old.opted_in !== Number(optedIn) || old.name !== stored.name || old.country !== country) {
    writes.push(
      db
        .prepare(
          `INSERT INTO scores (user_id, opted_in, name, country, xp_at) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (user_id) DO UPDATE SET opted_in = excluded.opted_in, name = excluded.name, country = excluded.country`,
        )
        .bind(id, Number(optedIn), stored.name, country, c.now),
    );
  }
  if (writes.length) await db.batch(writes);
  return json(stored);
}

interface BoardRow {
  user_id: number;
  name: string | null;
  country: string | null;
  level: number;
  xp: number;
}

// ?1 is 0 for the all-time board, or the start of the current week: a weekly score from an older
// week counts as 0. Ties go to whoever reached the score first.
const XP = 'CASE WHEN ?1 = 0 THEN total_xp WHEN week_start = ?1 THEN week_xp ELSE 0 END';

const topSql = (byCountry: boolean): string => `
  SELECT user_id, name, country, level, ${XP} AS xp
  FROM scores WHERE opted_in = 1${byCountry ? ' AND country = ?3' : ''}
  ORDER BY xp DESC, xp_at ASC, user_id ASC LIMIT ?2`;

// How many people are on the board, and how many of them are ahead of the caller (?2 xp, ?3 xp_at, ?4 id).
const countSql = (byCountry: boolean): string => `
  SELECT COUNT(*) AS total,
         COALESCE(SUM(xp > ?2 OR (xp = ?2 AND (xp_at < ?3 OR (xp_at = ?3 AND user_id < ?4)))), 0) AS ahead
  FROM (SELECT user_id, xp_at, ${XP} AS xp FROM scores WHERE opted_in = 1${byCountry ? ' AND country = ?5' : ''})`;

/** GET /api/rankings?scope=global|country&period=week|all */
export async function getRankings(c: Ctx): Promise<Response> {
  const scope = oneOf(c.url.searchParams.get('scope') ?? 'global', 'scope', ['global', 'country'] as const);
  const period = oneOf(c.url.searchParams.get('period') ?? 'week', 'period', ['week', 'all'] as const);
  const week = weekStart(c.now);
  const weekEndsAt = week + 7 * DAY_MS;

  const db = c.env.DB;
  const id = c.auth.id;
  const { writes, results } = await loadUser(c, {}, [db.prepare(SCORE).bind(id)]);
  if (writes.length) await db.batch(writes);
  const mine = rows<ScoreRow>(results[0])[0];
  const ranked = mine?.opted_in === 1;

  // The country board is the caller's own country; without one there is nothing to show.
  const country = scope === 'country' ? (mine?.country ?? null) : null;
  if (scope === 'country' && !country) return json({ rows: [], me: null, total: 0, weekEndsAt });

  const mode = period === 'week' ? week : 0;
  const myXp = !mine ? 0 : mode === 0 ? mine.total_xp : mine.week_start === week ? mine.week_xp : 0;
  const byCountry = country !== null;
  const [top, counts] = await db.batch([
    db.prepare(topSql(byCountry)).bind(...[mode, TOP, ...(byCountry ? [country] : [])]),
    db.prepare(countSql(byCountry)).bind(...[mode, myXp, mine?.xp_at ?? 0, id, ...(byCountry ? [country] : [])]),
  ]);
  const count = rows<{ total: number; ahead: number }>(counts)[0] ?? { total: 0, ahead: 0 };

  return json({
    rows: rows<BoardRow>(top).map((row, index) => ({
      rank: index + 1,
      name: row.name ?? '',
      country: row.country,
      xp: row.xp,
      level: row.level,
      isMe: row.user_id === id,
    })),
    me: ranked ? { rank: count.ahead + 1, xp: myXp } : null,
    total: count.total,
    weekEndsAt,
  });
}
