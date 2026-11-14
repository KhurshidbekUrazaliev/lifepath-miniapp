// Daily habits (new in the Mini App). Pure functions so they can be unit tested.
import { Checks, Habit } from './types';
import { dayKey } from './dates';
import { dayKeyToMs } from './calendar';

/** XP for ticking a habit. Flat on purpose: a tick can be undone, and the same amount comes back off. */
export const HABIT_XP = 5;
/** XP for finishing a to-do that is not tied to a goal. */
export const TODO_XP = 5;

const monthOf = (day: string) => day.slice(0, 7);
const bitOf = (day: string) => 1 << (Number(day.slice(8, 10)) - 1);

export function isChecked(checks: Checks, habitId: string, day: string): boolean {
  return ((checks[monthOf(day)]?.[habitId] ?? 0) & bitOf(day)) !== 0;
}

/** Returns new checks with that day ticked or cleared (never mutates). */
export function withCheck(checks: Checks, habitId: string, day: string, on: boolean): Checks {
  const m = monthOf(day);
  const month = { ...(checks[m] ?? {}) };
  const mask = month[habitId] ?? 0;
  const next = on ? mask | bitOf(day) : mask & ~bitOf(day);
  if (next === 0) delete month[habitId];
  else month[habitId] = next;
  const out = { ...checks };
  if (Object.keys(month).length === 0) delete out[m];
  else out[m] = month;
  return out;
}

export function withoutHabit(checks: Checks, habitId: string): Checks {
  const out: Checks = {};
  for (const m of Object.keys(checks)) {
    const { [habitId]: _gone, ...rest } = checks[m];
    if (Object.keys(rest).length) out[m] = rest;
  }
  return out;
}

/** Weekday of a day key, 1 = Sunday ... 7 = Saturday (the same numbering LifePath reminders use). */
export function weekdayOf(day: string): number {
  return new Date(dayKeyToMs(day, 12)).getDay() + 1;
}

/** Is the habit expected on that day? Not before it was created, not after it was archived. */
export function isDue(habit: Habit, day: string): boolean {
  if (day < dayKey(habit.createdAt)) return false;
  if (habit.archivedAt && day >= dayKey(habit.archivedAt)) return false;
  return habit.days.includes(weekdayOf(day));
}

export const activeHabits = (habits: Habit[]): Habit[] => habits.filter((h) => !h.archivedAt);
export const dueHabits = (habits: Habit[], day: string): Habit[] => habits.filter((h) => isDue(h, day));

export function shiftDay(day: string, delta: number): string {
  const d = new Date(dayKeyToMs(day, 12));
  d.setDate(d.getDate() + delta);
  return dayKey(d.getTime());
}

/**
 * Current streak: consecutive due days ticked, counting back from today.
 * Today only counts once it is ticked, so an unticked today does not break the streak yet.
 */
export function habitStreak(habit: Habit, checks: Checks, today: string = dayKey()): number {
  let streak = 0;
  let day = today;
  const first = dayKey(habit.createdAt);
  for (let i = 0; i < 3660 && day >= first; i++) {
    if (isDue(habit, day)) {
      if (isChecked(checks, habit.id, day)) streak++;
      else if (day !== today) break;
    }
    day = shiftDay(day, -1);
  }
  return streak;
}

export function bestHabitStreak(habit: Habit, checks: Checks, today: string = dayKey()): number {
  let best = 0;
  let run = 0;
  let day = dayKey(habit.createdAt);
  for (let i = 0; i < 3660 && day <= today; i++) {
    if (isDue(habit, day)) {
      if (isChecked(checks, habit.id, day)) {
        run++;
        if (run > best) best = run;
      } else if (day !== today) run = 0;
    }
    day = shiftDay(day, 1);
  }
  return best;
}

/** Done and due counts for a list of habits on one day. */
export function dayTally(habits: Habit[], checks: Checks, day: string): { done: number; due: number } {
  const due = dueHabits(habits, day);
  return { due: due.length, done: due.filter((h) => isChecked(checks, h.id, day)).length };
}

/** Share of due check-offs that were done between two days (inclusive). 0 when nothing was due. */
export function completionRate(habits: Habit[], checks: Checks, from: string, to: string): number {
  let due = 0;
  let done = 0;
  for (let day = from, i = 0; day <= to && i < 3660; day = shiftDay(day, 1), i++) {
    const t = dayTally(habits, checks, day);
    due += t.due;
    done += t.done;
  }
  return due === 0 ? 0 : done / due;
}

/** Total check-offs on a day across every habit (used for XP per day). */
export function checksOn(checks: Checks, day: string): number {
  const month = checks[monthOf(day)];
  if (!month) return 0;
  const bit = bitOf(day);
  let n = 0;
  for (const id of Object.keys(month)) if (month[id] & bit) n++;
  return n;
}

/** The longest current streak among active habits. */
export function topHabitStreak(habits: Habit[], checks: Checks, today: string = dayKey()): number {
  return activeHabits(habits).reduce((best, h) => Math.max(best, habitStreak(h, checks, today)), 0);
}

export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
