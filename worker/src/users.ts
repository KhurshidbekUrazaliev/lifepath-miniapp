// The users table: who an API request is from, and whether the bot may message them.
import type { AuthUser } from './auth';
import type { Env, Lang } from './env';
import { pickLang } from './i18n';
import type { TgUser } from './telegram';

/** Everything an API handler gets. */
export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  auth: AuthUser;
  now: number;
  /** Work that may go on after the answer is sent (the Worker's waitUntil). */
  wait?: (work: Promise<unknown>) => void;
}

export interface UserRow {
  id: number;
  first_name: string;
  username: string | null;
  tg_lang: string | null;
  lang: Lang;
  tz: string;
  can_message: number;
  /** 1 after the user blocked the bot, until they write to it or unblock it. */
  blocked: number;
  reminders_enabled: number;
  open_label: string;
  last_active_day: string | null;
  created_at: number;
  updated_at: number;
  /** When the app was last opened (0 before the first time). */
  seen_at: number;
}

export interface Loaded {
  user: UserRow;
  /** The time zone stored before this request; null for a new user. */
  previousTz: string | null;
  /** Statements that create or update the user. The handler adds its own and runs them as one batch. */
  writes: D1PreparedStatement[];
  /** Results of the extra statements, in order. */
  results: D1Result[];
}

/** Rows of one result of a batch. */
export const rows = <T>(result: D1Result | undefined): T[] => (result?.results ?? []) as T[];

const UPSERT_USER = `
  INSERT INTO users (id, first_name, username, tg_lang, lang, tz, can_message, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
  ON CONFLICT (id) DO UPDATE SET
    first_name = excluded.first_name, username = excluded.username, tg_lang = excluded.tg_lang,
    lang = excluded.lang, tz = excluded.tz, updated_at = excluded.updated_at,
    can_message = CASE WHEN users.blocked = 1 THEN 0 ELSE MAX(users.can_message, excluded.can_message) END`;

const PROFILE: readonly (keyof UserRow)[] = ['first_name', 'username', 'tg_lang', 'lang', 'tz', 'can_message'];

/**
 * Reads the caller's row together with `extra` statements in one round trip. A missing user is
 * created and a changed profile (name, language, time zone) is updated, but only through `writes`,
 * so a request that changes nothing writes nothing.
 */
export async function loadUser(
  c: Ctx,
  patch: { tz?: string; lang?: Lang } = {},
  extra: D1PreparedStatement[] = [],
): Promise<Loaded> {
  const { auth, env, now } = c;
  const [first, ...results] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(auth.id),
    ...extra,
  ]);
  const old = rows<UserRow>(first)[0];
  const user: UserRow = {
    id: auth.id,
    first_name: auth.firstName,
    username: auth.username,
    tg_lang: auth.languageCode ?? old?.tg_lang ?? null,
    lang: patch.lang ?? old?.lang ?? pickLang(auth.languageCode),
    tz: patch.tz ?? old?.tz ?? 'UTC',
    // initData keeps saying "allowed" after a block, so it only counts for someone who has not blocked the bot.
    can_message: old?.can_message === 1 || (auth.allowsWrite && old?.blocked !== 1) ? 1 : 0,
    blocked: old?.blocked ?? 0,
    reminders_enabled: old?.reminders_enabled ?? 0,
    open_label: old?.open_label ?? '',
    last_active_day: old?.last_active_day ?? null,
    created_at: old?.created_at ?? now,
    updated_at: old?.updated_at ?? now,
    seen_at: old?.seen_at ?? 0,
  };
  const writes: D1PreparedStatement[] = [];
  if (!old || PROFILE.some((key) => old[key] !== user[key])) {
    writes.push(
      env.DB.prepare(UPSERT_USER).bind(
        user.id,
        user.first_name,
        user.username,
        user.tg_lang,
        user.lang,
        user.tz,
        user.can_message,
        now,
      ),
    );
  }
  return { user, previousTz: old?.tz ?? null, writes, results };
}

const UPSERT_CHAT_USER = `
  INSERT INTO users (id, first_name, username, tg_lang, lang, can_message, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
  ON CONFLICT (id) DO UPDATE SET
    can_message = 1, blocked = 0, first_name = excluded.first_name, username = excluded.username,
    tg_lang = excluded.tg_lang, updated_at = excluded.updated_at
  WHERE users.can_message = 0 OR users.blocked = 1 OR users.first_name IS NOT excluded.first_name
     OR users.username IS NOT excluded.username OR users.tg_lang IS NOT excluded.tg_lang`;

/** A user wrote to the bot (or unblocked it): remember them and that they can be messaged. */
export function chatUserStatement(db: D1Database, from: TgUser, now: number): D1PreparedStatement {
  return db
    .prepare(UPSERT_CHAT_USER)
    .bind(
      from.id,
      (from.first_name ?? '').slice(0, 64),
      from.username ? from.username.slice(0, 32) : null,
      from.language_code ? from.language_code.slice(0, 16) : null,
      pickLang(from.language_code),
      now,
    );
}

/** The user blocked the bot, or Telegram refused a message to them. */
export function blockedStatement(db: D1Database, userId: number, now: number): D1PreparedStatement {
  return db
    .prepare('UPDATE users SET can_message = 0, blocked = 1, updated_at = ?2 WHERE id = ?1 AND (can_message = 1 OR blocked = 0)')
    .bind(userId, now);
}
