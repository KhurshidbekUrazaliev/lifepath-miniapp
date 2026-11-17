// Errors the app reports about itself: one row for each build and message, with a count, so that a
// release which breaks on some phones is noticed. A report has to come from a signed-in app like every
// other call, but nothing of who sent it is kept.
import {
  BUILD_RE, ERROR_KINDS, PLATFORM_RE, SCREEN_RE, byBuild, errorKey, reportMessage, reportStack, type ErrorKind, type ErrorRow,
} from '../../src/lib/errors';
import { DAY_MS, LANGS, type Env } from './env';
import { badRequest, describe, json, readJson } from './http';
import { rows, type Ctx } from './users';
import { match, oneOf } from './validate';

/** A report nobody has sent again for this long is forgotten. */
const KEEP_MS = 30 * DAY_MS;
/** More different errors than this are not kept: a flood from one broken (or dishonest) app cannot fill the table. */
const MAX_ROWS = 2000;
/** How many the owner's panel is sent. */
const LIST = 300;
/** What a field may be before it is tidied. */
const RAW_MESSAGE = 4000;
const RAW_STACK = 16_000;

const text = (v: unknown, name: string, max: number): string => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw badRequest(`${name}: string expected`);
  if (v.length > max) throw badRequest(`${name}: at most ${max} characters expected`);
  return v;
};

// A new message is kept only while there is room; one that is there already is counted again, and
// says where the latest one happened. The stack stays the first one's.
const KEEP = `
  INSERT INTO errors (key, build, kind, message, stack, screen, platform, tg, lang, count, first_at, last_at)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?10
  WHERE (SELECT COUNT(*) FROM errors) < ?11 OR EXISTS (SELECT 1 FROM errors WHERE key = ?1)
  ON CONFLICT (key) DO UPDATE SET
    count = errors.count + 1, last_at = excluded.last_at, kind = excluded.kind, screen = excluded.screen,
    platform = excluded.platform, tg = excluded.tg, lang = excluded.lang`;

/** POST /api/errors { kind, message, stack?, screen?, build, platform?, tg?, lang? } */
export async function postError(c: Ctx): Promise<Response> {
  const body = await readJson(c.request);
  const kind: ErrorKind = oneOf(body.kind, 'kind', ERROR_KINDS);
  const build = match(body.build, 'build', BUILD_RE);
  // Tidied again here, whatever the app did: the server keeps nothing it has not cut itself.
  const message = reportMessage(text(body.message, 'message', RAW_MESSAGE));
  if (!message) throw badRequest('message: text expected');
  const stack = reportStack(text(body.stack, 'stack', RAW_STACK));
  const screen = match(body.screen ?? '', 'screen', SCREEN_RE);
  const platform = match(body.platform ?? '', 'platform', PLATFORM_RE);
  const tg = match(body.tg ?? '', 'tg', PLATFORM_RE);
  const lang = body.lang === undefined || body.lang === null || body.lang === '' ? '' : oneOf(body.lang, 'lang', LANGS);

  await c.env.DB.prepare(KEEP).bind(errorKey(build, message), build, kind, message, stack, screen, platform, tg, lang, c.now, MAX_ROWS).run();
  return json({ ok: true });
}

interface Row {
  key: string;
  build: string;
  kind: ErrorKind;
  message: string;
  stack: string;
  screen: string;
  platform: string;
  tg: string;
  lang: string;
  count: number;
  first_at: number;
  last_at: number;
}

/**
 * GET /api/admin/errors: what went wrong lately, newest build first (a build's name starts with its
 * date), and in a build whatever happened last.
 */
export async function getAdminErrors(c: Ctx): Promise<Response> {
  const found = await c.env.DB.prepare(
    `SELECT key, build, kind, message, stack, screen, platform, tg, lang, count, first_at, last_at
     FROM errors ORDER BY build DESC, last_at DESC, key LIMIT ?1`,
  )
    .bind(LIST)
    .all<Row>();
  const list: (ErrorRow & { build: string })[] = rows<Row>(found).map((r) => ({
    build: r.build,
    key: r.key,
    kind: r.kind,
    message: r.message,
    stack: r.stack,
    screen: r.screen,
    platform: r.platform,
    tg: r.tg,
    lang: r.lang,
    count: r.count,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
  return json({ builds: byBuild(list), now: c.now });
}

/** Daily: forgets errors that have not been seen again for a month. */
export async function cleanErrors(env: Env, now: number): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM errors WHERE last_at < ?1').bind(now - KEEP_MS).run();
  } catch (e) {
    console.error('errors clean-up:', describe(e));
  }
}
