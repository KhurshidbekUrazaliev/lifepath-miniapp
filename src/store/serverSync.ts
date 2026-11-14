// Keeps the bot's server in step with the app: who the user is, which reminders to send,
// and the score that the rankings show. All of it is optional; the app works without it.
import { useEffect } from 'react';
import { useStore, snapshot } from './store';
import { api, useServer } from './server';
import { Data, provenXp } from '../lib/stats';
import { activeHabits } from '../lib/habits';
import { levelInfo, visibleStreak } from '../lib/gamify';
import { weekStartMs } from '../lib/rankings';
import { parseTime } from '../lib/calendar';
import { dayKey } from '../lib/dates';
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
  return items.slice(0, 60);
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
      weekXp: provenXp(d.entries, week),
      weekStart: week,
      level: levelInfo(d.profile.xp).level,
      streak: visibleStreak(d.profile.streak, d.profile.freezes),
    });
  } catch {
    // the rankings simply stay as they were
  }
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

/** Mount once. Says hello, then re-sends reminders and the score a moment after anything relevant changes. */
export function useServerSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (useServer.getState().status !== 'ok') return;
      const d = snapshot();
      void pushReminders(d);
      void pushActivity(d);
    };
    void useServer.getState().hello(timeZone(), getLang()).then(send);

    const off = useStore.subscribe((s, prev) => {
      if (
        s.tasks === prev.tasks && s.habits === prev.habits && s.plans === prev.plans && s.entries === prev.entries &&
        s.checks === prev.checks && s.profile.nudge === prev.profile.nudge && s.settings.reminders === prev.settings.reminders &&
        s.settings.lang === prev.settings.lang
      ) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(send, 2500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
}
