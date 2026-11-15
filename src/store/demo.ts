// Example data: a few weeks of a believable, made-up life, built with the same rules real logs use.
// It belongs to nobody in particular: everyday goals, habits and times that suit most people.
import { Checks, Entry, Folder, Habit, Khatm, Plan, Profile, Task } from '../lib/types';
import { Data } from '../lib/stats';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { templateById } from '../lib/templates';
import { XP, levelInfo, sparksFor, xpForLog } from '../lib/gamify';
import { evidenceBonus } from '../lib/evidence';
import { HABIT_XP, isDue, shiftDay, withCheck } from '../lib/habits';
import { earnedBadges } from '../lib/achievements';
import { Key, t } from '../i18n';
import { PAGE_XP } from '../lib/khatm';
import { initialProfile, uid } from './store';
import { PRAYERS, WORSHIP_XP } from '../lib/prayer';

/** Small seeded generator so the example looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildDemo(current: Data): Data {
  const rand = rng(20261114);
  const today = dayKey();
  const now = Date.now();
  const at = (day: string, hour: number, minute = 0) => dayKeyToMs(day, hour, minute);

  // A made-up person with everyday goals (nobody's real plans or schedule).
  const area = (templateId: string, daysAgo: number): Folder => {
    const tpl = templateById(templateId);
    return {
      id: uid(), name: t(`tpl.${templateId}.name` as Key), icon: tpl.icon, color: tpl.color, templateId, progressType: tpl.progressType,
      unit: t(`tpl.${templateId}.unit` as Key), createdAt: at(shiftDay(today, -daysAgo), 9),
    };
  };
  const reading = area('reading', 30);
  const study = area('study', 28);
  const fitness = area('gym', 28);
  const languages = area('languages', 20);

  const goal = (folder: Folder, title: string, patch: Partial<Task>): Task => ({
    id: uid(), folderId: folder.id, title, progressType: folder.progressType, target: 10, unit: folder.unit,
    milestones: [], resources: [], createdAt: folder.createdAt + 3600_000, ...patch,
  });
  const books = goal(reading, t('demo.read'), { target: 1000 });
  const course = goal(study, t('demo.course'), {
    target: 1200, deadline: at(shiftDay(today, 40), 12), reminder: { hour: 19, minute: 30, days: [2, 3, 4, 5, 6] },
  });
  const shape = goal(fitness, t('demo.shape'), { target: 12 });
  const language = goal(languages, t('demo.lang'), {
    target: 0,
    milestones: ['demo.lang.s1', 'demo.lang.s2', 'demo.lang.s3', 'demo.lang.s4', 'demo.lang.s5'].map((k, i) => ({
      id: uid(), title: t(k as Key), done: i === 0, doneAt: i === 0 ? at(shiftDay(today, -6), 20) : undefined,
    })),
  });
  const tasks = [books, course, shape, language];

  // Logs over the last three weeks, with a streak that is still alive today.
  const entries: Entry[] = [];
  let xp = 0;
  let sparks = 0;
  const streakDays = 12;
  const log = (task: Task, day: string, hour: number, amount: number, streak: number, proven: boolean) => {
    let earned = xpForLog(task, amount, streak);
    const entry: Entry = { id: uid(), taskId: task.id, at: at(day, hour, Math.floor(rand() * 50)), amount, xp: earned, trust: 'quick' };
    if (proven) {
      earned += evidenceBonus(earned);
      entry.xp = earned;
      entry.trust = 'evidence';
      entry.evidence = { summary: t('demo.proof'), at: entry.at };
      sparks += sparksFor(earned);
    }
    xp += earned;
    entries.push(entry);
  };
  for (let back = 23; back >= 0; back--) {
    const day = shiftDay(today, -back);
    const streak = back < streakDays ? streakDays - back : 0;
    const active = back < streakDays || rand() > 0.35;
    if (!active) continue;
    if (rand() > 0.3) log(books, day, 22, 10 + Math.floor(rand() * 20), streak, rand() > 0.6);
    if (rand() > 0.35 && back > 0) log(course, day, 20, [25, 30, 45, 60][Math.floor(rand() * 4)], streak, rand() > 0.5);
    if (back % 3 === 1) log(shape, day, 7, 1, streak, rand() > 0.5);
  }
  xp += XP.milestone;
  entries.push({ id: uid(), taskId: language.id, at: language.milestones[0].doneAt!, amount: 0, note: `✓ ${language.milestones[0].title}`, xp: XP.milestone, trust: 'quick' });
  entries.sort((a, b) => a.at - b.at);

  // Habits, ticked most days.
  const habit = (key: string, icon: string, color: string, time?: string): Habit => ({
    id: uid(), title: t(key as Key), icon, color, days: [1, 2, 3, 4, 5, 6, 7], time, createdAt: at(shiftDay(today, -30), 8),
  });
  const habits: Habit[] = [
    habit('habit.s.water', '💧', '#0EA5E9'),
    habit('habit.s.stretch', '🧘', '#A855F7', '07:00'),
    habit('habit.s.read', '📚', '#F59E0B'),
    habit('habit.s.walk', '🚶', '#22C55E'),
    habit('habit.s.dhikr', '📿', '#14B8A6'),
    habit('habit.s.family', '📞', '#E11D48'),
    habit('habit.s.plan', '🗓️', '#6C63FF', '21:30'),
  ];
  let checks: Checks = {};
  const doneToday = new Set([0, 1, 4]);
  habits.forEach((h, i) => {
    for (let back = 29; back >= 0; back--) {
      const day = shiftDay(today, -back);
      if (!isDue(h, day)) continue;
      const on = back === 0 ? doneToday.has(i) : i === 0 && back < 13 ? true : rand() > 0.2 + i * 0.03;
      if (on) {
        checks = withCheck(checks, h.id, day, true);
        xp += HABIT_XP;
      }
    }
  });

  // A Qurʼan khatm on day ten of a 30-day plan, right on schedule (60 pages of XP a day at most).
  const khatm: Khatm = { start: shiftDay(today, -9), days: 30, page: 182, best: 182 };
  xp += khatm.best * PAGE_XP;

  // Prayers: nearly all of the last two weeks, today up to Dhuhr.
  let worship: Checks = {};
  for (let back = 13; back >= 0; back--) {
    const day = shiftDay(today, -back);
    for (const p of PRAYERS) {
      const on = back === 0 ? p === 'fajr' || p === 'dhuhr' : back < 6 || rand() > 0.15;
      if (on) {
        worship = withCheck(worship, p, day, true);
        xp += WORSHIP_XP[p];
      }
    }
  }

  // To-dos: some finished, some waiting for tonight and tomorrow.
  const plans: Plan[] = [];
  const todo = (title: string, icon: string, day: string, time: string | undefined, task?: Task, done?: number): Plan => {
    const p: Plan = { id: uid(), taskId: task?.id, title, icon, day, time, createdAt: at(shiftDay(day, -1), 10), doneAt: done };
    plans.push(p);
    return p;
  };
  for (let back = 9; back >= 1; back--) {
    const day = shiftDay(today, -back);
    if (back % 2 === 0) todo(t('demo.task.course'), '💻', day, '19:30', course, at(day, 20, 15));
    if (back % 3 === 0) todo(t('demo.task.gym'), '🏋️', day, '07:00', shape, at(day, 7, 50));
    if (back % 4 === 0) todo(t('demo.task.read'), '📚', day, '22:00', books, back === 4 ? undefined : at(day, 22, 30));
  }
  todo(t('demo.task.gym'), '🏋️', today, '07:00', shape, at(today, 7, 55));
  todo(t('demo.task.call'), '📞', today, '18:00', undefined);
  todo(t('demo.task.course'), '💻', today, '19:30', course);
  todo(t('demo.task.read'), '📚', today, '22:00', books);
  todo(t('demo.task.vocab'), '🗣️', shiftDay(today, 1), '09:00', language);
  todo(t('demo.task.shop'), '🛒', shiftDay(today, 2), undefined);

  const base: Profile = {
    ...initialProfile,
    name: current.profile.name,
    haptics: current.profile.haptics,
    xp,
    sparks,
    streak: { current: streakDays, best: 14, lastDay: today },
    freezes: 1,
    questDay: today,
    khatm,
    quranPages: khatm.best,
    echo: { name: t('demo.echo'), skin: 1, hair: 0, bornAt: at(shiftDay(today, -24), 9) },
  };
  const data = { folders: [reading, study, fitness, languages], tasks, entries, plans, habits, checks, worship, profile: base };
  const achievements: Record<string, number> = {};
  for (const id of earnedBadges(data)) achievements[id] = now - Math.floor(rand() * 20) * 86400_000;
  void levelInfo;
  return { ...data, profile: { ...base, achievements }, settings: { ...current.settings, onboarded: true } };
}
