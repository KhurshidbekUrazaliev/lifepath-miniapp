// The phone app's reminders: the same list the bot would send (store/serverSync.ts builds it), shown
// as the phone's own notifications. Everything is worked out here on the phone, prayer times included,
// so nothing is sent anywhere. Each call replaces the whole set.
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { timesFor, shiftDate, dayAt, type MethodKey, type AsrSchool, type PrayerKey } from '../lib/prayerTimes';

export interface PhoneReminder {
  id: string;
  text: string;
  hour: number;
  minute: number;
  /** Weekdays, 1 = Sunday ... 7 = Saturday: repeats every week. */
  days?: number[];
  /** "YYYY-MM-DD": once, on that day. */
  date?: string;
  open?: string;
}

export interface PhonePrayers {
  lat: number;
  lon: number;
  tz: string;
  method: MethodKey;
  asr: AsrSchool;
  before: number;
  items: { key: PrayerKey; text: string }[];
}

export interface PhoneNudge {
  hour: number;
  minute: number;
  text: string;
  /** The day the user last earned something: no nudge on a day that is already active. */
  lastActiveDay: string | null;
}

const CHANNEL = 'reminders';
/** Android keeps up to 500 alarms per app; a week ahead stays far below that. */
const MAX = 200;
const PRAYER_DAYS = 7;
const NUDGE_DAYS = 7;

/** A stable 31-bit number for a reminder's id (Android notification ids are ints). */
function numberFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}

const atLocal = (day: string, hour: number, minute: number): Date => {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
};

const localDay = (at: Date = new Date()): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

/** Turns the lists into the phone's notifications. Pure, so it can be tested. */
export function plan(
  items: PhoneReminder[],
  prayers: PhonePrayers | null,
  nudge: PhoneNudge | null,
  now: number = Date.now(),
): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  const base = (key: string, body: string, open?: string): LocalNotificationSchema => ({
    id: numberFor(key),
    // Android already names the app above it, so the reminder itself is the title, as the bot's message was.
    title: body,
    body: '',
    channelId: CHANNEL,
    smallIcon: 'ic_stat_lifepath',
    iconColor: '#8E6BF2',
    extra: open ? { open } : undefined,
  });

  for (const r of items) {
    if (r.date) {
      const at = atLocal(r.date, r.hour, r.minute);
      if (at.getTime() <= now) continue;
      out.push({ ...base(r.id, r.text, r.open), schedule: { at, allowWhileIdle: true } });
    } else if (r.days?.length) {
      for (const weekday of r.days) {
        out.push({ ...base(`${r.id}:${weekday}`, r.text, r.open), schedule: { on: { weekday, hour: r.hour, minute: r.minute }, allowWhileIdle: true } });
      }
    }
  }

  if (prayers && prayers.items.length) {
    const today = dayAt(prayers.tz, now);
    for (let i = 0; i < PRAYER_DAYS; i++) {
      const day = shiftDate(today, i);
      const times = timesFor(prayers, day, prayers.method, prayers.asr);
      for (const p of prayers.items) {
        const at = new Date(times[p.key].getTime() - prayers.before * 60_000);
        if (at.getTime() <= now) continue;
        const hh = String(times[p.key].getHours()).padStart(2, '0');
        const mm = String(times[p.key].getMinutes()).padStart(2, '0');
        out.push({ ...base(`pr_${day}_${p.key}`, p.text.replace('{time}', `${hh}:${mm}`), 'prayer'), schedule: { at, allowWhileIdle: true } });
      }
    }
  }

  if (nudge) {
    const today = localDay(new Date(now));
    for (let i = 0; i < NUDGE_DAYS; i++) {
      const day = shiftDate(today, i);
      if (nudge.lastActiveDay && nudge.lastActiveDay >= day) continue;
      const at = atLocal(day, nudge.hour, nudge.minute);
      if (at.getTime() <= now) continue;
      out.push({ ...base(`nudge_${day}`, nudge.text), schedule: { at, allowWhileIdle: true } });
    }
  }

  return out.slice(0, MAX);
}

let channelMade = false;
let exact: boolean | null = null;

/** Replaces every scheduled notification with `next`. Quiet when the phone does not allow them. */
export async function applyOnPhone(next: LocalNotificationSchema[]): Promise<void> {
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    if (!channelMade) {
      await LocalNotifications.createChannel({ id: CHANNEL, name: 'Reminders', importance: 4, visibility: 1, vibration: true });
      channelMade = true;
    }
    if (exact === null) exact = (await LocalNotifications.checkExactNotificationSetting().catch(() => ({ exact_alarm: 'denied' }))).exact_alarm === 'granted';
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    // Exact alarms where the phone allows them; otherwise Android may move a reminder by a few minutes.
    if (next.length) await LocalNotifications.schedule({ notifications: next.map((n) => ({ ...n, isExactNotification: exact === true })) });
  } catch {
    // a reminder that cannot be set is not worth breaking the app for
  }
}

/** Once, right after the user turns reminders on: asks Android to allow exact times, if it does not yet. */
export async function askExactAlarms(): Promise<void> {
  try {
    const now = await LocalNotifications.checkExactNotificationSetting();
    if (now.exact_alarm === 'granted') {
      exact = true;
      return;
    }
    exact = (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    exact = false;
  }
}
