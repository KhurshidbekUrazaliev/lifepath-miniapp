// Dates, times, numbers and amounts in the app's language.
import { locale, t, tn } from './index';
import { dayKey, daysBetween } from '../lib/dates';
import { dayKeyToMs, parseTime } from '../lib/calendar';
import { ProgressType } from '../lib/types';

const cache = new Map<string, Intl.DateTimeFormat>();
function df(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale() + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale(), options);
    } catch {
      f = new Intl.DateTimeFormat('en-US', options);
    }
    cache.set(key, f);
  }
  return f;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const fmtNumber = (n: number): string => {
  try {
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
};

/** "Nov 14" */
export const fmtShortDate = (ms: number): string => df({ month: 'short', day: 'numeric' }).format(ms);
/** "November 14, 2026" */
export const fmtLongDate = (ms: number): string => df({ month: 'long', day: 'numeric', year: 'numeric' }).format(ms);
/** "Saturday, November 14" */
export const fmtWeekdayDate = (ms: number): string => cap(df({ weekday: 'long', month: 'long', day: 'numeric' }).format(ms));
/** "November 2026" */
export const fmtMonth = (year: number, month: number): string => cap(df({ month: 'long', year: 'numeric' }).format(new Date(year, month, 1)));

/** "8:00 PM" (or 20:00 where that is the custom) */
export function fmtTime(hour: number, minute: number): string {
  return df({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour, minute));
}
export function fmtTimeStr(time?: string): string {
  const p = parseTime(time);
  return p ? fmtTime(p.hour, p.minute) : '';
}
export const fmtClock = (ms: number): string => df({ hour: 'numeric', minute: '2-digit' }).format(ms);
/** A time of day at a place, in that place's time zone ("3:12 PM", "15:12"). */
export function fmtClockIn(ms: number | Date, timeZone: string): string {
  try {
    return df({ hour: 'numeric', minute: '2-digit', timeZone }).format(ms);
  } catch {
    return fmtClock(Number(ms));
  }
}
/** How long until something: "in 1 h 05 min", "in 7 min". */
export function fmtLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return t('prayer.left.m', { m: minutes });
  return t('prayer.left.hm', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/** Short weekday name for 0 = Sunday ... 6 = Saturday: "Mon". */
export function weekdayShort(dow: number): string {
  return cap(df({ weekday: 'short' }).format(new Date(2026, 1, 1 + dow))); // 1 Feb 2026 is a Sunday
}
/** One or two letters for tight spots. */
export const weekdayMini = (dow: number): string => weekdayShort(dow).replace('.', '').slice(0, 2);

/** "Today", "Tomorrow", "Yesterday", otherwise "Wed, Nov 18". */
export function dayLabel(key: string, today: string = dayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.tomorrow');
  if (diff === -1) return t('common.yesterday');
  return cap(df({ weekday: 'short', month: 'short', day: 'numeric' }).format(dayKeyToMs(key, 12)));
}

/** "Today • 8:00 PM" as on the design's task cards. */
export function dayTimeLabel(key: string, time?: string): string {
  const tm = fmtTimeStr(time);
  return tm ? `${dayLabel(key)} • ${tm}` : dayLabel(key);
}

/** When something happened: a clock time today, "Yesterday", "3 days ago", else a short date. */
export function fmtRelative(ms: number, now: number = Date.now()): string {
  const diff = daysBetween(dayKey(ms), dayKey(now));
  if (diff === 0) return fmtClock(ms);
  if (diff === 1) return t('common.yesterday');
  if (diff < 7) return tn('common.daysAgo', diff);
  return fmtShortDate(ms);
}

const trim = (n: number): string => fmtNumber(Math.round(n * 10) / 10);

/** "2h 30m", "45 min", "3 sessions", "20 pages". */
export function fmtAmount(amount: number, unit: string, type: ProgressType): string {
  if (type === 'time') {
    if (amount >= 60) {
      const h = Math.floor(amount / 60);
      const m = Math.round(amount % 60);
      return m ? t('unit.hm', { h, m }) : t('unit.h', { h });
    }
    return t('unit.min', { n: trim(amount) });
  }
  if (type === 'sessions') return tn('unit.sessions', amount, { n: trim(amount) });
  if (type === 'milestones') return tn('unit.steps', amount, { n: trim(amount) });
  return `${trim(amount)} ${unit}`;
}

/** "142 / 307 pages" */
export function fmtProgress(done: number, total: number, unit: string, type: ProgressType): string {
  if (type === 'time') return `${fmtAmount(done, unit, type)} / ${fmtAmount(total, unit, type)}`;
  const u = type === 'sessions' ? tn('unit.sessionsWord', total) : type === 'milestones' ? tn('unit.stepsWord', total) : unit;
  return `${trim(done)} / ${trim(total)} ${u}`;
}

/** "42h" or "35m" for the Focus time tile. */
export function fmtHours(minutes: number): string {
  if (minutes >= 60) return t('unit.h', { h: trim(minutes / 60) });
  return t('unit.m', { m: Math.round(minutes) });
}

export const pct = (ratio: number): string => `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;

export function greetingKey(now: number = Date.now()): 'home.greet.night' | 'home.greet.morning' | 'home.greet.day' | 'home.greet.evening' {
  const h = new Date(now).getHours();
  if (h < 5) return 'home.greet.night';
  if (h < 12) return 'home.greet.morning';
  if (h < 18) return 'home.greet.day';
  return 'home.greet.evening';
}

/** Localized country name from its ISO code, e.g. "UZ" -> "Uzbekistan". */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
