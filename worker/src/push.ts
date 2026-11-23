// Web push: the reminders as notifications in a browser or a home-screen app (iPhone Safari 16.4+,
// Chrome, Firefox, Edge). The browser hands the app a subscription (an address at its push service
// and two keys); the cron posts each reminder there, encrypted for that browser alone (RFC 8291) and
// signed with the site's VAPID key (RFC 8292). Nothing here needs a library: WebCrypto does it all.
import { devAuthEnabled } from './auth';
import type { Env } from './env';
import { badRequest, json, readJson } from './http';
import type { Ctx } from './users';
import { obj, str } from './validate';

/** Browsers per person. A new one past this replaces the oldest. */
const MAX_SUBS = 5;
/** The push services of Chrome/Edge/Android, Safari, Firefox and Windows. Anything else is refused. */
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]*\.push\.apple\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]*\.notify\.windows\.com)$/;
const KEY_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ---------- base64url ----------

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').padEnd(Math.ceil(text.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- the routes ----------

/** How many bytes a base64url key holds, or -1 when it is not one. */
function bytes(key: string): number {
  if (!KEY_RE.test(key)) return -1;
  try {
    return unb64url(key).length;
  } catch {
    return -1;
  }
}

/** GET /api/push/key: the public key a browser subscribes with, or null when push is not set up. */
export async function getPushKey(c: Ctx): Promise<Response> {
  return json({ key: c.env.VAPID_PUBLIC && c.env.VAPID_PRIVATE ? c.env.VAPID_PUBLIC : null });
}

/** PUT /api/push: this browser wants the reminders. Body: the subscription as the browser gives it. */
export async function putPush(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const endpoint = str(body.endpoint, 'endpoint', 1000);
  let host: string;
  try {
    const u = new URL(endpoint);
    // A local stand-in for the push service is allowed only in local tests.
    const local = u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname) && devAuthEnabled(c.env, c.url);
    if (u.protocol !== 'https:' && !local) throw new Error();
    host = local ? 'local' : u.hostname;
  } catch {
    throw badRequest('endpoint: an https address expected');
  }
  if (host !== 'local' && !PUSH_HOST.test(host)) throw badRequest('endpoint: not a known push service');
  const keys = obj(body.keys, 'keys');
  const p256dh = str(keys.p256dh, 'keys.p256dh', 200);
  const auth = str(keys.auth, 'keys.auth', 100);
  if (bytes(p256dh) !== 65) throw badRequest('keys.p256dh');
  if (bytes(auth) !== 16) throw badRequest('keys.auth');

  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
      )
      .bind(endpoint, c.auth.id, p256dh, auth, c.now),
    // Only the newest few stay.
    db
      .prepare(
        `DELETE FROM push_subs WHERE user_id = ?1 AND endpoint NOT IN
           (SELECT endpoint FROM push_subs WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)`,
      )
      .bind(c.auth.id, MAX_SUBS),
  ]);
  return json({ ok: true });
}

/** DELETE /api/push: this browser no longer wants them. Body: { endpoint }. */
export async function deletePush(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const endpoint = str(body.endpoint, 'endpoint', 1000);
  await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1 AND user_id = ?2').bind(endpoint, c.auth.id).run();
  return json({ ok: true });
}

// ---------- sending ----------

/** The VAPID signature for one push service: a JWT signed with the site's key, valid for 12 hours. */
async function vapid(env: Env, endpoint: string, subject: string, now: number): Promise<string> {
  const pub = unb64url(env.VAPID_PUBLIC ?? '');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: env.VAPID_PRIVATE, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const head = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** The message encrypted for one browser (RFC 8291, "aes128gcm"): one record, header included. */
export async function encrypt(sub: PushSub, plain: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const theirs = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    // The types call it $public; the runtime, like the standard, reads public.
    { name: 'ECDH', public: theirs } as unknown as SubtleCryptoDeriveKeyAlgorithm,
    local.privateKey,
    256,
  ));

  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // The text, then 0x02: the last (and only) record, with no padding.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, Uint8Array.of(2))));
  const recordSize = Uint8Array.of(0, 0, 16, 0); // 4096
  return concat(salt, recordSize, Uint8Array.of(asPublic.length), asPublic, sealed);
}

/** What a notification carries; public/sw.js shows it. */
export interface PushMessage {
  title: string;
  body: string;
  /** Deep link into the app, as on the bot's buttons. */
  open: string | null;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
}

/**
 * Sends one notification. Returns the push service's status: 201 delivered, 404/410 the browser has
 * gone (the caller forgets it), 0 no answer.
 */
export async function sendPush(env: Env, sub: PushSub, message: PushMessage, ttlSeconds: number, subject: string, now: number): Promise<number> {
  try {
    const body = await encrypt(sub, utf8(JSON.stringify(message)));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapid(env, sub.endpoint, subject, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'high',
        Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'lifepath',
      },
      body,
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error(`push: ${new URL(sub.endpoint).hostname} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } else {
      await res.body?.cancel();
    }
    return res.status;
  } catch (e) {
    console.error('push:', e instanceof Error ? e.message : String(e));
    return 0;
  }
}

/** Whether this Worker can send web push. */
export const pushReady = (env: Env): boolean => !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE);
