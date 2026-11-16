// Numbers for Home, Analytics and Progress. Pure functions over the app data.
import { Checks, Entry, Folder, Habit, Page, Plan, Profile, Settings, Task } from './types';
import { dayKey } from './dates';
import { activeHabits, checksOn, dayTally, HABIT_XP, shiftDay, topHabitStreak } from './habits';
import { computeProgress } from './progress';
import { worshipXpOn } from './prayer';

export interface Data {
  folders: Folder[];
  tasks: Task[];
  entries: Entry[];
  plans: Plan[];
  habits: Habit[];
  checks: Checks;
  worship: Checks; // prayers, fasts and adhkar ticked: month -> what -> days (lib/prayer.ts)
  pages: Page[]; // the journal: diary entries and notes (lib/journal.ts)
  profile: Profile;
  settings: Settings;
}

/** The last `n` day keys, oldest first, ending today. */
export function lastDays(n: number, today: string = dayKey()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(today, -i));
  return out;
}

type XpSource = Pick<Data, 'entries' | 'plans' | 'checks'> & { worship?: Checks; pages?: Page[] };

/** XP earned on each of the given days: logs, habit ticks, stand-alone to-dos, worship and the journal. */
export function xpSeries(d: XpSource, days: string[]): number[] {
  const index = new Map(days.map((day, i) => [day, i]));
  const out = days.map((day) => checksOn(d.checks, day) * HABIT_XP + (d.worship ? worshipXpOn(d.worship, day) : 0));
  for (const e of d.entries) {
    const i = index.get(dayKey(e.at));
    if (i !== undefined) out[i] += e.xp;
  }
  for (const p of d.plans) {
    if (!p.doneAt || !p.xp) continue;
    const i = index.get(dayKey(p.doneAt));
    if (i !== undefined) out[i] += p.xp;
  }
  for (const page of d.pages ?? []) {
    if (!page.xp) continue;
    const i = index.get(page.day);
    if (i !== undefined) out[i] += page.xp;
  }
  return out;
}

export const xpOnDay = (d: XpSource, day: string): number => xpSeries(d, [day])[0];

export interface Tally {
  done: number;
  total: number;
}

export interface DayStats {
  tasks: Tally; // to-dos planned for the day
  habits: Tally; // habits due that day
  xp: { value: number; goal: number };
  /** 0..1 across whatever was on that day's plate (to-dos, habits, the daily XP goal). */
  overall: number;
}

export function dayStats(d: Data, day: string = dayKey()): DayStats {
  const plans = d.plans.filter((p) => p.day === day);
  const tasks = { done: plans.filter((p) => p.doneAt).length, total: plans.length };
  const h = dayTally(d.habits, d.checks, day);
  const habits = { done: h.done, total: h.due };
  const xp = { value: xpOnDay(d, day), goal: Math.max(1, d.profile.dailyGoalXp) };
  const parts: number[] = [Math.min(1, xp.value / xp.goal)];
  if (tasks.total) parts.push(tasks.done / tasks.total);
  if (habits.total) parts.push(habits.done / habits.total);
  const overall = parts.reduce((s, x) => s + x, 0) / parts.length;
  return { tasks, habits, xp, overall };
}

/** Daily completion (0..1) for each day, for the trend line. */
export function overallSeries(d: Data, days: string[]): number[] {
  return days.map((day) => dayStats(d, day).overall);
}

export const openGoals = (d: Pick<Data, 'tasks' | 'folders'>): Task[] =>
  d.tasks.filter((t) => !t.completedAt && d.folders.some((f) => f.id === t.folderId));

/** Average progress (0..1) of the goals still open. */
export function goalsRatio(d: Pick<Data, 'tasks' | 'folders' | 'entries'>): number {
  const open = openGoals(d);
  if (!open.length) return 0;
  return open.reduce((s, t) => s + computeProgress(t, d.entries).ratio, 0) / open.length;
}

/** Minutes logged on time-based goals since `since` (all time by default). */
export function focusMinutes(d: Pick<Data, 'tasks' | 'entries'>, since = 0): number {
  const timed = new Set(d.tasks.filter((t) => t.progressType === 'time').map((t) => t.id));
  return d.entries.reduce((s, e) => (e.at >= since && timed.has(e.taskId) ? s + e.amount : s), 0);
}

export interface Totals {
  tasksDone: number;
  goalsDone: number;
  goalsActive: number;
  logs: number;
  habitStreak: number;
  focusMinutes: number;
  habitTicks: number;
}

export function totals(d: Data, since = 0, today: string = dayKey()): Totals {
  let habitTicks = 0;
  const from = since ? dayKey(since) : '';
  for (const month of Object.keys(d.checks)) {
    for (const id of Object.keys(d.checks[month])) {
      let mask = d.checks[month][id] >>> 0;
      for (let day = 1; mask; day++, mask >>>= 1) {
        if (mask & 1 && `${month}-${String(day).padStart(2, '0')}` >= from) habitTicks++;
      }
    }
  }
  return {
    tasksDone: d.plans.filter((p) => p.doneAt && p.doneAt >= since).length,
    goalsDone: d.tasks.filter((t) => t.completedAt && t.completedAt >= since).length,
    goalsActive: openGoals(d).length,
    logs: d.entries.filter((e) => e.at >= since).length,
    habitStreak: topHabitStreak(d.habits, d.checks, today),
    focusMinutes: focusMinutes(d, since),
    habitTicks,
  };
}

/** XP that counts on the leaderboards: only logs with proof (and logs from before proof existed). */
export function provenXp(entries: Entry[], since = 0): number {
  return entries.reduce((s, e) => (e.at >= since && e.trust !== 'quick' ? s + e.xp : s), 0);
}

/** Percent change of this period against the one before it, or null when there is nothing to compare. */
export function trend(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : null;
  return Math.round(((current - previous) / previous) * 100);
}

export const hasHabits = (d: Pick<Data, 'habits'>): boolean => activeHabits(d.habits).length > 0;
