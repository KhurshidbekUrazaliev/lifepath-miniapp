// Who is calling the API: Telegram Mini App initData, or the dev scheme on a local host.
import type { Env } from './env';
import { serverError, unauthorized } from './http';
import { appSessionUser } from './app';

export interface AuthUser {
  id: number;
  firstName: string;
  username: string | null;
  languageCode: string | null;
  /** The user has allowed the bot to message them (allows_write_to_pm in initData). */
  allowsWrite: boolean;
}

/** initData older than this is refused. */
const MAX_AGE_S = 3 * 24 * 60 * 60;

const encoder = new TextEncoder();

const hmacKey = (raw: BufferSource): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

let cached: { token: string; key: Promise<CryptoKey> } | undefined;

/** secret_key = HMAC_SHA256(key "WebAppData", message bot token), ready to check hashes with. */
function secretKey(token: string): Promise<CryptoKey> {
  if (cached?.token !== token) {
    const key = hmacKey(encoder.encode('WebAppData'))
      .then((k) => crypto.subtle.sign('HMAC', k, encoder.encode(token)))
      .then(hmacKey);
    key.catch(() => (cached = undefined));
    cached = { token, key };
  }
  return cached.key;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toUser(value: unknown): AuthUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const u = value as Record<string, unknown>;
  if (typeof u.id !== 'number' || !Number.isSafeInteger(u.id) || u.id <= 0) return null;
  const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);
  return {
    id: u.id,
    firstName: text(u.first_name, 64) ?? '',
    username: text(u.username, 32),
    languageCode: text(u.language_code, 16),
    allowsWrite: u.allows_write_to_pm === true,
  };
}

/**
 * Checks Mini App initData as the Telegram docs describe: every field except `hash`, sorted by
 * key, joined as key=value lines, signed with HMAC-SHA256 under the secret key. Returns the user,
 * or null when the data is malformed, forged or older than three days.
 */
export async function verifyInitData(initData: string, botToken: string, nowMs: number): Promise<AuthUser | null> {
  if (initData.length === 0 || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = hexToBytes(params.get('hash') ?? '');
  if (!hash) return null;

  const fields = [...params].filter(([key]) => key !== 'hash');
  fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const checkString = fields.map(([key, value]) => `${key}=${value}`).join('\n');
  const genuine = await crypto.subtle.verify('HMAC', await secretKey(botToken), hash, encoder.encode(checkString));
  if (!genuine) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || nowMs / 1000 - authDate > MAX_AGE_S) return null;

  try {
    return toUser(JSON.parse(params.get('user') ?? ''));
  } catch {
    return null;
  }
}

/** Decodes the dev scheme's value: base64url of JSON { id, first_name, username?, language_code? }. */
function decodeDevUser(value: string): AuthUser | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return toUser(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

// Hosts that only exist on a developer's machine or network. A deployed Worker is never reached under one.
const LOCAL_HOST =
  /^(localhost|.+\.(localhost|local|test)|\[::1\]|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})$/;

/** The dev scheme needs DEV_AUTH=1 (set only in .dev.vars) and a local host, so production can never accept it. */
export const devAuthEnabled = (env: Env, url: URL): boolean => env.DEV_AUTH === '1' && LOCAL_HOST.test(url.hostname);

/** The caller of an /api request. Throws 401 unless the Authorization header proves who it is. */
export async function authenticate(request: Request, env: Env, url: URL, nowMs: number): Promise<AuthUser> {
  const header = request.headers.get('Authorization') ?? '';
  const space = header.indexOf(' ');
  const scheme = space > 0 ? header.slice(0, space).toLowerCase() : '';
  const value = header.slice(space + 1).trim();

  let user: AuthUser | null = null;
  if (scheme === 'tma') {
    if (!env.BOT_TOKEN) {
      console.error('BOT_TOKEN is not set');
      throw serverError();
    }
    user = await verifyInitData(value, env.BOT_TOKEN, nowMs);
  } else if (scheme === 'app') {
    // The Android app: a session made when the user signed in through the bot (app.ts).
    user = await appSessionUser(env, value, nowMs);
  } else if (scheme === 'dev' && devAuthEnabled(env, url)) {
    user = decodeDevUser(value);
  }
  if (!user) throw unauthorized();
  return user;
}
