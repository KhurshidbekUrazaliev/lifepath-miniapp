// Prayer times on the device, the Qibla, and the prayer and fasting tracker. Pure functions so they
// can be tested. The calculation itself is in prayerTimes.ts, which the bot's server shares.
import { Coordinates, Qibla } from 'adhan';
import type { Checks, Place, Settings } from './types';
import { PRAYERS, TIMES, dayAt, resolveMethod, timesFor, type DayTimes, type PrayerKey, type TimeKey } from './prayerTimes';
import { isChecked, shiftDay } from './habits';
import { hijriDate, HijriDate } from './hijri';

export type { Place };
export * from './prayerTimes';

export const TIME_EMOJI: Record<TimeKey, string> = { fajr: '🌅', sunrise: '🌄', dhuhr: '☀️', asr: '🌤️', maghrib: '🌇', isha: '🌙' };

/** The prayers the bot reminds about: the ones chosen in Settings, all five when none were. */
export function alertPrayers(s: Pick<Settings, 'prayerAlertList'>): PrayerKey[] {
  const list = s.prayerAlertList;
  return list ? PRAYERS.filter((p) => list.includes(p)) : [...PRAYERS];
}

/** What the tracker can tick, per day: the five prayers, a fast, the morning and evening adhkar. */
export type WorshipKey = PrayerKey | 'fast' | 'am' | 'pm';
export const WORSHIP_XP: Record<WorshipKey, number> = { fajr: 5, dhuhr: 5, asr: 5, maghrib: 5, isha: 5, fast: 10, am: 5, pm: 5 };

export interface PrayerNow {
  day: string; // the place's day
  times: DayTimes;
  current: TimeKey | null; // the time we are in (null before today's Fajr)
  next: { key: TimeKey; at: Date; tomorrow: boolean };
  since: Date; // when the current stretch began (for a progress bar)
}

/** Today's times at the place, the current one and the next one (after Isha: tomorrow's Fajr). */
export function prayerNow(place: Place, s: Pick<Settings, 'prayerMethod' | 'asr'>, at: number = Date.now()): PrayerNow {
  const { method, asr } = resolveMethod(s, place.tz);
  const day = dayAt(place.tz, at);
  const times = timesFor(place, day, method, asr);
  let current: TimeKey | null = null;
  for (const key of TIMES) if (times[key].getTime() <= at) current = key;
  const upcoming = TIMES.find((key) => times[key].getTime() > at);
  if (upcoming) {
    const i = TIMES.indexOf(upcoming);
    const since = i > 0 ? times[TIMES[i - 1]] : timesFor(place, shiftDay(day, -1), method, asr).isha;
    return { day, times, current, next: { key: upcoming, at: times[upcoming], tomorrow: false }, since };
  }
  const tomorrow = timesFor(place, shiftDay(day, 1), method, asr);
  return { day, times, current, next: { key: 'fajr', at: tomorrow.fajr, tomorrow: true }, since: times.isha };
}

/** A prayer can be ticked once its time has come (any time on earlier days). */
export function canTick(key: WorshipKey, day: string, now: PrayerNow | null, at: number = Date.now()): boolean {
  if (!now || day < now.day) return true;
  if (day > now.day) return false;
  if (key === 'fast' || key === 'am' || key === 'pm') return true;
  return now.times[key as PrayerKey].getTime() <= at;
}

// ---------- the Qibla ----------

const KAABA = { lat: 21.4225, lon: 39.8262 };

/** Degrees clockwise from true north. */
export const qiblaBearing = (lat: number, lon: number): number => Qibla(new Coordinates(lat, lon));

/** Great-circle distance to the Kaaba in km. */
export function kmToKaaba(lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const dLat = (KAABA.lat - lat) * rad;
  const dLon = (KAABA.lon - lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(KAABA.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The signed smallest turn from `from` to `to`, in degrees (-180..180). */
export const turn = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

// ---------- the tracker ----------

/** XP earned from ticks on one day. */
export function worshipXpOn(worship: Checks, day: string): number {
  let xp = 0;
  for (const key of Object.keys(WORSHIP_XP) as WorshipKey[]) if (isChecked(worship, key, day)) xp += WORSHIP_XP[key];
  return xp;
}

export const prayedOn = (worship: Checks, day: string): number => PRAYERS.filter((p) => isChecked(worship, p, day)).length;

/** Days in a row with all five prayers ticked, ending today (or yesterday while today is still open). */
export function prayerStreak(worship: Checks, today: string): number {
  let day = prayedOn(worship, today) === 5 ? today : shiftDay(today, -1);
  let n = 0;
  while (prayedOn(worship, day) === 5 && n < 3660) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

// ---------- Ramadan ----------

/** The Hijri date for a day, with the offset from Settings. */
export const hijriOf = (day: string, offset = 0): HijriDate | null => {
  const [y, m, d] = day.split('-').map(Number);
  return hijriDate(new Date(y, m - 1, d, 12), offset);
};

/** Days until the 1st of Ramadan, while it is less than 30 days away (and not Ramadan yet). */
export function daysToRamadan(day: string, offset = 0): number | null {
  for (let i = 1; i <= 30; i++) {
    const h = hijriOf(shiftDay(day, i), offset);
    if (!h) return null;
    if (h.month === 9 && h.day === 1) return i;
  }
  return null;
}

/** The days of this Ramadan so far, oldest first (for the fasting tracker). */
export function ramadanDays(day: string, offset = 0): string[] {
  const h = hijriOf(day, offset);
  if (h?.month !== 9) return [];
  const out: string[] = [];
  for (let i = h.day - 1; i >= 0; i--) out.push(shiftDay(day, -i));
  return out;
}
