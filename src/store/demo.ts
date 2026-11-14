// Example data: a few weeks of a believable life, built with the same rules real logs use.
import { Checks, Entry, Folder, Habit, Plan, Profile, Task } from '../lib/types';
import { Data } from '../lib/stats';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { templateById } from '../lib/templates';
import { XP, levelInfo, sparksFor, xpForLog } from '../lib/gamify';
import { evidenceBonus } from '../lib/evidence';
import { HABIT_XP, isDue, shiftDay, withCheck } from '../lib/habits';
import { earnedBadges } from '../lib/achievements';
import { t } from '../i18n';
import { initialProfile, uid } from './store';

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

  const area = (templateId: string, name: string, daysAgo: number): Folder => {
    const tpl = templateById(templateId);
    return {
      id: uid(), name, icon: tpl.icon, color: tpl.color, templateId, progressType: tpl.progressType,
      unit: tpl.unit, createdAt: at(shiftDay(today, -daysAgo), 9),
    };
  };
  const quran = area('quran', t('tpl.quran.name'), 30);
  const study = area('study', t('tpl.study.name'), 28);
  const fitness = area('gym', t('tpl.gym.name'), 28);
  const languages = area('languages', t('tpl.languages.name'), 20);

  const goal = (folder: Folder, title: string, patch: Partial<Task>): Task => ({
    id: uid(), folderId: folder.id, title, progressType: folder.progressType, target: 10, unit: folder.unit,
    milestones: [], resources: [], createdAt: folder.createdAt + 3600_000, ...patch,
  });
  const hafiz = goal(quran, t('demo.hafiz'), { target: 30, unit: t('demo.hafiz.unit'), deadline: at(shiftDay(today, 200), 12) });
  const tafsir = goal(quran, t('demo.tafsir'), { target: 300, unit: t('tpl.quran.unit') });
  const python = goal(study, t('demo.python'), {
    target: 1200, deadline: at(shiftDay(today, 40), 12), reminder: { hour: 21, minute: 0, days: [2, 3, 4, 5, 6] },
  });
  const shape = goal(fitness, t('demo.shape'), { target: 12 });
  const korean = goal(languages, t('demo.korean'), {
    target: 0,
    milestones: ['demo.korean.s1', 'demo.korean.s2', 'demo.korean.s3', 'demo.korean.s4', 'demo.korean.s5'].map((k, i) => ({
      id: uid(), title: t(k as 'demo.korean.s1'), done: i === 0, doneAt: i === 0 ? at(shiftDay(today, -6), 20) : undefined,
    })),
    resources: [{ id: uid(), title: 'Talk To Me In Korean', url: 'https://talktomeinkorean.com' }],
  });
  const tasks = [hafiz, tafsir, python, shape, korean];

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
  // Seven juz were memorized before the app, entered as one starting log.
  log(hafiz, shiftDay(today, -24), 8, 16, 0, true);
  for (let back = 23; back >= 0; back--) {
    const day = shiftDay(today, -back);
    const streak = back < streakDays ? streakDays - back : 0;
    const active = back < streakDays || rand() > 0.35;
    if (!active) continue;
    if (back % 5 === 2) log(hafiz, day, 6, 1, streak, rand() > 0.4);
    if (rand() > 0.3 && back > 0) log(python, day, 21, [30, 45, 60, 25][Math.floor(rand() * 4)], streak, rand() > 0.6);
    if (rand() > 0.45) log(tafsir, day, 22, 4 + Math.floor(rand() * 8), streak, false);
    if (back % 4 === 1) log(shape, day, 19, 1, streak, rand() > 0.5);
  }
  xp += XP.milestone;
  entries.push({ id: uid(), taskId: korean.id, at: korean.milestones[0].doneAt!, amount: 0, note: `✓ ${korean.milestones[0].title}`, xp: XP.milestone, trust: 'quick' });
  entries.sort((a, b) => a.at - b.at);

  // Habits, ticked most days.
  const habit = (key: string, icon: string, color: string, time?: string): Habit => ({
    id: uid(), title: t(key as 'habit.s.quran'), icon, color, days: [1, 2, 3, 4, 5, 6, 7], time, createdAt: at(shiftDay(today, -30), 8),
  });
  const habits: Habit[] = [
    habit('habit.s.quran', '📖', '#10B981', '06:00'),
    habit('habit.s.workout', '💪', '#FF6B5B'),
    habit('habit.s.water', '💧', '#0EA5E9'),
    habit('habit.s.dhikr', '📿', '#A855F7'),
    habit('habit.s.language', '🗣️', '#14B8A6'),
    habit('habit.s.code', '💻', '#3B82F6', '21:00'),
    habit('habit.s.sleep', '🌙', '#6C63FF'),
  ];
  let checks: Checks = {};
  const doneToday = new Set([0, 1, 2, 5]);
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

  // To-dos: some finished, some waiting for tonight and tomorrow.
  const plans: Plan[] = [];
  const todo = (title: string, icon: string, day: string, time: string | undefined, task?: Task, done?: number): Plan => {
    const p: Plan = { id: uid(), taskId: task?.id, title, icon, day, time, createdAt: at(shiftDay(day, -1), 10), doneAt: done };
    plans.push(p);
    return p;
  };
  for (let back = 9; back >= 1; back--) {
    const day = shiftDay(today, -back);
    if (back % 2 === 0) todo(t('demo.task.python'), '💻', day, '21:00', python, at(day, 21, 40));
    if (back % 3 === 0) todo(t('demo.task.gym'), '🏋️', day, '19:00', shape, at(day, 20, 10));
    if (back % 4 === 0) todo(t('demo.task.memorize'), '📖', day, '06:00', hafiz, back === 4 ? undefined : at(day, 6, 30));
  }
  todo(t('demo.task.gym'), '🏋️', today, '07:30', shape, at(today, 8, 20));
  todo(t('demo.task.memorize'), '📖', today, '20:00', hafiz);
  todo(t('demo.task.python'), '💻', today, '21:00', python);
  todo(t('demo.tafsir'), '📚', today, '22:00', tafsir);
  todo(t('demo.task.vocab'), '🇰🇷', shiftDay(today, 1), '09:00', korean);
  todo(t('demo.task.water'), '🧴', shiftDay(today, 2), undefined);

  const base: Profile = {
    ...initialProfile,
    name: current.profile.name,
    haptics: current.profile.haptics,
    xp,
    sparks,
    streak: { current: streakDays, best: 14, lastDay: today },
    freezes: 1,
    questDay: today,
    echo: { name: t('demo.echo'), skin: 1, hair: 0, bornAt: at(shiftDay(today, -24), 9) },
  };
  const data = { folders: [quran, study, fitness, languages], tasks, entries, plans, habits, checks, profile: base };
  const achievements: Record<string, number> = {};
  for (const id of earnedBadges(data)) achievements[id] = now - Math.floor(rand() * 20) * 86400_000;
  void levelInfo;
  return { ...data, profile: { ...base, achievements }, settings: { ...current.settings, onboarded: true } };
}
