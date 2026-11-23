// The ayah and the hadith of the day (worker/src/daily.ts): the ayah picked at random from Quran.com,
// the hadith chosen by the owner from the six books; the same two for everyone on a date. Kept on the
// phone for the day. A date with no hadith chosen (by 12:00 in Busan), and the demo, offline and
// signed-out app, show the app's own list in turn.
import { create } from 'zustand';
import type { Ayah, Passage } from '../lib/ayah';
import { dayKey } from '../lib/dates';
import type { Advice, AdviceLang } from '../lib/advisor';
import { HADITH_BOOK, hadithLink } from '../content/hadith';
import { api } from './server';
import { BOOK_NAMES } from './hadith';

export interface DailyHadith {
  /** The book; missing on the earlier ones, all from Sahih al-Bukhari. */
  book?: keyof typeof BOOK_NAMES;
  n: number;
  /** Sahih Muslim: its book and hadith on sunnah.com. */
  ref?: [number, number];
  ar?: string;
  en: string;
  ru: string;
  /** The AI's Uzbek (checked by the owner); missing while the AI could not write it. */
  uz?: string;
  ruAi?: boolean;
}

interface Daily {
  day: string;
  ayah: Ayah | null;
  hadith: DailyHadith | null;
}

const KEY = 'lp:daily';
/** Parts still missing are asked for again after this long. */
const AGAIN_MS = 20 * 60_000;

function stored(): Daily {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Daily | null;
    if (d && typeof d.day === 'string') return { day: d.day, ayah: d.ayah ?? null, hadith: d.hadith ?? null };
  } catch {
    // nothing kept
  }
  return { day: '', ayah: null, hadith: null };
}

export const useDaily = create<Daily>()(() => stored());

let asked = { day: '', at: 0 };

/** Asks the server for today's two, unless they are here already. Quiet when it cannot. */
export async function fetchDaily(lang: AdviceLang): Promise<void> {
  const day = dayKey();
  const have = useDaily.getState();
  const complete = have.day === day && have.ayah && have.hadith && (have.hadith.uz || lang !== 'uz');
  if (complete) return;
  if (asked.day === day && Date.now() - asked.at < AGAIN_MS) return;
  asked = { day, at: Date.now() };
  try {
    const got = await api<Daily>('GET', `/daily?day=${day}`);
    if (got.day !== day) return;
    // A part already here is not lost to an answer that lacks it.
    const next: Daily = {
      day,
      ayah: got.ayah ?? (have.day === day ? have.ayah : null),
      hadith: got.hadith ?? (have.day === day ? have.hadith : null),
    };
    useDaily.setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage full or off: kept for this visit only
    }
  } catch {
    // demo, offline or outside Telegram: the lists stand in
  }
}

/** Today's ayah from the server as a passage of one, or null to use the app's own. */
export function useDailyPassage(): Passage | null {
  const d = useDaily();
  return d.day === dayKey() && d.ayah ? passageOf(d.ayah) : null;
}

export function dailyPassageByKey(key: string): Passage | null {
  const d = useDaily.getState();
  return d.ayah && d.ayah.k === key ? passageOf(d.ayah) : null;
}

function passageOf(a: Ayah): Passage {
  const [surah, n] = a.k.split(':').map(Number);
  return { key: a.k, surah, from: n, to: n, ayat: [a] };
}

/** The words themselves: the quotation inside a hadith, without the narrator's opening. */
export function quotedPart(text: string): string {
  const m = /«(.+)»/s.exec(text) ?? /"(.+)"/s.exec(text) ?? /“(.+)”/s.exec(text);
  const q = m?.[1].trim() ?? '';
  return q.length >= 15 ? q : text;
}

/** Today's hadith from the server as the advice on Home, or null when it has none in this language. */
export function useDailyHadith(lang: AdviceLang): Advice | null {
  const d = useDaily();
  const h = d.day === dayKey() ? d.hadith : null;
  const text = h?.[lang];
  if (!h || !text) return null;
  if (h.book && h.book !== 'bukhari') {
    const muslim = h.book === 'muslim' && h.ref;
    return {
      kind: 'hadith',
      key: `hadith:${h.book}:${h.n}`,
      text: quotedPart(text),
      source: `${BOOK_NAMES[h.book][lang]} ${muslim ? `${h.ref![0]}:${h.ref![1]}` : h.n}`,
      link: muslim ? `https://sunnah.com/muslim/${h.ref![0] || 'introduction'}/${h.ref![1]}` : `https://sunnah.com/${h.book}:${h.n}`,
      ai: lang === 'uz' || (lang === 'ru' && !!h.ruAi),
    };
  }
  return {
    kind: 'hadith',
    key: `hadith:${h.n}`,
    text: quotedPart(text),
    source: `${HADITH_BOOK[lang]} ${h.n}`,
    link: hadithLink(h.n),
    ai: lang === 'uz' || (lang === 'ru' && !!h.ruAi),
  };
}

/** The full texts of the day's hadith, when it is number `n`. */
export function dailyHadithFull(n: number): DailyHadith | null {
  const h = useDaily.getState().hadith;
  return h && h.n === n && (!h.book || h.book === 'bukhari') ? h : null;
}
