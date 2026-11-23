// The companion's Hadis button: a random short hadith from six books, from the server
// (worker/src/hadith.ts). Without the server (no internet, not signed in) the app's own list is used.
import type { Advice, AdviceLang } from '../lib/advisor';
import { api, useServer } from './server';

type Book = 'bukhari' | 'muslim' | 'abudawud' | 'tirmidhi' | 'nasai' | 'ibnmajah';

interface PoolHadith {
  book: Book;
  n: number;
  ref?: [number, number];
  en: string;
  ru: string;
  uz: string;
  ruAi?: boolean;
}

export const BOOK_NAMES: Record<Book, Record<AdviceLang, string>> = {
  bukhari: { en: 'Sahih al-Bukhari', ru: 'Сахих аль-Бухари', uz: 'Sahih al-Buxoriy' },
  muslim: { en: 'Sahih Muslim', ru: 'Сахих Муслим', uz: 'Sahih Muslim' },
  abudawud: { en: 'Sunan Abu Dawud', ru: 'Сунан Абу Дауда', uz: 'Sunani Abu Dovud' },
  tirmidhi: { en: 'Jamiʿ at-Tirmidhi', ru: 'Джами ат-Тирмизи', uz: 'Sunani Termiziy' },
  nasai: { en: 'Sunan an-Nasaʼi', ru: 'Сунан ан-Насаи', uz: 'Sunani Nasoiy' },
  ibnmajah: { en: 'Sunan Ibn Majah', ru: 'Сунан Ибн Маджа', uz: 'Sunani Ibn Moja' },
};

/** sunnah.com: Sahih Muslim by its book and hadith there (its numbers differ from the collection's), the others by number. */
function link(h: PoolHadith): string {
  if (h.book === 'muslim' && h.ref) return `https://sunnah.com/muslim/${h.ref[0] || 'introduction'}/${h.ref[1]}`;
  return `https://sunnah.com/${h.book}:${h.n}`;
}

function source(h: PoolHadith, lang: AdviceLang): string {
  // Sahih Muslim is cited by book and hadith, the way sunnah.com shows the link's page.
  const num = h.book === 'muslim' && h.ref ? `${h.ref[0]}:${h.ref[1]}` : String(h.n);
  return `${BOOK_NAMES[h.book][lang]} ${num}`;
}

/** A new hadith may take the server several seconds (it is translated the first time anyone sees it). */
const TIMEOUT_MS = 25_000;
/** How long a tap waits for one before the app's own list answers instead. */
const TAP_WAIT_MS = 6000;

/** A random hadith in this language, or null (the caller then uses the app's own list). */
async function fetchHadith(lang: AdviceLang): Promise<Advice | null> {
  if (useServer.getState().status !== 'ok') return null;
  try {
    const res = await Promise.race([
      api<{ hadith: PoolHadith | null }>('GET', `/hadith?lang=${lang}`),
      new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS)),
    ]);
    const h = res?.hadith;
    if (!h || !h[lang]) return null;
    return {
      kind: 'hadith',
      key: `hadith:${h.book}:${h.n}`,
      text: h[lang],
      source: source(h, lang),
      link: link(h),
      // Uzbek is always the AI's; Russian for the books the collection has no Russian of.
      ai: lang === 'uz' || (lang === 'ru' && !!h.ruAi),
    };
  } catch {
    return null;
  }
}

/** The next one, fetched while the current one is read, so a tap is answered at once. */
let ahead: { lang: AdviceLang; got: Promise<Advice | null> } | null = null;

function fetchAhead(lang: AdviceLang): void {
  ahead = { lang, got: fetchHadith(lang) };
}

/** Starts fetching one in the background (the companion screen calls this when it opens). */
export function prefetchHadith(lang: AdviceLang): void {
  if (!ahead || ahead.lang !== lang) fetchAhead(lang);
}

/**
 * A random hadith for a tap: the one fetched ahead, or a new one. Null when none comes in time (the
 * caller then uses the app's own list); a late one is kept for the next tap.
 */
export async function randomHadith(lang: AdviceLang): Promise<Advice | null> {
  if (!ahead || ahead.lang !== lang) fetchAhead(lang);
  const mine = ahead!;
  const got = await Promise.race([mine.got, new Promise<'late'>((r) => setTimeout(() => r('late'), TAP_WAIT_MS))]);
  if (got === 'late') return null; // still coming: it answers the next tap
  // This one is used: fetch the next while it is read.
  if (ahead === mine) fetchAhead(lang);
  return got;
}
