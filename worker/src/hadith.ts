// The companion's Hadis button: a random short saying of the Prophet ﷺ from six books, through the open
// hadith-api collection (fawazahmed0, on jsDelivr). Sahih al-Bukhari and Sahih Muslim whole; from Abu
// Dawud, at-Tirmidhi, an-Nasaʼi and Ibn Majah only what al-Albani graded "Sahih" (hadithPool.ts).
//
// The collection has no Uzbek, and no Russian for at-Tirmidhi, an-Nasaʼi and Ibn Majah: those are
// written by the AI and marked so in the app. Every hadith looked at is kept in hadith_cache, so each
// is fetched and translated once; a daily cap keeps the AI inside the free allowance, and past it the
// button picks among the ones already kept.
import type { Env } from './env';
import { DAY_MS } from './env';
import { MODEL, getJson, pickDay, tidyEnglishHadith, uzLatin, uzMarks } from './daily';
import { badRequest, describe, json, readJson } from './http';
import { POOL_RANGES } from './hadithPool';
import type { Ctx } from './users';

const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1';
export type Book = keyof typeof POOL_RANGES;
/** Books whose Russian is in the collection; the others get theirs from the AI. */
const HAS_RUSSIAN: ReadonlySet<Book> = new Set(['bukhari', 'muslim', 'abudawud']);
/** New hadith translated per day at most (one AI call each, roughly 30–60 of the 10,000 free daily units). */
const NEW_PER_DAY = 80;
/** Hadith fetched from the collection per request at most, before falling back to kept ones. */
const FETCHES_PER_CALL = 12;
const PICKS_PER_CALL = 24;

export interface PoolHadith {
  book: Book;
  n: number;
  /** Sahih Muslim: its book and hadith, which sunnah.com links by (its own numbers differ). */
  ref?: [number, number];
  en: string;
  ru: string;
  uz: string;
  /** The Russian is the AI's (the collection has none for the book). */
  ruAi?: boolean;
}

// ---------- the pool ----------

let pool: { book: Book; nums: number[] }[] | null = null;
let poolSize = 0;

function loadPool(): void {
  if (pool) return;
  pool = (Object.keys(POOL_RANGES) as Book[]).map((book) => {
    const nums: number[] = [];
    for (const part of POOL_RANGES[book].split(',')) {
      const [a, b] = part.split('-').map(Number);
      for (let n = a!; n <= (b ?? a!); n++) nums.push(n);
    }
    return { book, nums };
  });
  poolSize = pool.reduce((s, p) => s + p.nums.length, 0);
}

/** A hadith from the whole pool, every one as likely as any other. */
export function randomPick(roll: () => number = Math.random): { book: Book; n: number } {
  loadPool();
  let i = Math.floor(roll() * poolSize);
  for (const p of pool!) {
    if (i < p.nums.length) return { book: p.book, n: p.nums[i]! };
    i -= p.nums.length;
  }
  const last = pool![pool!.length - 1]!;
  return { book: last.book, n: last.nums[0]! };
}

// ---------- the text ----------

/** The English of the other books, in the shape tidyEnglishHadith expects: "Abu Hurairah narrated that :Allah's…". */
export function tidyEnglish(s: string): string {
  return tidyEnglishHadith(
    s
      .replace(/\(\s*sal Allaahu alayhi wa sallam\s*\)/gi, '(ﷺ)')
      .replace(/\(\s*may peace be upon him\s*\)/gi, '(ﷺ)')
      .replace(/\s+:\s*/, ': ')
      .replace(/:(?=\S)/, ': '),
  );
}

