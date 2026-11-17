// Special days follow the device's Hijri calendar and the person's moon-sighting adjustment.
// References are present only where this app contains the matching narration.
import { hijriOf, ramadanDays } from './prayer';
import { isChecked, shiftDay } from './habits';
import { dayKey } from './dates';
import type { Checks, Settings } from './types';
import type { Data } from './stats';
import { xpSeries } from './stats';

export type SpecialKind = 'fitr' | 'adha' | 'arafah' | 'ashura' | 'muharram9' | 'ramadan' | 'dhul' | 'white' | 'friday';
export interface SpecialDay { kind: SpecialKind; day: number; fast: boolean; source?: number }

export function specialOn(day: string, offset = 0): SpecialDay | null {
  const h = hijriOf(day, offset);
  if (h) {
    const make = (kind: SpecialKind, fast = false, source?: number): SpecialDay => ({ kind, day: h.day, fast, ...(source ? { source } : {}) });
    if (h.month === 10 && h.day === 1) return make('fitr');
    if (h.month === 12 && h.day === 10) return make('adha');
    if (h.month === 12 && h.day === 9) return make('arafah', true);
    if (h.month === 1 && h.day === 10) return make('ashura', true);
    if (h.month === 1 && h.day === 9) return make('muharram9', true);
    if (h.month === 9) return make('ramadan', true, 38);
    if (h.month === 12 && h.day <= 8) return make('dhul');
    if ([13, 14, 15].includes(h.day) && !(h.month === 12 && h.day === 13)) return make('white', true);
  }
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay() === 5 ? { kind: 'friday', day: h?.day ?? 0, fast: false } : null;
}

/** Fasts already checked in the current Ramadan, up to the displayed day. */
export const ramadanFasts = (worship: Checks, day: string, offset = 0): number =>
  ramadanDays(day, offset).filter((d) => isChecked(worship, 'fast', d)).length;

export function whiteFasts(worship: Checks, day: string, offset = 0): number {
  const h = hijriOf(day, offset);
  if (!h || h.month === 9) return 0;
  return [13, 14, 15].filter((n) => n <= h.day && !(h.month === 12 && n === 13) && isChecked(worship, 'fast', shiftDay(day, n - h.day))).length;
}

/** Only these ten days need a persistent mark for XP actions with no dated history (focus, group juz). */
export function rememberSpecial(days: string[] = [], today: string, offset = 0): string[] {
  const h = hijriOf(today, offset);
  return h?.month === 12 && h.day <= 10 && !days.includes(today) ? [...days, today] : days;
}

type BadgeData = Pick<Data, 'profile' | 'entries' | 'checks' | 'worship'> & Partial<Pick<Data, 'pages' | 'plans' | 'tasks'>> & { settings?: Pick<Settings, 'hijriOffset'> };

/** Each multi-day badge belongs to one Hijri month or year, never a sum across years. */
export function specialBadges(d: BadgeData): string[] {
  const offset = d.settings?.hijriOffset ?? 0;
  const fastDays = new Set<string>();
  const possible = new Set<string>(d.profile.specialDays ?? []);
  for (const checks of [d.worship, d.checks]) for (const [month, keys] of Object.entries(checks)) {
    const mask = Object.values(keys).reduce((a, b) => a | b, 0);
    for (let n = 1; n <= 31; n++) if (mask & (1 << (n - 1))) {
      const day = `${month}-${String(n).padStart(2, '0')}`;
      possible.add(day);
      if (checks === d.worship && isChecked(checks, 'fast', day)) fastDays.add(day);
    }
  }
  for (const e of d.entries) if (e.xp > 0) possible.add(dayKey(e.at));
  for (const p of d.plans ?? []) if (p.doneAt && p.xp) possible.add(dayKey(p.doneAt));
  for (const p of d.pages ?? []) if (p.xp) possible.add(p.day);
  for (const t of d.tasks ?? []) if (t.completedAt) possible.add(dayKey(t.completedAt));
  if (d.profile.khatm?.xpDay && d.profile.khatm.xpPages) possible.add(d.profile.khatm.xpDay);
  if (d.profile.focus?.min) possible.add(d.profile.focus.day);
  const all = [...possible];
  const xp = xpSeries({ ...d, plans: d.plans ?? [] }, all);
  const recorded = new Set(d.profile.specialDays ?? []);
  const ramadan = new Map<number, Set<number>>();
  const white = new Map<string, Set<number>>();
  const ten = new Map<number, Set<number>>();
  const badges = new Set<string>();
  const add = <K>(map: Map<K, Set<number>>, key: K, n: number) => { const s = map.get(key) ?? new Set<number>(); s.add(n); map.set(key, s); };
  all.forEach((day, i) => {
    const h = hijriOf(day, offset);
    if (!h) return;
    const fast = fastDays.has(day);
    if (fast && h.month === 12 && h.day === 9) badges.add('special-arafah');
    if (fast && h.month === 1 && h.day === 10) badges.add('special-ashura');
    if (fast && h.month === 9) add(ramadan, h.year, h.day);
    if (fast && h.month !== 9 && h.month !== 12 && [13, 14, 15].includes(h.day)) add(white, `${h.year}-${h.month}`, h.day);
    const active = xp[i] > 0 || recorded.has(day) || (d.tasks ?? []).some(t => t.completedAt && dayKey(t.completedAt) === day)
      || (d.profile.khatm?.xpDay === day && (d.profile.khatm.xpPages ?? 0) > 0)
      || (d.profile.focus?.day === day && d.profile.focus.min > 0);
    if (active && h.month === 12 && h.day <= 10) add(ten, h.year, h.day);
  });
  if ([...ramadan.values()].some(s => s.size >= 20)) badges.add('special-ramadan');
  if ([...white.values()].some(s => s.size === 3)) badges.add('special-white');
  if ([...ten.values()].some(s => s.size === 10)) badges.add('special-ten');
  return [...badges];
}
