// Time zone arithmetic with Intl only: local wall clocks, next fire times and ranking weeks.
import { DAY_MS } from './env';

/** Every weekday, in the stored format: digits where 1 = Sunday and 7 = Saturday. */
export const ALL_DAYS = '1234567';

export interface Local {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** When a reminder fires, in the user's local time. */
export interface Schedule {
  hour: number;
  minute: number;
  /** Weekdays it repeats on (digits 1-7); null means every day. Ignored when `date` is set. */
  days: string | null;
  /** YYYY-MM-DD for a one-off. */
  date: string | null;
}

/** The canonical name of an IANA time zone ("asia/seoul" becomes "Asia/Seoul"), or null when it is not one. */
export function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// Formatters are costly to build. Keys are canonical zone names, so the map stays small.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall clock in `tz` at the instant `ms`. */
export function localParts(tz: string, ms: number): Local {
  const out: Local = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatter(tz).formatToParts(ms)) {
    if (part.type in out) out[part.type as keyof Local] = Number(part.value);
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local calendar day in `tz` at the instant `ms`, as YYYY-MM-DD. */
export function localDay(tz: string, ms: number): string {
  const p = localParts(tz, ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** [year, month, day] of a real calendar day written as YYYY-MM-DD, or null. */
export function parseDay(value: unknown): [number, number, number] | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  const real = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  return real && year >= 2000 && year <= 2100 ? [year, month, day] : null;
}

/** How far the zone's wall clock is ahead of UTC at the instant `ms`, in milliseconds. */
function offsetAt(tz: string, ms: number): number {
  const p = localParts(tz, ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a local wall-clock time. A time skipped by a clock change moves forward by the
 * size of the gap (02:30 becomes 03:30); a time that happens twice means its first occurrence.
 */
export function zonedTime(tz: string, year: number, month: number, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - offsetAt(tz, wall);
  const second = wall - offsetAt(tz, first);
  if (first === second) return first;
  // The offset changes close to this time. `second` is right when it maps back to the wall time;
  // when neither does, the wall time does not exist and the later instant is the shifted one.
  return wall - offsetAt(tz, second) === second ? second : Math.max(first, second);
}

/** The next time a schedule fires strictly after `after`, or null when it never will again. */
export function nextFire(s: Schedule, tz: string, after: number): number | null {
  if (s.date) {
    const ymd = parseDay(s.date);
    if (!ymd) return null;
    const at = zonedTime(tz, ymd[0], ymd[1], ymd[2], s.hour, s.minute);
    return at > after ? at : null;
  }
  const days = s.days ?? ALL_DAYS;
  const today = localParts(tz, after);
  // Today, the six days after it, and the same weekday next week (when today's time has passed).
  for (let i = 0; i <= 7; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    if (!days.includes(String(date.getUTCDay() + 1))) continue;
    const at = zonedTime(tz, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), s.hour, s.minute);
    if (at > after) return at;
  }
  return null;
}

/** Monday 00:00 UTC of the week that contains `ms`: the start of the ranking week. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}
