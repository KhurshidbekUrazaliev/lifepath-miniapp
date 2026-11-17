// This week in numbers (pure): what the recap, the card on Analytics, the week's story and the bot's
// Sunday letter are all made from. The journal is not read here at all, not even for a count: the
// letter and the story leave the phone, and the journal never does.
import type { Data } from './stats';
import { xpSeries } from './stats';
import type { Profile } from './types';
import { dayKey } from './dates';
import { dayTally, shiftDay } from './habits';
import { prayedOn } from './prayer';
import { visibleStreak } from './gamify';
import { weekStartMs } from './rankings';

/** What a week is counted from. The journal's pages are not among it, on purpose. */
export type WeekData = Pick<Data, 'entries' | 'plans' | 'habits' | 'checks' | 'worship' | 'profile'>;

export const PRAYERS_A_WEEK = 35;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The Monday of a day's week. Weeks run Monday to Sunday, as the rankings count them (weekStartMs). */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const monday = new Date(weekStartMs(Date.UTC(y, m - 1, d)));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** The seven days of a day's week, Monday first. */
export function weekDays(day: string): string[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

// ---------- what the saved data does not remember ----------

/**
 * Qurʼan pages and focus minutes are saved as all-time totals (and for the last day they moved), with
 * no record of each day. To say how much of them belongs to this week, the phone keeps a mark: where
 * the totals stood when the week began (store/week.ts keeps it; the rules are here).
 */
export interface WeekTotals {
  quran: number;
  focus: number;
}

export interface WeekMark extends WeekTotals {
  /** The Monday the mark is for. */
  week: string;
  /** The totals when the app last looked. */
  seen: WeekTotals;
}

export const weekTotals = (p: Profile): WeekTotals => ({ quran: p.quranPages ?? 0, focus: p.focus?.total ?? 0 });

/**
 * The mark after another look at the totals. A new week begins from what was last seen in the one
 * before: nothing is read or timed while the app is closed. A total that is now below its mark means
 * the data was replaced (a reset, a restore), so that count starts again from here.
 */
export function markWeek(prev: WeekMark | null, now: WeekTotals, week: string): WeekMark {
  const seen = { quran: now.quran, focus: now.focus };
  if (!prev) return { week, ...seen, seen };
  const from = prev.week === week ? prev : prev.seen;
  return { week, quran: Math.min(from.quran, now.quran), focus: Math.min(from.focus, now.focus), seen };
}

// ---------- the week ----------

export interface WeekDay {
  day: string;
  /** Something was done on it. */
  active: boolean;
  /** It has not come yet. */
  later: boolean;
}

export interface Week {
  /** Monday and Sunday. */
  start: string;
  end: string;
  /** The seven days, Monday first. */
  days: WeekDay[];
  /** How many of them have come, today included. */
  soFar: number;
  /** Prayers ticked, out of PRAYERS_A_WEEK. */
  prayers: number;
  /** Pages of Qurʼan read. */
  quran: number;
  /** Habits kept, out of the ones that were due up to today. */
  habits: { done: number; due: number };
  /** To-dos finished. */
  tasks: number;
  /** Minutes on the focus timer. */
  focus: number;
  /** XP from prayers, habits, logs and to-dos. */
  xp: number;
  /** Days on which something was done. */
  active: number;
  streak: number;
  /** Nothing at all yet. */
  empty: boolean;
}

/** The week `today` is in. `mark` is the phone's mark for it, when there is one. */
export function weekOf(d: WeekData, today: string = dayKey(), mark?: WeekMark | null): Week {
  const all = weekDays(today);
  const start = all[0];
  const past = all.filter((day) => day <= today);
  const inWeek = (day?: string): boolean => !!day && day >= start && day <= today;
  const worship = d.worship ?? {};

  const xp = xpSeries({ entries: d.entries, plans: d.plans, checks: d.checks, worship }, all);
  const finished = new Map<string, number>();
  for (const p of d.plans) {
    if (!p.doneAt) continue;
    const day = dayKey(p.doneAt);
    finished.set(day, (finished.get(day) ?? 0) + 1);
  }

  const habits = { done: 0, due: 0 };
  for (const day of past) {
    const tally = dayTally(d.habits, d.checks, day);
    habits.done += tally.done;
    habits.due += tally.due;
  }

  // Since the mark; or else at least what the saved data still knows, which is the last day they moved.
  const totals = weekTotals(d.profile);
  const since = mark && mark.week === start ? mark : null;
  const khatm = d.profile.khatm;
  const timer = d.profile.focus;
  const quranDay = inWeek(khatm?.xpDay) ? (khatm?.xpPages ?? 0) : 0;
  const focusDay = timer && inWeek(timer.day) ? timer.min : 0;
  const quran = Math.max(since ? totals.quran - since.quran : 0, quranDay, 0);
  const focus = Math.max(since ? totals.focus - since.focus : 0, focusDay, 0);

  const days = all.map((day, i) => ({
    day,
    later: day > today,
    active:
      day <= today &&
      (xp[i] > 0 || finished.has(day) || (quranDay > 0 && khatm?.xpDay === day) || (focusDay > 0 && timer?.day === day)),
  }));

  const week = {
    start,
    end: all[6],
    days,
    soFar: past.length,
    prayers: past.reduce((n, day) => n + prayedOn(worship, day), 0),
    quran,
    habits,
    tasks: past.reduce((n, day) => n + (finished.get(day) ?? 0), 0),
    focus,
    xp: all.reduce((n, day, i) => (day <= today ? n + xp[i] : n), 0),
    active: days.filter((x) => x.active).length,
    streak: visibleStreak(d.profile.streak, d.profile.freezes, today),
  };
  return { ...week, empty: weekParts(week).length === 0 };
}

// ---------- its parts, and the letter ----------

export type WeekPart = 'prayers' | 'quran' | 'habits' | 'focus' | 'tasks' | 'xp';

/** From the most important to the least. */
export const WEEK_PARTS: readonly WeekPart[] = ['prayers', 'quran', 'habits', 'focus', 'tasks', 'xp'];

type Numbers = Pick<Week, 'prayers' | 'quran' | 'habits' | 'focus' | 'tasks' | 'xp'>;

const amountOf = (w: Numbers, part: WeekPart): number => (part === 'habits' ? w.habits.done : w[part]);

/** The parts of a week that are not zero, the most important first. */
export const weekParts = (w: Numbers): WeekPart[] => WEEK_PARTS.filter((part) => amountOf(w, part) > 0);

/** The words the letter is put together from, in the reader's language. */
export interface LetterWords {
  /** "Your week:" */
  lead: string;
  /** "A new week starts tomorrow." */
  tail: string;
  prayers: (n: number) => string;
  quran: (pages: number) => string;
  habits: (done: number, due: number) => string;
  focus: (minutes: number) => string;
  tasks: (n: number) => string;
  xp: (n: number) => string;
}

/**
 * The letter's words from the app's own texts: `say` gives a text by its key, `count` one whose form
 * depends on a number. They are handed in so that this file stays free of the app's languages.
 */
export function letterWords(
  say: (key: string, vars?: Record<string, string | number>) => string,
  count: (key: string, n: number) => string,
): LetterWords {
  return {
    lead: say('week.letter.lead'),
    tail: say('week.letter.tail'),
    prayers: (n) => say('week.p.prayers', { n }),
    quran: (n) => count('week.p.quran', n),
    habits: (done, due) => say('week.p.habits', { done, due }),
    focus: (n) => say('week.p.focus', { n }),
    tasks: (n) => count('week.p.tasks', n),
    xp: (n) => say('common.xp', { n }),
  };
}

/** One part in words: "31 of 35 prayers". */
export function partText(w: Numbers, part: WeekPart, words: LetterWords): string {
  if (part === 'habits') return words.habits(w.habits.done, w.habits.due);
  return words[part](w[part]);
}

/** How many parts the letter names, and the length it stays under in every language. */
export const LETTER_PARTS = 3;
export const LETTER_LIMIT = 200;

/**
 * The week as one message: "Your week: 31 of 35 prayers · 12 pages of Qurʼan · habits 18 of 21. A new
 * week starts tomorrow." Only what is not zero, the three most important parts at most; an empty week
 * gives no letter at all ('').
 */
export function weekLetter(w: Numbers, words: LetterWords, limit: number = LETTER_LIMIT): string {
  const parts = weekParts(w).slice(0, LETTER_PARTS).map((part) => partText(w, part, words));
  if (parts.length === 0) return '';
  const whole = (list: string[]): string => `${words.lead} ${list.join(' · ')}. ${words.tail}`;
  // Should the words of some language run long, a part gives way before the limit does.
  while (parts.length > 1 && whole(parts).length >= limit) parts.pop();
  return whole(parts);
}

/** The letter goes out on the week's Sunday at this hour of the person's own clock. */
export const LETTER_HOUR = 20;

export interface LetterReminder {
  id: string;
  text: string;
  hour: number;
  minute: number;
  date: string;
  open: string;
}

/**
 * The one-off reminder that carries the letter. None when there is no letter, or when this Sunday's
 * moment has passed. `minuteNow` is the time of day in minutes.
 */
export function letterReminder(text: string, today: string, minuteNow: number): LetterReminder | null {
  if (!text) return null;
  const sunday = shiftDay(weekStart(today), 6);
  if (today === sunday && minuteNow >= LETTER_HOUR * 60) return null;
  return { id: `w_${sunday}`, text, hour: LETTER_HOUR, minute: 0, date: sunday, open: 'week' };
}

// ---------- what the companion says about it ----------

export type WeekBest = 'prayersAll' | 'prayers' | 'habits' | 'quran' | 'focus' | 'tasks' | 'streak' | 'thin' | 'empty';

/**
 * The best thing of the week, for the companion to name. Prayers and habits are judged by how many of
 * those that were due so far were kept; a week with a little of something but nothing to name is 'thin'.
 */
export function weekBest(w: Week): WeekBest {
  if (w.empty) return 'empty';
  const prayersDue = 5 * w.soFar;
  const prayed = w.prayers / prayersDue;
  const kept = w.habits.due >= 3 ? w.habits.done / w.habits.due : 0;
  if (w.prayers === prayersDue) return 'prayersAll';
  if (prayed >= 0.8 && prayed >= kept) return 'prayers';
  if (kept >= 0.8) return 'habits';
  if (w.quran >= 5) return 'quran';
  if (w.focus >= 60) return 'focus';
  if (w.tasks >= 3) return 'tasks';
  if (prayed >= 0.5 && prayed >= kept) return 'prayers';
  if (kept >= 0.5) return 'habits';
  if (w.quran > 0) return 'quran';
  if (w.streak >= 3) return 'streak';
  return 'thin';
}
