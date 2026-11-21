// The focus timer: study for a set time while the companion reads along. A finished session logs its
// minutes on a timed goal, or earns a little XP of its own; ending a session early earns nothing.
import type { FocusStats } from './types';

export const FOCUS_MINUTES = [15, 25, 45, 60] as const;
export const BREAK_MINUTES = 5;
/** The shortest and longest focus session one can set by hand. */
export const CUSTOM_MIN = 1;
export const CUSTOM_MAX = 180;
/** A length typed or stepped by hand, kept to whole minutes between CUSTOM_MIN and CUSTOM_MAX. */
export const customMinutes = (n: number): number => (Number.isFinite(n) ? Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(n))) : 25);
/** A session that counts toward no goal earns 1 XP per 5 minutes, for up to 2 hours of focus a day. */
export const FOCUS_XP_EVERY = 5;
export const FOCUS_XP_DAILY_MINUTES = 120;

/** The session on the clock (kept on this device, so it keeps going while the app is closed). */
export interface FocusRun {
  mode: 'focus' | 'break';
  minutes: number;
  /** The timed goal the minutes are logged on. */
  taskId?: string;
  /** When it ends; unset while paused. */
  endsAt?: number;
  /** Milliseconds left while paused. */
  left?: number;
}

export const newRun = (mode: FocusRun['mode'], minutes: number, now: number, taskId?: string): FocusRun => ({
  mode,
  minutes,
  ...(taskId ? { taskId } : {}),
  endsAt: now + minutes * 60_000,
});

/** Milliseconds still to go. */
export const remaining = (run: FocusRun, now: number): number =>
  Math.max(0, run.endsAt !== undefined ? run.endsAt - now : (run.left ?? run.minutes * 60_000));

export const pauseRun = (run: FocusRun, now: number): FocusRun =>
  run.endsAt === undefined ? run : { mode: run.mode, minutes: run.minutes, taskId: run.taskId, left: remaining(run, now) };

export const resumeRun = (run: FocusRun, now: number): FocusRun =>
  run.endsAt !== undefined ? run : { mode: run.mode, minutes: run.minutes, taskId: run.taskId, endsAt: now + (run.left ?? 0) };

export const isOver = (run: FocusRun, now: number): boolean => run.endsAt !== undefined && run.endsAt <= now;

/** "24:59" (or "1:00:00" for an hour). */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Today's sessions and minutes. */
export const focusToday = (f: FocusStats | undefined, today: string): { min: number; n: number } =>
  f?.day === today ? { min: f.min, n: f.n } : { min: 0, n: 0 };

/** XP for a finished session that counts toward no goal, given the minutes already focused today. */
export function focusXp(minutes: number, todayBefore: number): number {
  const paid = Math.max(0, Math.min(minutes, FOCUS_XP_DAILY_MINUTES - todayBefore));
  return Math.floor(paid / FOCUS_XP_EVERY);
}

/** The stats after one more finished session. */
export function addSession(f: FocusStats | undefined, minutes: number, today: string, onGoal: boolean): FocusStats {
  const t = focusToday(f, today);
  const free = (f?.free ?? 0) + (onGoal ? 0 : minutes);
  return { day: today, min: t.min + minutes, n: t.n + 1, total: (f?.total ?? 0) + minutes, ...(free ? { free } : {}) };
}

/** Two devices' stats: the later day's counts, and the larger totals. */
export function mergeFocus(a: FocusStats | undefined, b: FocusStats | undefined): FocusStats | undefined {
  if (!a || !b) return a ?? b;
  const day = a.day >= b.day ? a.day : b.day;
  const ta = focusToday(a, day);
  const tb = focusToday(b, day);
  const free = Math.max(a.free ?? 0, b.free ?? 0);
  return { day, min: Math.max(ta.min, tb.min), n: Math.max(ta.n, tb.n), total: Math.max(a.total, b.total), ...(free ? { free } : {}) };
}
