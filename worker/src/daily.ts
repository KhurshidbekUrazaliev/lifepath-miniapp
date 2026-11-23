// The ayah of the day, picked at random from the whole Qurʼan through Quran.com: everyone gets the
// same one on the same day. The first person to ask for a day makes it; the rest read it from the
// table. When the source is down nothing is kept, and the app shows its own list until a later try
// works. (The hadith of the day is the app's own list: src/content/hadith.ts.)
import type { Env } from './env';
import { DAY_MS } from './env';
import { badRequest, describe, json } from './http';
import type { Ctx } from './users';

const QURAN_API = 'https://api.quran.com/api/v4';
/** Quran.com translations: Sahih International, Abu Adel (Russian), Muhammad Sodiq Muhammad Yusuf (Uzbek, Latin). */
const TRANSLATIONS = { en: 20, ru: 79, uz: 55 } as const;
/** A failed day is tried again after this long, so a source that is down is not asked on every call. */
const RETRY_MS = 15 * 60_000;
export interface DailyAyah {
  k: string; // "2:255"
  ar: string;
  en: string;
  ru: string;
  uz: string;
  page: number;
}

export interface Daily {
  day: string;
  ayah: DailyAyah | null;
}

// ---------- tidying the texts (pure, tested in worker/test/daily.test.ts) ----------

/** Quran.com's footnote marks and any other tags out, spaces tidied. */
export const stripTags = (s: string): string =>
  s.replace(/<sup[^>]*>.*?<\/sup>/gs, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Uzbek apostrophes as the app writes them: ʻ after o and g, ʼ elsewhere (the sources use ` and '). */
export function uzMarks(s: string): string {
  return s
    .replace(/([oOgG])[`'‘’ʻʼ]/g, '$1ʻ')
    .replace(/(\p{L})[`'’ʼ](?=\p{L})/gu, '$1ʼ')
    .replace(/`/g, 'ʼ');
}

// ---------- the sources ----------

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 3600 } } as RequestInit);
  if (!res.ok) return null;
  return res.json();
}

/** A random ayah short enough for the card, in Arabic and the three translations. Tries a few times. */
export async function pickAyah(base = QURAN_API): Promise<DailyAyah | null> {
  const ids = Object.values(TRANSLATIONS).join(',');
  for (let i = 0; i < 4; i++) {
    const data = await getJson(`${base}/verses/random?translations=${ids}&fields=text_uthmani,page_number`);
    const v = data?.verse;
    if (!v?.verse_key || !v.text_uthmani) continue;
    const of = (id: number) => stripTags(v.translations?.find((x: any) => x.resource_id === id)?.text ?? '');
    const ayah: DailyAyah = {
      k: String(v.verse_key),
      ar: String(v.text_uthmani).trim(),
      en: of(TRANSLATIONS.en),
      ru: of(TRANSLATIONS.ru),
      uz: uzMarks(of(TRANSLATIONS.uz)),
      page: Number(v.page_number) || 0,
    };
    if (!ayah.en || !ayah.ru || !ayah.uz) continue;
    // A very long ayah (the one on debts fills a page) does not fit the card: pick again.
    if (ayah.en.length > 480 || ayah.ar.length > 480) continue;
    return ayah;
  }
  return null;
}

// ---------- the day ----------

/** "YYYY-MM-DD" of a moment in UTC. */
const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The days anyone can be in right now, somewhere on Earth: yesterday, today and tomorrow in UTC. */
export function daysNow(now: number): string[] {
  return [utcDay(now - DAY_MS), utcDay(now), utcDay(now + DAY_MS)];
}

interface Row {
  day: string;
  ayah: string | null;
  hadith: string | null;
  made_at: number;
  done: number;
}

const parse = <T>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

const view = (r: Row | null, day: string): Daily => ({ day, ayah: parse<DailyAyah>(r?.ayah ?? null) });

/**
 * The day's ayah, made by the first caller of that day. Whoever finds no row claims it with an insert;
 * a row that failed is claimed again after RETRY_MS. A caller that does not hold the claim gets what
 * is there, perhaps nothing yet, and the app keeps its own until it asks again.
 */
export async function dailyFor(env: Env, day: string, now: number): Promise<Daily> {
  const get = () => env.DB.prepare('SELECT day, ayah, hadith, made_at, done FROM daily WHERE day = ?').bind(day).first<Row>();
  let row = await get();
  if (row && (row.done || now - row.made_at < RETRY_MS)) return view(row, day);

  const claim = row
    ? await env.DB.prepare('UPDATE daily SET made_at = ? WHERE day = ? AND made_at = ?').bind(now, day, row.made_at).run()
    : await env.DB.prepare('INSERT OR IGNORE INTO daily (day, ayah, hadith, made_at, done) VALUES (?, NULL, NULL, ?, 0)').bind(day, now).run();
  if (!claim.meta.changes) return view(await get(), day);

  let ayah = view(row, day).ayah;
  try {
    ayah ??= await pickAyah(env.QURAN_API || QURAN_API);
  } catch (e) {
    console.error('daily: ayah', describe(e));
  }
  // The hadith column is no longer written (the app has its own list), so it stays empty.
  await env.DB.prepare('UPDATE daily SET ayah = ?, made_at = ?, done = ? WHERE day = ?')
    .bind(ayah ? JSON.stringify(ayah) : null, now, ayah ? 1 : 0, day)
    .run();
  row = await get();
  return view(row, day);
}

/** GET /api/daily?day=YYYY-MM-DD — the asker's own date, which must be a day somewhere on Earth now. */
export async function getDaily(c: Ctx): Promise<Response> {
  const day = c.url.searchParams.get('day') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !daysNow(c.now).includes(day)) throw badRequest('day');
  return json(await dailyFor(c.env, day, c.now));
}
