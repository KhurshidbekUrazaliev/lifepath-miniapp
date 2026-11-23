// Keeps the bot's server in step with the app: who the user is, which reminders to send,
// and the score that the rankings show. All of it is optional; the app works without it.
import { useEffect } from 'react';
import { useStore, snapshot } from './store';
import { useFocus } from './focus';
import { api, useServer } from './server';
import { fetchDaily } from './daily';
import { Data, provenXp } from '../lib/stats';
import { activeHabits, shiftDay } from '../lib/habits';
import { levelInfo, visibleStreak } from '../lib/gamify';
import { weekStartMs } from '../lib/rankings';
import { parseTime } from '../lib/calendar';
import { dayKey } from '../lib/dates';
import { TIME_EMOJI, alertPrayers, resolveMethod } from '../lib/prayer';
import { counters } from '../lib/challenges';
import { reportableDay } from '../lib/together';
import { activeDayReported } from './together';
import { wroteOn } from '../lib/journal';
import { letterReminder, weekLetter } from '../lib/week';
import { weekNow, weekWords } from './week';
import type { Settings } from '../lib/types';
import { getLang, t } from '../i18n';
import { inTelegram, isNative, requestWriteAccess } from '../tg/telegram';
import { notificationsAllowed } from '../native/bridge';
import { applyOnPhone, askExactAlarms, plan, type PhonePrayers } from '../native/notify';
import { planTitle } from '../ui/parts';

const timeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

interface ReminderItem {
  id: string;
  text: string;
  hour: number;
  minute: number;
  days?: number[];
  date?: string;
  open?: string;
}

/**
 * The weekly letter: the week in numbers, sent once, on its Sunday evening. It is written here on the
 * phone, so it says what the week looked like when the app was last open, and nothing changes while
 * the app is closed. None when the letter is switched off, the week is still empty, or the moment
 * has passed. The journal has no part in it (lib/week.ts does not read it).
 */
function weekLetterItem(d: Data): ReminderItem | null {
  if (d.settings.weekLetter === false) return null;
  const text = weekLetter(weekNow(d), weekWords());
  const now = new Date();
  return letterReminder(text ? `✉️ ${text}` : '', dayKey(), now.getHours() * 60 + now.getMinutes());
}

/** Everything the bot should remind this person about, in their language. */
export function buildReminders(d: Data): ReminderItem[] {
  const items: ReminderItem[] = [];
  const today = dayKey();
  if (d.settings.jumuah) {
    // Friday (6, counting Sunday as 1) at nine in the morning.
    items.push({ id: 'jumuah', text: `🕌 ${t('notif.msg.jumuah')}`, hour: 9, minute: 0, days: [6], open: 'prayer' });
  }
  for (const task of d.tasks) {
    if (!task.reminder || task.completedAt || task.reminder.days.length === 0) continue;
    const folder = d.folders.find((f) => f.id === task.folderId);
    items.push({
      id: `g_${task.id}`,
      text: `${folder?.icon ?? '🎯'} ${t('notif.msg.goal', { title: task.title })}`.slice(0, 300),
      hour: task.reminder.hour,
      minute: task.reminder.minute,
      days: task.reminder.days,
      open: `goal_${task.id}`,
    });
  }
  for (const habit of activeHabits(d.habits)) {
    const tm = parseTime(habit.time);
    if (!tm || habit.days.length === 0) continue;
    items.push({
      id: `h_${habit.id}`,
      text: `${habit.icon} ${t('notif.msg.habit', { title: habit.title })}`.slice(0, 300),
      hour: tm.hour,
      minute: tm.minute,
      days: habit.days,
      open: 'habits',
    });
  }
  const upcoming = d.plans
    .filter((p) => !p.doneAt && p.day >= today && parseTime(p.time))
    .sort((a, b) => a.day.localeCompare(b.day) || a.time!.localeCompare(b.time!))
    .slice(0, 24);
  for (const plan of upcoming) {
    const tm = parseTime(plan.time)!;
    const task = d.tasks.find((x) => x.id === plan.taskId);
    items.push({
      id: `p_${plan.id}`,
      text: `${plan.icon ?? '🗓️'} ${t('notif.msg.task', { title: planTitle(plan, task) })}`.slice(0, 300),
      hour: tm.hour,
      minute: tm.minute,
      date: plan.day,
      open: 'tasks',
    });
  }
  // The focus session on the clock: a word from the bot a minute after it ends, in case the app is
  // not open then to count it (the app sends the list again without it once the session is counted).
  const run = useFocus.getState().run;
  if (run?.endsAt && run.endsAt > Date.now()) {
    const at = new Date(Math.ceil((run.endsAt + 60_000) / 60_000) * 60_000);
    const pause = run.mode === 'break';
    items.unshift({
      id: 'focus',
      text: `${pause ? '🍵' : '🎯'} ${t(pause ? 'notif.msg.break' : 'notif.msg.focus')}`,
      hour: at.getHours(),
      minute: at.getMinutes(),
      date: dayKey(at.getTime()),
      open: 'focus',
    });
  }
  // The journal: a question on each of the next seven evenings. They are one-off reminders, so writing
  // today takes today's away, and after a week without opening the app the bot stops asking.
  const ask = parseTime(d.settings.journalAt);
  if (ask) {
    const now = new Date();
    const late = now.getHours() * 60 + now.getMinutes() >= ask.hour * 60 + ask.minute;
    const evenings: ReminderItem[] = [];
    for (let i = 0; i < 7; i++) {
      if (i === 0 && (late || wroteOn(d.pages, today))) continue;
      const day = shiftDay(today, i);
      evenings.push({ id: `j_${day}`, text: `📝 ${t('notif.msg.journal')}`, hour: ask.hour, minute: ask.minute, date: day, open: 'write' });
    }
    items.unshift(...evenings);
  }
  // First in the list, so the cap below can never be what leaves it out.
  const letter = weekLetterItem(d);
  if (letter) items.unshift(letter);
  return items.slice(0, 60);
}

