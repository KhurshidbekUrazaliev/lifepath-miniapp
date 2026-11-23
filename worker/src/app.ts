// The Android app: signing in through the bot, and the shared copy of the data that the app and the
// Mini App both sync with.
//
// Signing in: POST /api/app/login gives the app a code. The app opens t.me/<bot>?start=login_<code>;
// when the user presses Start, the bot ties the code to them (appLogin below). The app then collects
// a session token once from GET /api/app/login?code=. It sends it as "Authorization: app <token>".
//
// The data: /api/kv/* work like Telegram CloudStorage (keys of up to 4096 characters, 1024 keys per
// user), so the app's sync code (src/store/sync.ts) runs against either. The journal's keys are refused:
// the journal never leaves the phone.
import type { AuthUser } from './auth';
import type { Env } from './env';
import { badRequest, json, rateLimited, readBytes } from './http';
import { rows, type Ctx } from './users';
import type { TgUser } from './telegram';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_SEEN_STEP_MS = 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Za-z0-9_-]{24}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Keys of the shared copy: the manifest, profile, settings and chunks of every kind but the journal. */
export const KV_KEY_RE = /^(m|pr|st|[ftephcw]\d{1,4})$/;
const KV_VALUE_MAX = 4096;
const KV_MAX_KEYS = 1024;
const KV_BATCH = 100;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const random = (n: number): string => base64url(crypto.getRandomValues(new Uint8Array(n)));

async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64url(new Uint8Array(digest));
}

// ---------- signing in ----------

/** POST /api/app/login (no auth): a new sign-in code and the bot to open with it. */
export async function postAppLogin(request: Request, env: Env, now: number): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const limit = await env.API_LIMIT?.limit({ key: `login:${ip}` });
  if (limit && !limit.success) throw rateLimited();
  const code = random(18); // 24 characters
  const [, bot] = await env.DB.batch([
    env.DB.prepare('INSERT INTO app_logins (code, created_at) VALUES (?1, ?2)').bind(code, now),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'bot_username'"),
  ]);
  return json({ code, bot: rows<{ value: string }>(bot)[0]?.value ?? null, expiresAt: now + LOGIN_TTL_MS });
}

/** GET /api/app/login?code= (no auth): { status: 'waiting' | 'expired' } or, once, { status: 'ok', token }. */
export async function getAppLogin(request: Request, env: Env, url: URL, now: number): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const limit = await env.API_LIMIT?.limit({ key: `login:${ip}` });
  if (limit && !limit.success) throw rateLimited();
  const code = url.searchParams.get('code') ?? '';
  if (!CODE_RE.test(code)) throw badRequest('code');
  const row = await env.DB.prepare('SELECT created_at, user_id, token FROM app_logins WHERE code = ?1')
    .bind(code)
    .first<{ created_at: number; user_id: number | null; token: string | null }>();
  if (!row || now - row.created_at > LOGIN_TTL_MS) return json({ status: 'expired' });
  if (!row.token || !row.user_id) return json({ status: 'waiting' });
  // Handed out once: the row goes, the session stays.
  await env.DB.prepare('DELETE FROM app_logins WHERE code = ?1').bind(code).run();
  return json({ status: 'ok', token: row.token });
}

/**
 * The bot got "/start login_<code>": ties the code to the person who pressed Start and makes their
 * session. Returns false when the code is unknown, used or too old.
 */
export async function appLogin(env: Env, code: string, from: TgUser, now: number): Promise<boolean> {
  if (!CODE_RE.test(code)) return false;
  const row = await env.DB.prepare('SELECT created_at, user_id FROM app_logins WHERE code = ?1')
    .bind(code)
    .first<{ created_at: number; user_id: number | null }>();
  if (!row || row.user_id !== null || now - row.created_at > LOGIN_TTL_MS) return false;
  const token = random(32); // 43 characters
  await env.DB.batch([
    env.DB.prepare('UPDATE app_logins SET user_id = ?2, token = ?3 WHERE code = ?1 AND user_id IS NULL').bind(code, from.id, token),
    env.DB.prepare('INSERT INTO app_sessions (token_hash, user_id, created_at, seen_at) VALUES (?1, ?2, ?3, ?3)').bind(await hash(token), from.id, now),
  ]);
  return true;
}

