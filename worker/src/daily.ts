// The ayah and the hadith of the day, picked at random from the sources themselves: an ayah from the
// whole Qurʼan through Quran.com, and a short hadith from Sahih al-Bukhari through the open hadith-api
// collection (the one the app's own list came from, numbered as on sunnah.com). Everyone gets the same
// two on the same day. The first person to ask for a day makes them (a few requests, and one AI call
// for the Uzbek hadith, which has no published translation); the rest read them from the table.
// When a source is down nothing is kept, and the app shows its own lists until a later try works.
import type { Env } from './env';
import { DAY_MS } from './env';
import { badRequest, describe, json } from './http';
import type { Ctx } from './users';

const QURAN_API = 'https://api.quran.com/api/v4';
const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1';
/** Quran.com translations: Sahih International, Abu Adel (Russian), Muhammad Sodiq Muhammad Yusuf (Uzbek, Latin). */
const TRANSLATIONS = { en: 20, ru: 79, uz: 55 } as const;
/** Hadith in Sahih al-Bukhari, as numbered on sunnah.com. */
export const BUKHARI_COUNT = 7563;
/** A failed day is tried again after this long, so a source that is down is not asked on every call. */
const RETRY_MS = 15 * 60_000;
/** The model that writes the Uzbek hadith (Cloudflare Workers AI; about 20 of the 10,000 free daily units). */
const MODEL = '@cf/openai/gpt-oss-120b';

export interface DailyAyah {
  k: string; // "2:255"
  ar: string;
  en: string;
  ru: string;
  uz: string;
  page: number;
}

export interface DailyHadith {
  n: number; // Sahih al-Bukhari number
  ar?: string;
  en: string;
  ru: string;
  /** AI translation from the Russian; missing when the AI could not be reached. */
  uz?: string;
}

export interface Daily {
  day: string;
  ayah: DailyAyah | null;
  hadith: DailyHadith | null;
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

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};

/** Uzbek in Cyrillic letters written in Latin ones (the AI now and then answers in Cyrillic). */
export function uzLatin(s: string): string {
  let out = '';
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const low = ch.toLowerCase();
    let lat: string | undefined = CYR[low];
    if (low === 'е') {
      // "ye" at the start of a word and after a vowel, "e" elsewhere.
      const prev = chars[i - 1]?.toLowerCase() ?? ' ';
      lat = /[\s«"(—–-]|^$|[аеёиоуэюяў]/.test(prev) ? 'ye' : 'e';
    }
    if (lat === undefined) {
      out += ch;
      continue;
    }
    if (ch !== low && lat) {
      // A capital: the whole pair in capitals when the next letter is a capital too.
      const next = chars[i + 1] ?? '';
      const nextUpper = next !== '' && next !== next.toLowerCase();
      lat = nextUpper ? lat.toUpperCase() : lat.charAt(0).toUpperCase() + lat.slice(1);
    }
    out += lat;
  }
  return out;
}

const cyrillicShare = (s: string): number => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[Ѐ-ӿ]/.test(c)).length / letters.length : 0;
};

