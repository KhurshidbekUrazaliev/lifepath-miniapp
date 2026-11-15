// Keeps the bot's server in step with the app: who the user is, which reminders to send,
// and the score that the rankings show. All of it is optional; the app works without it.
import { useEffect } from 'react';
import { useStore, snapshot } from './store';
import { useFocus } from './focus';
import { api, useServer } from './server';
import { Data, provenXp } from '../lib/stats';
import { activeHabits } from '../lib/habits';
import { levelInfo, visibleStreak } from '../lib/gamify';
import { weekStartMs } from '../lib/rankings';
import { parseTime } from '../lib/calendar';
import { dayKey } from '../lib/dates';
import { TIME_EMOJI, alertPrayers, resolveMethod } from '../lib/prayer';
import { counters } from '../lib/challenges';
import type { Settings } from '../lib/types';
import { getLang, t } from '../i18n';
import { requestWriteAccess } from '../tg/telegram';
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

async function pushActivity(d: Data): Promise<void> {
  const week = weekStartMs();
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
    });
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
  if (useServer.getState().status !== 'ok') return 'off';
  const allowed = await requestWriteAccess();
  if (!allowed) return 'denied';
  useStore.getState().setSettings({ reminders: true });
  await pushReminders(snapshot());
  return 'ok';
}

export function disableReminders(): void {
  useStore.getState().setSettings({ reminders: false });
  void pushReminders(snapshot());
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
      if (useServer.getState().status !== 'ok') return;
      const d = snapshot();
      if (what.reminders) void pushReminders(d);
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
    });

    const off = useStore.subscribe((s, prev) => {
      const reminders = !(
        s.tasks === prev.tasks && s.habits === prev.habits && s.plans === prev.plans && s.entries === prev.entries &&
        s.checks === prev.checks && s.profile.nudge === prev.profile.nudge && s.settings.reminders === prev.settings.reminders &&
        s.settings.lang === prev.settings.lang && samePrayerSettings(s.settings, prev.settings)
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
      clearTimeout(timer);
    };
  }, []);
}
