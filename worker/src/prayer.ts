// Prayer reminders. The Worker works out each prayer's time with the app's own calculation
// (src/lib/prayerTimes.ts), so the reminders keep arriving on days the app is not opened.
import { PRAYERS, isMethod, nextPrayerAt, type AsrSchool, type MethodKey, type PrayerKey } from '../../src/lib/prayerTimes';
import type { Lang } from './env';
import { badRequest } from './http';
import { localParts } from './time';
import { bool, int, obj, oneOf, str, timeZone } from './validate';

export interface PrayerPrefs {
  lat: number;
  lon: number;
  tz: string;
  method: MethodKey;
  asr: AsrSchool;
  /** Minutes ahead of the prayer. */
  before: number;
}

export interface PrayerRequest {
  prefs: PrayerPrefs;
  items: { key: PrayerKey; text: string }[];
}

const ASR: readonly AsrSchool[] = ['standard', 'hanafi'];

/** The reminder id of a prayer. The app's own ids cannot contain "~". */
export const prayerId = (key: PrayerKey): string => `~${key}`;

export function prayerKeyOf(id: string): PrayerKey | null {
  const key = id.slice(1);
  return id.startsWith('~') && (PRAYERS as readonly string[]).includes(key) ? (key as PrayerKey) : null;
}

/** A latitude or longitude, rounded to about a kilometre. */
function coordinate(v: unknown, name: string, limit: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) {
    throw badRequest(`${name}: number from -${limit} to ${limit} expected`);
  }
  return Math.round(v * 100) / 100;
}

/** The `prayer` part of PUT /api/reminders, or null when prayer reminders are off. */
export function parsePrayer(raw: unknown, maxText: number): PrayerRequest | null {
  if (raw === undefined || raw === null) return null;
  const o = obj(raw, 'prayer');
  if (!bool(o.enabled, 'prayer.enabled')) return null;
  if (!isMethod(o.method)) throw badRequest('prayer.method: unknown method');
  const prefs: PrayerPrefs = {
    lat: coordinate(o.lat, 'prayer.lat', 90),
    lon: coordinate(o.lon, 'prayer.lon', 180),
    tz: timeZone(o.tz),
    method: o.method,
    asr: oneOf(o.asr, 'prayer.asr', ASR),
    before: int(o.before, 'prayer.before', 0, 60),
  };
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > PRAYERS.length) {
    throw badRequest(`prayer.items: 1-${PRAYERS.length} prayers expected`);
  }
  const items = o.items.map((raw, i) => {
    const item = obj(raw, `prayer.items[${i}]`);
    return { key: oneOf(item.key, `prayer.items[${i}].key`, PRAYERS), text: str(item.text, `prayer.items[${i}].text`, maxText) };
  });
  if (new Set(items.map((item) => item.key)).size !== items.length) throw badRequest('prayer.items: each prayer at most once');
  return { prefs, items };
}

export const samePrefs = (a: PrayerPrefs | null, b: PrayerPrefs | null): boolean =>
  a !== null &&
  b !== null &&
  a.lat === b.lat &&
  a.lon === b.lon &&
  a.tz === b.tz &&
  a.method === b.method &&
  a.asr === b.asr &&
  a.before === b.before;

/** Stored preferences as read from the database, checked again so a bad row cannot break the cron. */
export function prefsFromRow(row: { lat: unknown; lon: unknown; tz: unknown; method: unknown; asr: unknown; before: unknown }): PrayerPrefs | null {
  if (typeof row.lat !== 'number' || typeof row.lon !== 'number' || typeof row.tz !== 'string' || !isMethod(row.method)) return null;
  return {
    lat: row.lat,
    lon: row.lon,
    tz: row.tz,
    method: row.method,
    asr: row.asr === 'hanafi' ? 'hanafi' : 'standard',
    before: typeof row.before === 'number' ? row.before : 0,
  };
}

/** When the reminder for a prayer next fires, strictly after `after`. */
export function nextPrayerFire(prefs: PrayerPrefs, key: PrayerKey, after: number): number | null {
  return nextPrayerAt(prefs, prefs.method, prefs.asr, key, prefs.before, after);
}

/** The place's wall clock at `at`, for the reminder row's hour and minute. */
export function clockAt(tz: string, at: number): { hour: number; minute: number } {
  const p = localParts(tz, at);
  return { hour: p.hour, minute: p.minute };
}

/** The message with the prayer's time put in for "{time}", as the place's clock shows it. */
export function prayerText(text: string, prayerAt: number, tz: string, lang: Lang): string {
  if (!text.includes('{time}')) return text;
  let time: string;
  try {
    time = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(prayerAt);
  } catch {
    const p = localParts(tz, prayerAt);
    time = `${p.hour}:${String(p.minute).padStart(2, '0')}`;
  }
  return text.replaceAll('{time}', time);
}
