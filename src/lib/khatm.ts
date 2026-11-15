// The Qurʼan khatm planner: read all 604 pages of the standard mushaf in a chosen number of days.
// Each day has a portion (the pages that keep the plan on time); reading earns XP per page.
import quran from '../content/quran.json';
import { shiftDay } from './habits';
import type { Khatm } from './types';

export const PAGES = 604;
export const PLAN_DAYS = [7, 15, 30, 60, 90] as const;
/** XP for each page read, up to PAGE_XP_CAP pages a day, and a bonus for finishing. */
export const PAGE_XP = 1;
export const PAGE_XP_CAP = 60;
export const KHATM_XP = 50;

const DAY_MS = 86_400_000;
const dayNumber = (day: string): number => {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

export const newKhatm = (days: number, today: string, page = 0): Khatm => ({ start: today, days, page, best: page });

/** Which day of the plan today is (0 on the first day; past the end when it runs over). */
export const planDay = (k: Khatm, today: string): number => Math.max(0, dayNumber(today) - dayNumber(k.start));

/** The pages that should be read by the end of plan day `i` (counted from 0). */
export const dueBy = (k: Khatm, i: number): number => (i < 0 ? 0 : Math.min(PAGES, Math.ceil((PAGES * (i + 1)) / k.days)));

/** Today's portion: from the next unread page to the page the plan wants read by tonight. */
export function portion(k: Khatm, today: string): { from: number; to: number; pages: number } {
  const to = Math.max(dueBy(k, planDay(k, today)), Math.min(PAGES, k.page));
  return { from: Math.min(PAGES, k.page + 1), to, pages: Math.max(0, to - k.page) };
}

/**
 * Pages ahead of the plan (past tonight's target) or behind it (short of what was due by this morning).
 * 0 while today's portion is still to read, or exactly done.
 */
export function pace(k: Khatm, today: string): number {
  const i = planDay(k, today);
  const tonight = dueBy(k, i);
  if (k.page >= tonight) return k.page - tonight;
  const morning = dueBy(k, i - 1);
  return k.page < morning ? k.page - morning : 0;
}

/** The day the plan finishes. */
export const finishDay = (k: Khatm): string => shiftDay(k.start, k.days - 1);

export const isDone = (k: Khatm): boolean => k.page >= PAGES;

/** The juz (1–30) a page is in. */
export function juzOf(page: number): number {
  let juz = 1;
  quran.juzStart.forEach((start, i) => {
    if (page >= start) juz = i + 1;
  });
  return juz;
}

/** The surah a page belongs to (the first one on it, when several share the page). */
export function surahOf(page: number): (typeof quran.surahs)[number] {
  return quran.surahs.find((s) => page >= s.pages[0] && page <= s.pages[1]) ?? quran.surahs[quran.surahs.length - 1];
}

/**
 * Moves the bookmark to `page`. XP comes only for pages never read before in this khatm, and for at most
 * PAGE_XP_CAP pages a day, so going back and forth or jumping to the end earns nothing extra.
 */
export function readTo(k: Khatm, page: number, today: string): { khatm: Khatm; xp: number; finished: boolean } {
  const to = Math.max(0, Math.min(PAGES, Math.round(page)));
  const fresh = Math.max(0, to - k.best);
  const usedToday = k.xpDay === today ? (k.xpPages ?? 0) : 0;
  const paid = Math.min(fresh, Math.max(0, PAGE_XP_CAP - usedToday));
  const finished = to >= PAGES && k.page < PAGES;
  const khatm: Khatm = {
    ...k,
    page: to,
    best: Math.max(k.best, to),
    ...(paid > 0 ? { xpDay: today, xpPages: usedToday + paid } : {}),
    ...(finished ? { doneAt: today } : {}),
  };
  return { khatm, xp: paid * PAGE_XP + (finished ? KHATM_XP : 0), finished };
}

/** Two devices' khatm: the newer plan wins; within the same plan, the furthest progress. */
export function mergeKhatm(a: Khatm | undefined, b: Khatm | undefined): Khatm | undefined {
  if (!a || !b) return a ?? b;
  if (a.start !== b.start) return a.start > b.start ? a : b;
  const ahead = a.page >= b.page ? a : b;
  const xpDay = (a.xpDay ?? '') >= (b.xpDay ?? '') ? a.xpDay : b.xpDay;
  const xpPages = Math.max(a.xpDay === xpDay ? (a.xpPages ?? 0) : 0, b.xpDay === xpDay ? (b.xpPages ?? 0) : 0);
  return { ...ahead, best: Math.max(a.best, b.best), xpDay, xpPages: xpDay ? xpPages : undefined, doneAt: a.doneAt ?? b.doneAt };
}