/**
 * Prayer reminders. The bot works out the times itself (the same calculation as the app), so the
 * messages carry "{time}" for it to fill in.
 */
export function prayerReminders(s: Settings): Record<string, unknown> {
  const place = s.place;
  const prayers = alertPrayers(s);
  if (!s.prayerAlerts || !place || prayers.length === 0) return { enabled: false };
  const { method, asr } = resolveMethod(s, place.tz);
  const before = s.prayerBefore ?? 0;
  return {
    enabled: true, lat: place.lat, lon: place.lon, tz: place.tz, method, asr, before,
    items: prayers.map((key) => {
      const name = t(`prayer.${key}`);
      const text = before ? t('notif.msg.prayerSoon', { name, n: before }) : t('notif.msg.prayer', { name });
      return { key, text: `${TIME_EMOJI[key]} ${text}` };
    }),
  };
}

async function pushReminders(d: Data): Promise<boolean> {
  try {
    const res = await api<{ ok: boolean; canMessage: boolean }>('PUT', '/reminders', {
      enabled: d.settings.reminders,
      tz: timeZone(),
      lang: getLang(),
      openLabel: t('notif.msg.open'),
      lastActiveDay: d.profile.streak.lastDay ?? null,
      nudge: { ...d.profile.nudge, text: `🔥 ${t('notif.msg.nudge')}` },
      items: d.settings.reminders ? buildReminders(d) : [],
      prayer: d.settings.reminders ? prayerReminders(d.settings) : { enabled: false },
    });
    useServer.setState({ canMessage: res.canMessage });
    return true;
  } catch {
    return false;
  }
}

/** The phone app: the same reminders, as the phone's own notifications. Nothing leaves the phone. */
async function pushPhone(d: Data): Promise<void> {
  const on = d.settings.reminders;
  const prayer = on ? prayerReminders(d.settings) : { enabled: false };
  const nudge = on && d.profile.nudge.enabled
    ? { hour: d.profile.nudge.hour, minute: d.profile.nudge.minute, text: `🔥 ${t('notif.msg.nudge')}`, lastActiveDay: d.profile.streak.lastDay ?? null }
    : null;
  await applyOnPhone(plan(on ? buildReminders(d) : [], prayer.enabled ? (prayer as unknown as PhonePrayers) : null, nudge));
  useServer.setState({ canMessage: await notificationsAllowed() });
}

async function pushActivity(d: Data): Promise<void> {
  const week = weekStartMs();
  // The last day something earned XP, when that is today or yesterday: what buddy streaks count.
  const activeDay = reportableDay(d.profile.streak.lastDay, dayKey());
  try {
    await api('POST', '/activity', {
      lastActiveDay: d.profile.streak.lastDay ?? dayKey(),
      totalXp: provenXp(d.entries),
      // All of it, proof or not: what the level is worked out from (the owner's panel shows it).
      xp: Math.round(d.profile.xp),
      weekXp: provenXp(d.entries, week),
      weekStart: week,
      level: levelInfo(d.profile.xp).level,
      streak: visibleStreak(d.profile.streak, d.profile.freezes),
      counters: counters(d),
      activeDay,
    });
    if (activeDay) activeDayReported(activeDay);
  } catch {
    // the rankings simply stay as they were
  }
}

/** Sends the score now (the challenge board asks for it before it loads, so your own row is current). */
export function syncActivity(): Promise<void> {
  return useServer.getState().status === 'ok' ? pushActivity(snapshot()) : Promise.resolve();
}

