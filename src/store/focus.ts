// The focus timer that is on the clock. It is kept on this device, so it keeps counting while the app
// is closed; a session that ended meanwhile is counted the next time the app opens.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { BREAK_MINUTES, FocusRun, isOver, newRun, pauseRun, resumeRun } from '../lib/focus';
import { useStore } from './store';
import { t } from '../i18n';

const KEY = 'lp:focus';

/** The session that just ended, for the screen to show. */
export interface FocusDone {
  mode: FocusRun['mode'];
  minutes: number;
  xp: number;
  at: number;
  taskId?: string;
}

interface FocusState {
  run: FocusRun | null;
  done: FocusDone | null;
  start: (minutes: number, taskId?: string) => void;
  startBreak: () => void;
  pause: () => void;
  resume: () => void;
  /** Ends the session early: nothing is counted. */
  stop: () => void;
  clearDone: () => void;
  /** Counts the session once its time is up. */
  tick: (now?: number) => void;
}

function load(): FocusRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FocusRun | null;
    return run && (run.mode === 'focus' || run.mode === 'break') && run.minutes > 0 ? run : null;
  } catch {
    return null;
  }
}

function save(run: FocusRun | null): void {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    // the timer still runs while the app is open
  }
}

export const useFocus = create<FocusState>()((set, get) => {
  const put = (run: FocusRun | null, extra: Partial<FocusState> = {}) => {
    save(run);
    set({ run, ...extra });
  };
  return {
    run: load(),
    done: null,
    start: (minutes, taskId) => put(newRun('focus', minutes, Date.now(), taskId), { done: null }),
    startBreak: () => put(newRun('break', BREAK_MINUTES, Date.now()), { done: null }),
    pause: () => {
      const run = get().run;
      if (run) put(pauseRun(run, Date.now()));
    },
    resume: () => {
      const run = get().run;
      if (run) put(resumeRun(run, Date.now()));
    },
    stop: () => put(null),
    clearDone: () => set({ done: null }),
    tick: (now = Date.now()) => {
      const run = get().run;
      if (!run || !isOver(run, now)) return;
      put(null); // first, so the session can only be counted once
      const xp = run.mode === 'focus' ? useStore.getState().finishFocus(run.minutes, run.taskId, t('focus.note', { n: run.minutes })) : 0;
      set({ done: { mode: run.mode, minutes: run.minutes, xp, at: now, taskId: run.taskId } });
    },
  };
});

/** Mount once: counts a session the moment it ends, wherever the person is in the app. */
export function useFocusClock(): void {
  const endsAt = useFocus((s) => s.run?.endsAt);
  useEffect(() => {
    const tick = useFocus.getState().tick;
    tick();
    if (endsAt === undefined) return;
    const wait = Math.max(0, endsAt - Date.now());
    // A timeout for the end itself, and a check whenever the app comes back to the screen.
    const id = setTimeout(() => tick(), wait + 50);
    const onShow = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [endsAt]);
}

/** The time, updated every second while `on` (for a clock on screen). */
export function useNowWhile(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}
