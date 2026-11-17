// This week, for the screens and for the bot's letter, and the one thing about it that only this phone
// remembers. Qurʼan pages and focus minutes are saved as all-time totals, so the phone keeps a mark of
// where they stood when the week began (the rules are in lib/week.ts). The mark is not part of the
// account: like the focus timer's clock it stays on the phone, and another device keeps its own.
import { useMemo } from 'react';
import { snapshot, useData, useStore } from './store';
import { tgUser } from '../tg/telegram';
import type { Data } from '../lib/stats';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { LetterWords, Week, WeekMark, letterWords, markWeek, weekOf, weekStart, weekTotals } from '../lib/week';
import { Key, locale, t, tn } from '../i18n';
import { fmtShortDate } from '../i18n/format';

const KEY = `lp:${tgUser.id}:week`;

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function saved(): WeekMark | null {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? 'null') as WeekMark | null;
    const whole = !!m && typeof m.week === 'string' && isCount(m.quran) && isCount(m.focus) && !!m.seen && isCount(m.seen.quran) && isCount(m.seen.focus);
    return whole ? m : null;
  } catch {
    return null;
  }
}

function save(m: WeekMark): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // the mark then lasts until the app is closed
  }
}

let mark: WeekMark | null = saved();

/** Looks at the totals and moves the mark along. */
function look(): void {
  const s = useStore.getState();
  // Not before the app is set up: the saved copy is still loading, or the example data is about to be.
  if (!s.settings.onboarded) return;
  const now = weekTotals(s.profile);
  const next = markWeek(mark, now, weekStart(dayKey()));
  const same = !!mark && mark.week === next.week && mark.quran === next.quran && mark.focus === next.focus && mark.seen.quran === now.quran && mark.seen.focus === now.focus;
  if (same) return;
  mark = next;
  save(next);
}

useStore.subscribe(look);

/** The phone's mark for the week that is running. */
export function weekMark(): WeekMark | null {
  look(); // a new week may have begun while the app sat open
  return mark;
}

/** After the data was replaced as a whole (a restore, the examples): this week's counting starts from what is there now. */
export function restartWeek(): void {
  mark = null;
  look();
}

/** The week that is running. */
export const weekNow = (d: Data = snapshot()): Week => weekOf(d, dayKey(), weekMark());

export function useWeek(): Week {
  const d = useData();
  const today = dayKey();
  return useMemo(() => weekOf(d, today, weekMark()), [d, today]);
}

/** The words of the bot's letter in the app's language. */
export const weekWords = (): LetterWords => letterWords((key, vars) => t(key as Key, vars), tn);

/** A week's dates, short: "Nov 16 – 22". */
export function weekRange(w: Pick<Week, 'start' | 'end'>): string {
  const from = dayKeyToMs(w.start, 12);
  const to = dayKeyToMs(w.end, 12);
  try {
    return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' }).formatRange(from, to);
  } catch {
    return `${fmtShortDate(from)} – ${fmtShortDate(to)}`;
  }
}