/**
 * Turns bot reminders on: asks Telegram for permission to message the user, then sends the schedule.
 * Returns why it could not, when it could not.
 */
export async function enableReminders(): Promise<'ok' | 'denied' | 'off'> {
  if (isNative) {
    if (!(await requestWriteAccess())) return 'denied';
    useStore.getState().setSettings({ reminders: true });
    await askExactAlarms();
    await pushPhone(snapshot());
    return 'ok';
  }
  if (useServer.getState().status !== 'ok') return 'off';
  // In a browser the bot may write once the user has started it (signing in does that).
  const allowed = inTelegram ? await requestWriteAccess() : useServer.getState().canMessage;
  if (!allowed) return 'denied';
  useStore.getState().setSettings({ reminders: true });
  await pushReminders(snapshot());
  return 'ok';
}

export function disableReminders(): void {
  useStore.getState().setSettings({ reminders: false });
  void (isNative ? pushPhone(snapshot()) : pushReminders(snapshot()));
}

const PRAYER_KEYS = ['prayerAlerts', 'prayerAlertList', 'prayerBefore', 'jumuah', 'place', 'prayerMethod', 'asr'] as const;
const samePrayerSettings = (a: Settings, b: Settings): boolean => PRAYER_KEYS.every((key) => a[key] === b[key]);

/** Mount once. Says hello, then re-sends reminders and the score a moment after anything relevant changes. */
export function useServerSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // What the next send carries: the reminders, the score (rankings and friend challenges), or both.
    let want = { reminders: false, activity: false };
    const send = () => {
      const what = want;
      want = { reminders: false, activity: false };
      if (isNative && what.reminders) void pushPhone(snapshot());
      if (useServer.getState().status !== 'ok') return;
      const d = snapshot();
      // The phone shows its own notifications; only the Mini App has the bot send them.
      if (what.reminders && !isNative) void pushReminders(d);
      if (what.activity) void pushActivity(d);
    };
    const schedule = (reminders: boolean, activity: boolean, ms: number) => {
      want = { reminders: want.reminders || reminders, activity: want.activity || activity };
      clearTimeout(timer);
      timer = setTimeout(send, ms);
    };
    void useServer.getState().hello(timeZone(), getLang()).then(() => {
      want = { reminders: true, activity: true };
      send();
      void fetchDaily();
    });
    // Back in the app on a new day, or with a part still missing: ask for the day's ayah and hadith.
    const onShow = () => {
      if (!document.hidden) void fetchDaily();
      // A new day moves the one-off reminders (journal, nudge, prayer times) a day on.
      if (!document.hidden && isNative) schedule(true, false, 500);
    };
    document.addEventListener('visibilitychange', onShow);

    // The weekly letter as the bot has it. Its words move with things the lists below do not watch (a
    // prayer ticked, a page of Qurʼan read), so the words themselves are compared: a change that does
    // not show in the letter sends nothing, and one that does goes out with the usual wait.
    const letterOf = (d: Data): string => {
      const item = d.settings.reminders ? weekLetterItem(d) : null;
      return item ? `${item.id} ${item.text}` : '';
    };
    let letter = letterOf(snapshot());

    const off = useStore.subscribe((s, prev) => {
      const letterNow = letterOf(snapshot(s));
      const rewritten = letterNow !== letter;
      letter = letterNow;
      const reminders = rewritten || !(
        s.tasks === prev.tasks && s.habits === prev.habits && s.plans === prev.plans && s.entries === prev.entries &&
        s.checks === prev.checks && s.profile.nudge === prev.profile.nudge && s.settings.reminders === prev.settings.reminders &&
        s.settings.lang === prev.settings.lang && samePrayerSettings(s.settings, prev.settings) &&
        s.settings.journalAt === prev.settings.journalAt &&
        // The journal's question for tonight goes away once today is written (and comes back if that is undone).
        (s.pages === prev.pages || wroteOn(s.pages, dayKey()) === wroteOn(prev.pages, dayKey()))
      );
      // Prayers marked, Qurʼan pages and focus minutes move challenge scores without touching the reminders.
      const activity =
        reminders || s.worship !== prev.worship || s.profile.xp !== prev.profile.xp ||
        s.profile.quranPages !== prev.profile.quranPages || s.profile.focus !== prev.profile.focus;
      if (activity) schedule(reminders, true, 2500);
    });
    // Starting, pausing or finishing a focus session changes the bot's message about it.
    const offFocus = useFocus.subscribe((s, prev) => {
      if (s.run !== prev.run) schedule(true, false, 1000);
    });
    return () => {
      off();
      offFocus();
      document.removeEventListener('visibilitychange', onShow);
      clearTimeout(timer);
    };
  }, []);
}
