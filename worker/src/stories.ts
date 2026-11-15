// Pictures for Telegram Stories. Telegram posts a story from an image at a public address, so the app
// uploads the picture it drew and gets an address back; pictures are deleted after a day.
import { baseUrl, DAY_MS, type Env } from './env';
import { badRequest, json, notFound, readBytes } from './http';
import { loadUser, type Ctx } from './users';

const MAX_BYTES = 1_500_000;
/** Pictures kept per person (older ones are deleted when a new one arrives). */
const KEEP = 5;
const ID_LENGTH = 22;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PATH_RE = new RegExp(`^/s/([A-Za-z0-9]{${ID_LENGTH}})\\.jpg$`);

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** POST /api/story (body: a JPEG): keeps the picture for a day and returns its public address. */
export async function postStory(c: Ctx): Promise<Response> {
  if (!(c.request.headers.get('content-type') ?? '').toLowerCase().startsWith('image/jpeg')) throw badRequest('image/jpeg expected');
  const bytes = await readBytes(c.request, MAX_BYTES);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw badRequest('image/jpeg expected');

  const db = c.env.DB;
  const id = newId();
  const { writes } = await loadUser(c);
  writes.push(
    db.prepare('INSERT INTO stories (id, user_id, image, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, c.auth.id, bytes.buffer, c.now),
    db
      .prepare('DELETE FROM stories WHERE user_id = ?1 AND id NOT IN (SELECT id FROM stories WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)')
      .bind(c.auth.id, KEEP),
  );
  await db.batch(writes);
  const base = baseUrl(c.env.APP_URL) || c.url.origin;
  return json({ url: `${base}/s/${id}.jpg` });
}

/** GET /s/<id>.jpg: a story picture. Public, because Telegram fetches it; the address cannot be guessed. */
export async function serveStory(env: Env, path: string, now: number): Promise<Response> {
  const id = PATH_RE.exec(path)?.[1];
  if (!id) throw notFound();
  const row = await env.DB.prepare('SELECT image, created_at FROM stories WHERE id = ?1')
    .bind(id)
    .first<{ image: ArrayBuffer | number[]; created_at: number }>();
  if (!row || row.created_at < now - 2 * DAY_MS) throw notFound();
  const body = row.image instanceof ArrayBuffer ? new Uint8Array(row.image) : Uint8Array.from(row.image);
  return new Response(body, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' },
  });
}