/** "Narrated `Aisha:Allah's…" → "Narrated ʿAisha: Allah's…". */
export const tidyEnglishHadith = (s: string): string =>
  s.replace(/`/g, 'ʿ').replace(/^(Narrated [^:]{1,80}):\s*/, '$1: ').replace(/\s+/g, ' ').trim();

/**
 * Whether a hadith suits a card of the day: the Prophet's ﷺ own words (a quotation in the Russian),
 * short enough to read at a glance, and not a long story or a chain of narrators.
 */
export function suitsTheDay(ru: string, en: string): boolean {
  if (!ru || !en) return false;
  if (ru.length < 60 || ru.length > 700 || en.length > 650) return false;
  return /«[^»]{15,}»/.test(ru);
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

const UZ_RULES = [
  'You translate hadith from Russian into Uzbek.',
  'Write modern literary Uzbek as used in Uzbekistan, in the LATIN script only, never Cyrillic.',
  'Use ʻ (U+02BB) in oʻ and gʻ, and ʼ (U+02BC) for the tutuq belgisi.',
  'Write the formulas as Uzbek Muslims do: "Rasululloh sollallohu alayhi va sallam" for «Посланник Аллаха ﷺ»,',
  '"Paygʻambar sollallohu alayhi va sallam" for «Пророк ﷺ», "roziyallohu anhu" / "roziyallohu anho" after a companion,',
  'and begin as "…dan rivoyat qilinadi:". Use respectful plural verbs for the Prophet (dedilar, aytdilar).',
  'Keep the quotation in « ». Translate faithfully: add nothing, explain nothing, leave nothing out.',
  'Reply with the translation only.',
].join(' ');

/** The Uzbek of a hadith, by the AI, in Latin letters; undefined when the AI is off or fails. */
export async function uzbekHadith(env: Env, ru: string): Promise<string | undefined> {
  if (!env.AI || env.DAILY_AI === '0') return undefined;
  for (let i = 0; i < 2; i++) {
    try {
      const out: any = await env.AI.run(MODEL as any, {
        messages: [
          { role: 'system', content: UZ_RULES },
          { role: 'user', content: ru },
        ],
        max_tokens: 3000,
        reasoning_effort: 'low',
      } as any);
      const text: string = (out?.choices?.[0]?.message?.content ?? out?.response ?? '').trim();
      if (!text) continue;
      // Mostly Cyrillic: ask once more; a little: write those words in Latin letters.
      if (cyrillicShare(text) > 0.3 && i === 0) continue;
      return uzMarks(uzLatin(text));
    } catch (e) {
      console.error('daily: uzbek', describe(e));
    }
  }
  return undefined;
}

/** A random short hadith of the Prophet's ﷺ words from Sahih al-Bukhari, with its Uzbek. */
export async function pickHadith(env: Env, base = HADITH_API, roll: () => number = Math.random): Promise<DailyHadith | null> {
  for (let i = 0; i < 6; i++) {
    const n = 1 + Math.floor(roll() * BUKHARI_COUNT);
    const ruData = await getJson(`${base}/editions/rus-bukhari/${n}.json`);
    const ru = String(ruData?.hadiths?.[0]?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!/«[^»]{15,}»/.test(ru) || ru.length > 700 || ru.length < 60) continue;
    const enData = await getJson(`${base}/editions/eng-bukhari/${n}.json`);
    const en = tidyEnglishHadith(String(enData?.hadiths?.[0]?.text ?? ''));
    if (!suitsTheDay(ru, en)) continue;
    const arData = await getJson(`${base}/editions/ara-bukhari/${n}.json`);
    const ar = String(arData?.hadiths?.[0]?.text ?? '').trim() || undefined;
    const uz = await uzbekHadith(env, ru);
    return { n, en, ru, ar, ...(uz ? { uz } : {}) };
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

const view = (r: Row | null, day: string): Daily => ({ day, ayah: parse<DailyAyah>(r?.ayah ?? null), hadith: parse<DailyHadith>(r?.hadith ?? null) });

/**
 * The day's two, made by the first caller of that day. Whoever finds no row claims it with an insert;
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

  const had = view(row, day);
  let ayah = had.ayah;
  let hadith = had.hadith;
  try {
    ayah ??= await pickAyah(env.QURAN_API || QURAN_API);
  } catch (e) {
    console.error('daily: ayah', describe(e));
  }
  try {
    if (!hadith) hadith = await pickHadith(env, env.HADITH_API || HADITH_API);
    else if (!hadith.uz) {
      // A hadith kept without its Uzbek (the AI was down) gets it on a later try.
      const uz = await uzbekHadith(env, hadith.ru);
      if (uz) hadith = { ...hadith, uz };
    }
  } catch (e) {
    console.error('daily: hadith', describe(e));
  }
  const ai = !!env.AI && env.DAILY_AI !== '0';
  const done = ayah && hadith && (hadith.uz || !ai) ? 1 : 0;
  await env.DB.prepare('UPDATE daily SET ayah = ?, hadith = ?, made_at = ?, done = ? WHERE day = ?')
    .bind(ayah ? JSON.stringify(ayah) : null, hadith ? JSON.stringify(hadith) : null, now, done, day)
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