/** "The Prophet (ﷺ) said:", "Allah's Messenger (ﷺ) said,", "the Apostle of Allaah (ﷺ) as saying:", up to his words. */
const SAYS = /(Prophet|Messenger|Apostle)( of Allaa?h)?\s*(\(ﷺ\))?\s*(said|says|saying|used to say)\s*[,:]?\s*["“']?(?=[A-Z(])/;

/**
 * The Prophet's ﷺ own words in a hadith, when it suits the companion's speech bubble: short, told
 * straight after who narrated it (not a story), and nobody else speaking after him. Null otherwise.
 */
export function prophetsWords(en: string): string | null {
  if (en.length < 50 || en.length > 480) return null;
  const m = SAYS.exec(en);
  if (!m) return null;
  // Before his words only who told it: "Narrated Anas: The", "It was narrated from Jabir that the".
  // Not "One day the Prophet…" (a story) or "…that the Companions of the Messenger of Allah said" (not him).
  const before = en.slice(0, m.index);
  if (before.length > 120 || /[.!?;]\s|["“”]/.test(before)) return null;
  if (before && !/(:|\bthat|\breported|\bnarrated)\s*(the|Allah's)?\s*$/i.test(before)) return null;
  const after = en.slice(m.index + m[0].length);
  if (/\b(said|asked|replied|added|narrated)\b/i.test(after)) return null;
  // Up to the closing quotation mark, when there is one; the collection often leaves it out.
  const close = after.search(/["”]/);
  const words = (close >= 0 ? after.slice(0, close) : after).replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  // Short: fits the bubble, and a short saying is translated with fewer mistakes.
  if (words.length < 25 || words.length > 260) return null;
  return /[.!?…]$/.test(words) ? words : `${words}.`;
}

/** The first quotation in a Russian hadith, nested ones included: «… «…» …». */
export function russianWords(ru: string): string | null {
  const open = ru.indexOf('«');
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < ru.length; i++) {
    if (ru[i] === '«') depth++;
    else if (ru[i] === '»' && --depth === 0) {
      const words = ru.slice(open + 1, i).replace(/\s+/g, ' ').trim();
      return words.length >= 15 ? words : null;
    }
  }
  return null;
}

/** Checked translations from the app's own list (src/content/hadith.ts), so the AI writes like them. */
const EXAMPLES: [string, string][] = [
  ['The most beloved deed to Allah is the most regular and constant, even if it were little.', 'Allohga eng sevimli amal — oz boʻlsa ham, eng doimiy qilinadiganidir.'],
  ['None of you will have faith till he wishes for his brother what he likes for himself.', 'Sizlardan birortangiz oʻzi uchun yaxshi koʻrgan narsani birodari uchun ham yaxshi koʻrmaguncha (komil) moʻmin boʻlmaydi.'],
  ['Whoever believes in Allah and the Last Day should not harm his neighbor, should honor his guest, and should speak good or keep silent.', 'Kim Allohga va oxirat kuniga iymon keltirsa, qoʻshnisiga ozor bermasin, mehmonini hurmat qilsin va yaxshi gap gapirsin yoki jim tursin.'],
  ['Whoever fasts during Ramadan out of sincere faith and hoping for Allah’s reward will have all his past sins forgiven.', 'Kim Ramazon roʻzasini iymon bilan va savobini Allohdan umid qilib tutsa, oʻtgan gunohlari kechiriladi.'],
  ['Make things easy for people and do not make them hard; give them good tidings and do not drive them away.', 'Osonlashtiringlar, qiyinlashtirmanglar; xushxabar beringlar, nafratlantirmanglar.'],
];

const RULES = [
  'You translate the words of the Prophet Muhammad ﷺ from a hadith. You are given his words in English,',
  'and sometimes in Russian as well (a published translation: follow its meaning where it is given).',
  'Translate faithfully and precisely: add nothing, explain nothing, leave nothing out, keep every condition, exception and number,',
  'and keep who is told to do what (an exception stays an exception, a command stays a command).',
  'Keep Islamic terms as Muslims say them (wudu → tahorat / омовение, salah → namoz / молитва, junub → junub / джунуб).',
  'Uzbek: modern literary Uzbek as used in Uzbekistan, LATIN script only, with ʻ (U+02BB) in oʻ and gʻ and ʼ (U+02BC) for the tutuq belgisi.',
  'Russian: as Russian Muslim translations write.',
  'Reply with JSON only: {"uz": "...", "ru": "..."}. Include "ru" only when no Russian was given.',
  'Examples of the Uzbek wanted (checked by hand):',
  ...EXAMPLES.map(([en, uz]) => `"${en}" → "${uz}"`),
].join(' ');

async function translate(env: Env, en: string, ru: string | null): Promise<{ uz: string; ru?: string } | null> {
  if (!env.AI || env.DAILY_AI === '0') return null;
  const user = ru ? `English: ${en}\nRussian: ${ru}` : `English: ${en}`;
  for (let i = 0; i < 2; i++) {
    try {
      const out: any = await env.AI.run(MODEL as any, {
        messages: [
          { role: 'system', content: RULES },
          { role: 'user', content: user },
        ],
        max_tokens: 3000,
        reasoning_effort: 'medium',
      } as any);
      const text: string = (out?.choices?.[0]?.message?.content ?? out?.response ?? '').trim();
      const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      const uz = typeof j.uz === 'string' ? cap(uzMarks(uzLatin(j.uz.trim().replace(/^«|»$/g, '')))) : '';
      const ruOut = typeof j.ru === 'string' ? cap(j.ru.trim().replace(/^«|»$/g, '')) : '';
      if (!uz || (!ru && !/[Ѐ-ӿ]/.test(ruOut))) continue;
      return { uz, ...(ru ? {} : { ru: ruOut }) };
    } catch (e) {
      console.error('hadith: translate', describe(e));
    }
  }
  return null;
}

type Fetched = { status: 'ok'; hadith: PoolHadith } | { status: 'unsuitable' } | { status: 'failed' };

/**
 * Fetches one hadith and, when it suits the button, keeps the Prophet's ﷺ words alone in the three
 * languages (as the app's own list does; the source links to the whole hadith).
 */
/** A hadith before translation: the Prophet's ﷺ words in English, and in Russian when published. */
export interface Candidate {
  book: Book;
  n: number;
  ref?: [number, number];
  en: string;
  ru: string | null;
}

type Looked = { status: 'ok'; candidate: Candidate } | { status: 'unsuitable' } | { status: 'failed' };

/** Fetches one hadith and keeps the Prophet's ﷺ words, when it suits the button (no AI yet). */
export async function lookAt(book: Book, n: number, base = HADITH_API): Promise<Looked> {
  const enData = await getJson(`${base}/editions/eng-${book}/${n}.min.json`);
  if (!enData) return { status: 'failed' };
  const h = enData.hadiths?.[0];
  const en = prophetsWords(tidyEnglish(String(h?.text ?? '')));
  if (!en) return { status: 'unsuitable' };
  let ru: string | null = null;
  if (HAS_RUSSIAN.has(book)) {
    const ruData = await getJson(`${base}/editions/rus-${book}/${n}.min.json`);
    const full = String(ruData?.hadiths?.[0]?.text ?? '');
    // A published Russian whose quotation is about as long as the English one is his words; otherwise
    // it is shaped differently and the AI writes the Russian too.
    const q = russianWords(full);
    if (q && q.length > en.length * 0.6 && q.length < en.length * 2) ru = q;
  }
  const ref = h?.reference;
  return {
    status: 'ok',
    candidate: { book, n, ...(book === 'muslim' && ref ? { ref: [Number(ref.book) || 0, Number(ref.hadith) || 0] as [number, number] } : {}), en, ru },
  };
}

/** Writes the missing languages of a candidate. Null when the AI could not. */
export async function finish(env: Env, c: Candidate): Promise<PoolHadith | null> {
  const done = await translate(env, c.en, c.ru);
  if (!done) return null;
  return {
    book: c.book,
    n: c.n,
    ...(c.ref ? { ref: c.ref } : {}),
    en: c.en,
    ru: c.ru ?? done.ru!,
    uz: done.uz,
    ...(c.ru ? {} : { ruAi: true }),
  };
}

/**
 * Fetches one hadith and, when it suits the button, keeps the Prophet's ﷺ words alone in the three
 * languages (as the app's own list does; the source links to the whole hadith).
 */
export async function fetchHadith(env: Env, book: Book, n: number, base = HADITH_API): Promise<Fetched> {
  const looked = await lookAt(book, n, base);
  if (looked.status !== 'ok') return looked;
  const hadith = await finish(env, looked.candidate);
  return hadith ? { status: 'ok', hadith } : { status: 'failed' };
}

// ---------- the route ----------

/** Kept hadith past which the button answers from them at once and makes new ones in the background. */
const ENOUGH_KEPT = 30;

/**
 * Looks at random hadith until one suits the button and is made (fetched and translated), and keeps
 * every one it looked at. Null when none was made this time (the daily cap, or a source is down).
 */
async function makeOne(env: Env, now: number, roll: () => number): Promise<PoolHadith | null> {
  const db = env.DB;
  const base = env.HADITH_API || HADITH_API;
  const made = await db
    .prepare('SELECT COUNT(*) AS n FROM hadith_cache WHERE made_at > ?1 AND data IS NOT NULL')
    .bind(now - DAY_MS)
    .first<{ n: number }>();
  if ((made?.n ?? 0) >= NEW_PER_DAY) return null;
  let fetches = 0;
  for (let i = 0; i < PICKS_PER_CALL && fetches < FETCHES_PER_CALL; i++) {
    const { book, n } = randomPick(roll);
    const id = `${book}:${n}`;
    const row = await db.prepare('SELECT data FROM hadith_cache WHERE id = ?1').bind(id).first<{ data: string | null }>();
    if (row) continue; // looked at before
    fetches++;
    let got: Fetched;
    try {
      got = await fetchHadith(env, book, n, base);
    } catch (e) {
      console.error('hadith: fetch', describe(e));
      got = { status: 'failed' };
    }
    if (got.status === 'unsuitable') {
      await db.prepare('INSERT OR IGNORE INTO hadith_cache (id, data, made_at) VALUES (?1, NULL, ?2)').bind(id, now).run();
    } else if (got.status === 'ok') {
      await db.prepare('INSERT OR REPLACE INTO hadith_cache (id, data, made_at) VALUES (?1, ?2, ?3)').bind(id, JSON.stringify(got.hadith), now).run();
      return got.hadith;
    } else {
      return null; // the source or the AI is down: try another time
    }
  }
  return null;
}

/**
 * A random hadith for the Hadis button, or null when none can be had right now. While few are kept
 * the caller waits for a new one; after that it gets a kept one at once, and a new one is made in
 * the background (`wait`), so the choice keeps growing without anyone waiting for the AI. In Uzbek
 * only the ones the owner approved (the AI's Uzbek is checked by hand first).
 */
export async function randomHadith(env: Env, now: number, lang: string, roll: () => number = Math.random, wait?: (work: Promise<unknown>) => void): Promise<PoolHadith | null> {
  const db = env.DB;
  const uz = lang === 'uz';
  const pickKept = async () => {
    const row = await db
      .prepare(`SELECT data FROM hadith_cache WHERE data IS NOT NULL${uz ? ' AND uz_ok = 1' : ''} ORDER BY RANDOM() LIMIT 1`)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as PoolHadith) : null;
  };
  const grow = () => wait?.(makeOne(env, now, roll).catch((e) => console.error('hadith: background', describe(e))));
  if (uz) {
    grow();
    return pickKept();
  }
  const kept = await db.prepare('SELECT COUNT(*) AS n FROM hadith_cache WHERE data IS NOT NULL').first<{ n: number }>();
  if ((kept?.n ?? 0) >= ENOUGH_KEPT && wait) {
    grow();
    return pickKept();
  }
  return (await makeOne(env, now, roll)) ?? (await pickKept());
}

/** The cron: one more kept hadith (up to the daily cap), so the choice grows without anyone waiting. */
export async function growHadith(env: Env, now: number): Promise<void> {
  try {
    await makeOne(env, now, Math.random);
  } catch (e) {
    console.error('hadith: grow', describe(e));
  }
}

/** GET /api/hadith?lang=: { hadith } or { hadith: null } (the app then uses its own list). */
export async function getHadith(c: Ctx): Promise<Response> {
  return json({ hadith: await randomHadith(c.env, c.now, c.url.searchParams.get('lang') ?? 'en', Math.random, c.wait) });
}

// ---------- checking the Uzbek (the owners, in the admin screen) ----------

const ID_RE = /^(bukhari|muslim|abudawud|tirmidhi|nasai|ibnmajah):\d{1,5}$/;

/** GET /api/admin/hadith: the oldest ones waiting for their Uzbek to be checked, and how many there are. */
export async function getAdminHadith(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const [waiting, counts] = await db.batch([
    db.prepare('SELECT id, data FROM hadith_cache WHERE data IS NOT NULL AND uz_ok = 0 ORDER BY made_at LIMIT 10'),
    db.prepare(
      `SELECT SUM(uz_ok = 0) AS waiting, SUM(uz_ok = 1) AS approved, COUNT(*) AS kept
         FROM hadith_cache WHERE data IS NOT NULL`,
    ),
  ]);
  const list = ((waiting?.results ?? []) as { id: string; data: string }[]).map((r) => ({ id: r.id, ...(JSON.parse(r.data) as PoolHadith) }));
  const n = ((counts?.results ?? [])[0] ?? {}) as { waiting: number | null; approved: number | null; kept: number };
  // The date a choice made now is for, and what is chosen for it.
  const day = pickDay(c.now);
  const chosen = await db.prepare('SELECT id FROM daily_pick WHERE day = ?1').bind(day).first<{ id: string }>();
  return json({ list, waiting: n.waiting ?? 0, approved: n.approved ?? 0, kept: n.kept ?? 0, daily: { day, id: chosen?.id ?? null } });
}

/** PUT /api/admin/hadith { id, ok, uz? }: approves the Uzbek (as corrected) or keeps the hadith from Uzbek users. */
export async function putAdminHadith(c: Ctx): Promise<Response> {
  const body = (await readJson(c.request)) as any;
  const id = String(body?.id ?? '');
  if (!ID_RE.test(id) || typeof body?.ok !== 'boolean') throw badRequest('hadith');
  const db = c.env.DB;
  const row = await db.prepare('SELECT data FROM hadith_cache WHERE id = ?1 AND data IS NOT NULL').bind(id).first<{ data: string }>();
  if (!row) throw badRequest('hadith');
  if (!body.ok) {
    await db.prepare('UPDATE hadith_cache SET uz_ok = -1 WHERE id = ?1').bind(id).run();
    return json({ ok: true });
  }
  const uz = typeof body.uz === 'string' ? body.uz.replace(/\s+/g, ' ').trim() : '';
  if (uz.length < 10 || uz.length > 1200) throw badRequest('uz');
  const data = { ...(JSON.parse(row.data) as PoolHadith), uz: uzMarks(uz) };
  await db.prepare('UPDATE hadith_cache SET data = ?2, uz_ok = 1 WHERE id = ?1').bind(id, JSON.stringify(data)).run();
  if (body.daily === true) {
    // The hadith of the day: today's until 12:00 in Busan, tomorrow's after.
    const day = pickDay(c.now);
    await db
      .prepare('INSERT OR REPLACE INTO daily_pick (day, id, data, chosen_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(day, id, JSON.stringify(data), c.now)
      .run();
    return json({ ok: true, daily: { day, id } });
  }
  return json({ ok: true });
}

/**
 * POST /api/admin/hadith/shuffle: a random hadith that suits the button and is not kept yet, in English
 * (and Russian when published), for the owner to choose. Quick: no AI until one is chosen.
 */
export async function postAdminShuffle(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const base = c.env.HADITH_API || HADITH_API;
  for (let i = 0, fetched = 0; i < 60 && fetched < 25; i++) {
    const { book, n } = randomPick();
    const id = `${book}:${n}`;
    if (await db.prepare('SELECT 1 FROM hadith_cache WHERE id = ?1').bind(id).first()) continue;
    fetched++;
    const looked = await lookAt(book, n, base);
    if (looked.status === 'unsuitable') {
      await db.prepare('INSERT OR IGNORE INTO hadith_cache (id, data, made_at) VALUES (?1, NULL, ?2)').bind(id, c.now).run();
    } else if (looked.status === 'ok') {
      return json({ candidate: { id, ...looked.candidate } });
    }
  }
  return json({ candidate: null });
}

/** POST /api/admin/hadith/pick { id }: translates the chosen one and puts it first in the queue to check. */
export async function postAdminPick(c: Ctx): Promise<Response> {
  const body = (await readJson(c.request)) as any;
  const id = String(body?.id ?? '');
  if (!ID_RE.test(id)) throw badRequest('hadith');
  const [book, num] = id.split(':') as [Book, string];
  if (!inPool(book, Number(num))) throw badRequest('hadith'); // only sahih ones
  // One kept already (approved, perhaps corrected) comes back to the list as it is, not translated again.
  const kept = await c.env.DB.prepare('SELECT data FROM hadith_cache WHERE id = ?1 AND data IS NOT NULL').bind(id).first<{ data: string }>();
  if (kept) {
    await c.env.DB.prepare('UPDATE hadith_cache SET made_at = 0, uz_ok = 0 WHERE id = ?1').bind(id).run();
    return json({ hadith: { id, ...(JSON.parse(kept.data) as PoolHadith) } });
  }
  const looked = await lookAt(book, Number(num), c.env.HADITH_API || HADITH_API);
  if (looked.status !== 'ok') throw badRequest('hadith');
  const hadith = await finish(c.env, looked.candidate);
  if (!hadith) return json({ hadith: null });
  // made_at 0: the oldest, so it is the first one the queue shows.
  await c.env.DB.prepare('INSERT OR REPLACE INTO hadith_cache (id, data, made_at, uz_ok) VALUES (?1, ?2, 0, 0)').bind(id, JSON.stringify(hadith)).run();
  return json({ hadith: { id, ...hadith } });
}

/** Whether a hadith is in the pool (Bukhari and Muslim whole; the four Sunan: al-Albani's Sahih). */
export function inPool(book: Book, n: number): boolean {
  loadPool();
  return pool!.find((p) => p.book === book)!.nums.includes(n);
}

/**
 * POST /api/admin/hadith/find { book, n }: one hadith by its number, for the owner to look at. It can
 * be chosen when it is sahih and short enough for the button; otherwise the answer says why not.
 */
export async function postAdminFind(c: Ctx): Promise<Response> {
  const body = (await readJson(c.request)) as any;
  const book = String(body?.book ?? '') as Book;
  const n = Number(body?.n);
  if (!(book in POOL_RANGES) || !Number.isInteger(n) || n < 1 || n > 99999) throw badRequest('hadith');
  const base = c.env.HADITH_API || HADITH_API;
  const enData = await getJson(`${base}/editions/eng-${book}/${n}.min.json`);
  const text = tidyEnglish(String(enData?.hadiths?.[0]?.text ?? ''));
  if (!text) return json({ found: false });
  const sahih = inPool(book, n);
  const looked = sahih ? await lookAt(book, n, base) : null;
  return json({
    found: true,
    id: `${book}:${n}`,
    text,
    sahih,
    ...(looked?.status === 'ok' ? { candidate: { id: `${book}:${n}`, ...looked.candidate } } : {}),
  });
}