/** The person behind an app session token, or null. Keeps the session's "last used" roughly current. */
export async function appSessionUser(env: Env, token: string, now: number): Promise<AuthUser | null> {
  if (!TOKEN_RE.test(token)) return null;
  const tokenHash = await hash(token);
  const row = await env.DB.prepare(
    `SELECT s.seen_at, u.id, u.first_name, u.username, u.tg_lang, u.can_message
       FROM app_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1`,
  )
    .bind(tokenHash)
    .first<{ seen_at: number; id: number; first_name: string; username: string | null; tg_lang: string | null; can_message: number }>();
  if (!row) return null;
  if (now - row.seen_at > SESSION_SEEN_STEP_MS) {
    await env.DB.prepare('UPDATE app_sessions SET seen_at = ?2 WHERE token_hash = ?1').bind(tokenHash, now).run();
  }
  return { id: row.id, firstName: row.first_name ?? '', username: row.username, languageCode: row.tg_lang, allowsWrite: row.can_message === 1 };
}

/** POST /api/app/logout: ends this session. */
export async function postAppLogout(c: Ctx): Promise<Response> {
  const header = c.request.headers.get('Authorization') ?? '';
  const token = header.replace(/^app\s+/i, '').trim();
  if (TOKEN_RE.test(token)) await c.env.DB.prepare('DELETE FROM app_sessions WHERE token_hash = ?1').bind(await hash(token)).run();
  return json({ ok: true });
}

/** Hourly: sign-in codes nobody used. */
export async function cleanAppLogins(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM app_logins WHERE created_at < ?1').bind(now - LOGIN_TTL_MS).run();
}

// ---------- the shared copy ----------

async function body(c: Ctx, max: number): Promise<any> {
  try {
    return JSON.parse(new TextDecoder().decode(await readBytes(c.request, max)));
  } catch {
    throw badRequest('json');
  }
}

const keyList = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > KV_BATCH) throw badRequest('keys');
  for (const k of value) if (typeof k !== 'string' || !KV_KEY_RE.test(k)) throw badRequest('key');
  return value as string[];
};

/** GET /api/kv/keys */
export async function getKvKeys(c: Ctx): Promise<Response> {
  const { results } = await c.env.DB.prepare('SELECT key FROM user_kv WHERE user_id = ?1').bind(c.auth.id).all<{ key: string }>();
  return json({ keys: results.map((r) => r.key) });
}

/** POST /api/kv/get { keys } -> { items } (a missing key is left out). */
export async function postKvGet(c: Ctx): Promise<Response> {
  const keys = keyList((await body(c, 16 * 1024)).keys);
  const items: Record<string, string> = {};
  if (keys.length) {
    const marks = keys.map((_, i) => `?${i + 2}`).join(',');
    const { results } = await c.env.DB.prepare(`SELECT key, value FROM user_kv WHERE user_id = ?1 AND key IN (${marks})`)
      .bind(c.auth.id, ...keys)
      .all<{ key: string; value: string }>();
    for (const r of results) items[r.key] = r.value;
  }
  return json({ items });
}

/** POST /api/kv/set { items } */
export async function postKvSet(c: Ctx): Promise<Response> {
  const items = (await body(c, 512 * 1024)).items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw badRequest('items');
  const pairs = Object.entries(items);
  if (pairs.length > KV_BATCH) throw badRequest('items');
  for (const [k, v] of pairs) {
    if (!KV_KEY_RE.test(k)) throw badRequest('key');
    if (typeof v !== 'string' || v.length > KV_VALUE_MAX) throw badRequest('value');
  }
  if (!pairs.length) return json({ ok: true });
  const db = c.env.DB;
  const count = await db.prepare('SELECT COUNT(*) AS n FROM user_kv WHERE user_id = ?1').bind(c.auth.id).first<{ n: number }>();
  if ((count?.n ?? 0) + pairs.length > KV_MAX_KEYS) {
    // Only new keys count against the limit.
    const marks = pairs.map((_, i) => `?${i + 2}`).join(',');
    const have = await db.prepare(`SELECT COUNT(*) AS n FROM user_kv WHERE user_id = ?1 AND key IN (${marks})`)
      .bind(c.auth.id, ...pairs.map(([k]) => k))
      .first<{ n: number }>();
    if ((count?.n ?? 0) + pairs.length - (have?.n ?? 0) > KV_MAX_KEYS) throw badRequest('full');
  }
  await db.batch(
    pairs.map(([k, v]) =>
      db.prepare(
        `INSERT INTO user_kv (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(c.auth.id, k, v, c.now),
    ),
  );
  return json({ ok: true });
}

/** POST /api/kv/remove { keys } */
export async function postKvRemove(c: Ctx): Promise<Response> {
  const keys = keyList((await body(c, 16 * 1024)).keys);
  if (keys.length) {
    const marks = keys.map((_, i) => `?${i + 2}`).join(',');
    await c.env.DB.prepare(`DELETE FROM user_kv WHERE user_id = ?1 AND key IN (${marks})`).bind(c.auth.id, ...keys).run();
  }
  return json({ ok: true });
}
