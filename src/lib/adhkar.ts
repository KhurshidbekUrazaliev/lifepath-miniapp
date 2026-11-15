// Morning and evening adhkar: which session it is, the wording for it, where each one is narrated,
// and the counts said so far today (kept on this device; finishing a session ticks it in the tracker).
// The texts themselves (content/adhkar.ts) load with the adhkar screen, so nothing here imports them.
import type { Dhikr, DhikrText, Session } from '../content/adhkar';
import type { Lang } from '../i18n';
import { dayKey } from './dates';

export type { Dhikr, Session };

/** How many adhkar each session has; a test keeps these in step with content/adhkar.ts. */
export const SESSION_SIZE: Record<Session, number> = { am: 23, pm: 20 };

/** The morning adhkar run from Fajr until Dhuhr; the rest of the day is the evening's. */
export function sessionAt(times: { fajr: Date; dhuhr: Date } | null, now: number): Session {
  if (times) return now >= times.fajr.getTime() && now < times.dhuhr.getTime() ? 'am' : 'pm';
  const hour = new Date(now).getHours();
  return hour >= 4 && hour < 12 ? 'am' : 'pm';
}

export const inSession = (d: Dhikr, session: Session): boolean => !d.when || d.when === session;

/** The wording said in this session (a few change "morning" to "evening"). */
export const textOf = (d: Dhikr, session: Session): DhikrText => (session === 'pm' && d.pm ? d.pm : d);

export const BOOKS: Record<string, Record<Lang, string>> = {
  bukhari: { en: 'al-Bukhari', ru: 'аль-Бухари', uz: 'Buxoriy' },
  muslim: { en: 'Muslim', ru: 'Муслим', uz: 'Muslim' },
  abuDawud: { en: 'Abu Dawud', ru: 'Абу Дауд', uz: 'Abu Dovud' },
  tirmidhi: { en: 'at-Tirmidhi', ru: 'ат-Тирмизи', uz: 'Termiziy' },
  nasai: { en: "an-Nasa'i", ru: 'ан-Насаи', uz: 'Nasoiy' },
  ibnMajah: { en: 'Ibn Majah', ru: 'Ибн Маджа', uz: 'Ibn Moja' },
  ahmad: { en: 'Ahmad', ru: 'Ахмад', uz: 'Ahmad' },
  hakim: { en: 'al-Hakim', ru: 'аль-Хаким', uz: 'Hokim' },
  ibnSunni: { en: 'Ibn as-Sunni', ru: 'Ибн ас-Сунни', uz: 'Ibn Sunniy' },
  tabarani: { en: 'at-Tabarani', ru: 'ат-Табарани', uz: 'Tabaroniy' },
};

/** "abuDawud:5082,tirmidhi:3575" → "Abu Dawud 5082; at-Tirmidhi 3575". */
export function sourceLabel(src: string, lang: Lang): string {
  return src
    .split(',')
    .map((part) => {
      const [book, n] = part.split(':');
      const name = BOOKS[book]?.[lang] ?? book;
      return n ? `${name} ${n}` : name;
    })
    .join('; ');
}

// ---------- counts said so far ----------

const KEY = 'lp:adhkar';
type Counts = Record<number, number>;
type Part = { counts: Counts; done: number };
type Saved = { day: string; am?: Part; pm?: Part };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (raw && raw.day === dayKey()) return raw;
  } catch {
    // ignore
  }
  return { day: dayKey() };
}

/** Today's counts for a session (empty on a new day). */
export const savedCounts = (session: Session): Counts => load()[session]?.counts ?? {};

/** How many of a session's adhkar were finished today (for Home, without loading the texts). */
export const savedDone = (session: Session): number => load()[session]?.done ?? 0;

export function saveCounts(session: Session, counts: Counts, done: number): void {
  try {
    const saved = load();
    localStorage.setItem(KEY, JSON.stringify({ ...saved, [session]: { counts, done } }));
  } catch {
    // ignore
  }
}

/** How many of a session's adhkar are finished, given the counts and each one's target. */
export function finished(list: Dhikr[], counts: Counts): number {
  return list.filter((d) => (counts[d.id] ?? 0) >= d.count).length;
}
