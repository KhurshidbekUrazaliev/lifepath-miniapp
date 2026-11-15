// The JSON API the Mini App calls (same origin, Authorization: tma <initData>).
import { authenticate } from './auth';
import type { Env } from './env';
import { json, notFound, rateLimited, readJson, serverError } from './http';
import { TEXT } from './i18n';
import { GRANT, getAdminUsers, isAdmin, putAdminAccess, type Grant } from './panel';
import { payloadFor, PLUS_PERIOD_S, plusView, priceStars, type Entitlement } from './plus';
import { getChallenge, getChallenges, postChallenge, postJoin, postLeave } from './challenges';
import { getRankings, postActivity, putRankProfile } from './rankings';
import { putReminders, reschedule } from './reminders';
import { postStory } from './stories';
import { tg } from './telegram';
import { loadUser, rows, type Ctx } from './users';
import { lang, timeZone } from './validate';

const ENTITLEMENT = 'SELECT expires_at, renew FROM entitlements WHERE user_id = ?1';
/** "Last opened" is written this often at most, so opening the app again and again writes nothing. */
const SEEN_STEP_MS = 10 * 60 * 1000;

/** POST /api/hello: called when the app opens. Creates or refreshes the user and returns their state. */
async function hello(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const patch = { tz: timeZone(body.tz), lang: lang(body.lang) };

  const db = c.env.DB;
  const { user, previousTz, writes, results } = await loadUser(c, patch, [
    db.prepare('SELECT opted_in, name, country FROM scores WHERE user_id = ?1').bind(c.auth.id),
    db.prepare(ENTITLEMENT).bind(c.auth.id),
    db.prepare("SELECT value FROM meta WHERE key = 'bot_username'"),
    db.prepare(GRANT).bind(c.auth.id),
  ]);
  // The reminders were scheduled in the old time zone: move them to the new one.
  if (previousTz !== null && previousTz !== user.tz) writes.push(...(await reschedule(db, user.id, user.tz, c.now)));
  // After the statement that creates a new user, so the row is there.
  if (c.now - user.seen_at >= SEEN_STEP_MS) writes.push(db.prepare('UPDATE users SET seen_at = ?2 WHERE id = ?1').bind(user.id, c.now));
  if (writes.length) await db.batch(writes);

  const rank = rows<{ opted_in: number; name: string | null; country: string | null }>(results[0])[0];
  const bot = rows<{ value: string }>(results[2])[0];
  const grant = rows<Grant>(results[3])[0];
  return json({
    user: { id: user.id, firstName: user.first_name, username: user.username },
    plus: plusView(rows<Entitlement>(results[1])[0], c.env, c.now, grant?.plus === 1),
    // What the owner has opened for this person without the level it normally takes, and Sparks given to them.
    access: { levels: grant?.levels === 1, sparks: grant?.sparks ?? 0 },
    ...(isAdmin(c.env, c.auth) && { admin: true }),
    rank: { optedIn: rank?.opted_in === 1, name: rank?.name ?? null, country: rank?.country ?? null },
    reminders: { enabled: user.reminders_enabled === 1, canMessage: user.can_message === 1 },
    bot: { username: bot?.value ?? null },
    now: c.now,
  });
}

/** GET /api/plus */
async function getPlus(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const { writes, results } = await loadUser(c, {}, [db.prepare(ENTITLEMENT).bind(c.auth.id), db.prepare(GRANT).bind(c.auth.id)]);
  if (writes.length) await db.batch(writes);
  return json(plusView(rows<Entitlement>(results[0])[0], c.env, c.now, rows<Grant>(results[1])[0]?.plus === 1));
}

/** POST /api/plus/invoice: a link that opens the Stars payment sheet for a 30-day subscription. */
async function postInvoice(c: Ctx): Promise<Response> {
  const limit = await c.env.INVOICE_LIMIT?.limit({ key: String(c.auth.id) });
  if (limit && !limit.success) throw rateLimited();

  const { user, writes } = await loadUser(c);
  if (writes.length) await c.env.DB.batch(writes);

  const res = await tg<string>(c.env, 'createInvoiceLink', {
    title: 'LifePath Plus',
    description: (TEXT[user.lang] ?? TEXT.en).invoiceDescription,
    payload: payloadFor(user.id),
    provider_token: '', // empty for Telegram Stars
    currency: 'XTR',
    prices: [{ label: 'LifePath Plus', amount: priceStars(c.env) }],
    subscription_period: PLUS_PERIOD_S,
  });
  if (!res.ok || typeof res.result !== 'string') {
    console.error(`createInvoiceLink failed (${res.status}): ${res.description ?? ''}`);
    throw serverError();
  }
  return json({ url: res.result });
}

const ROUTES = new Map<string, (c: Ctx) => Promise<Response>>([
  ['POST /api/hello', hello],
  ['PUT /api/reminders', putReminders],
  ['POST /api/activity', postActivity],
  ['GET /api/rankings', getRankings],
  ['PUT /api/rankings/profile', putRankProfile],
  ['GET /api/plus', getPlus],
  ['POST /api/plus/invoice', postInvoice],
  ['GET /api/challenges', getChallenges],
  ['GET /api/challenges/one', getChallenge],
  ['POST /api/challenges', postChallenge],
  ['POST /api/challenges/join', postJoin],
  ['POST /api/challenges/leave', postLeave],
  ['POST /api/story', postStory],
]);

/** The owner's panel. Anyone who is not in ADMINS gets the same 404 as for an address that does not exist. */
const ADMIN_ROUTES = new Map<string, (c: Ctx) => Promise<Response>>([
  ['GET /api/admin/users', getAdminUsers],
  ['PUT /api/admin/access', putAdminAccess],
]);

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const key = `${request.method} ${url.pathname}`;
  const open = ROUTES.get(key);
  const owners = open ? undefined : ADMIN_ROUTES.get(key);
  const handler = open ?? owners;
  if (!handler) throw notFound();

  const now = Date.now();
  const auth = await authenticate(request, env, url, now);
  const limit = await env.API_LIMIT?.limit({ key: String(auth.id) });
  if (limit && !limit.success) throw rateLimited();
  if (owners && !isAdmin(env, auth)) throw notFound();

  return handler({ request, env, url, auth, now });
}
