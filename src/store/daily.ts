// The ayah of the day as the server picked it at random from Quran.com (worker/src/daily.ts): the
// same for everyone on a date. Kept on the phone for the day; until it comes (in demo, offline,
// outside Telegram) the app shows its own list in turn. The hadith of the day is the app's own
// (content/hadith.ts: hadithOfDay).
import { create } from 'zustand';
import type { Ayah, Passage } from '../lib/ayah';
import { dayKey } from '../lib/dates';
import { api } from './server';

interface Daily {
  day: string;
  ayah: Ayah | null;
}

const KEY = 'lp:daily';
/** Parts still missing are asked for again after this long. */
const AGAIN_MS = 20 * 60_000;

function stored(): Daily {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Daily | null;
    if (d && typeof d.day === 'string') return { day: d.day, ayah: d.ayah ?? null };
  } catch {
    // nothing kept
  }
  return { day: '', ayah: null };
}

export const useDaily = create<Daily>()(() => stored());

let asked = { day: '', at: 0 };

/** Asks the server for today's ayah, unless it is here already. Quiet when it cannot. */
export async function fetchDaily(): Promise<void> {
  const day = dayKey();
  const have = useDaily.getState();
  if (have.day === day && have.ayah) return;
  if (asked.day === day && Date.now() - asked.at < AGAIN_MS) return;
  asked = { day, at: Date.now() };
  try {
    const got = await api<Daily>('GET', `/daily?day=${day}`);
    if (got.day !== day) return;
    // An ayah already here is not lost to an answer that lacks it.
    const next: Daily = { day, ayah: got.ayah ?? (have.day === day ? have.ayah : null) };
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
