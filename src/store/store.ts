// All app data and the actions that change it. Ported from LifePath v0.8 (src/store.ts) and extended
// with daily habits and stand-alone to-dos. The rules themselves live in src/lib (pure, tested).
import { create } from 'zustand';
import {
  Checks, EchoProfile, Entry, EvidenceInput, Feeling, Folder, Habit, Milestone, NudgeSettings, Page, Plan, Profile, ProgressType,
  Reminder, Resource, Settings, Task,
} from '../lib/types';
import { dayKey } from '../lib/dates';
import { computeProgress, loggedToday } from '../lib/progress';
import { XP, applyActivity, levelInfo, sparksFor, streakMultiplier, visibleStreak, xpForLog } from '../lib/gamify';
import { TOP_STAGE, growthFor } from '../lib/companion';
import { BuyCheck, Slot, canBuy, earnedItems, isOwned, itemById } from '../lib/wardrobe';
import { cleanEvidence, evidenceBonus, evidenceState, sparksForAward, sparksGranted } from '../lib/evidence';
import { HABIT_XP, TODO_XP, isChecked, withCheck, withoutHabit } from '../lib/habits';
import { EventBadge, earnedBadges } from '../lib/achievements';
import { Data } from '../lib/stats';
import { WORSHIP_XP, WorshipKey } from '../lib/prayer';
import { newKhatm, readTo } from '../lib/khatm';
import { addSession, focusToday, focusXp } from '../lib/focus';
import { JOURNAL_XP, TEXT_LIMIT, TITLE_LIMIT, isBlank, isNote, liveFacts, paidOn, toggleItem } from '../lib/journal';
import { useServer } from './server';
import { rememberSpecial } from '../lib/special';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Something worth celebrating. The UI turns these into toasts, confetti and haptics. */
export type Celebration = { id: string } & (
  | { kind: 'xp'; xp: number; from: 'log' | 'proof' | 'habit' | 'todo' | 'milestone' | 'prayer' | 'fast' | 'adhkar' | 'quran' | 'focus' | 'journal'; sparks?: number }
  | { kind: 'complete'; title: string; xp: number }
  | { kind: 'levelup'; level: number }
  | { kind: 'achievement'; badge: string }
  | { kind: 'item'; item: string }
  | { kind: 'khatm'; n: number }
  | { kind: 'streak'; days: number; freezeUsed?: boolean; freezeEarned?: boolean }
);

export interface LogResult {
  xp: number;
  completed: boolean;
  levelUp?: number;
  streakIncreased: boolean;
  questBonus: boolean;
  verified: boolean;
  bonus: number;
  pendingSparks: number;
}

export type AttachResult = { ok: true; bonus: number; sparks: number } | { ok: false; reason: 'invalid' | 'expired' | 'missing' | 'already' };

export interface NewFolderInput {
  name: string;
  icon: string;
  color: string;
  templateId: string;
  progressType: ProgressType;
  unit: string;
}

export interface NewTaskInput {
  folderId: string;
  title: string;
  progressType: ProgressType;
  target: number;
  unit: string;
  deadline?: number;
  milestones: string[];
  resources: { title: string; url?: string }[];
}

export interface NewPlanInput {
  taskId?: string;
  title?: string;
  icon?: string;
  day: string;
  time?: string;
  note?: string;
}

/** What the writing page hands over. With an id it changes that page; without one it starts a new page. */
export interface PageInput {
  id?: string;
  kind?: 'note';
  /** The day a diary entry is about (today when left out). An entry that has earned its XP keeps its day. */
  day?: string;
  title?: string;
  text: string;
  mood?: Feeling;
  pin?: boolean;
  color?: number;
  /** The question it answers; '' takes the question away, leaving it out keeps the one it has. */
  ask?: string;
}

export interface NewHabitInput {
  title: string;
  icon: string;
  color: string;
  days: number[];
  time?: string;
}

export const initialProfile: Profile = {
  name: '',
  xp: 0,
  sparks: 0,
  streak: { current: 0, best: 0 },
  freezes: 0,
  dailyGoalXp: 30,
  haptics: true,
  achievements: {},
  nudge: { enabled: false, hour: 21, minute: 0 },
};

export const defaultSettings: Settings = {
  lang: 'auto',
  theme: 'auto',
  verse: true,
  fullscreen: true,
  reminders: false,
  onboarded: false,
};

export const emptyData = (): Data => ({
  folders: [], tasks: [], entries: [], plans: [], habits: [], checks: {}, worship: {}, pages: [], profile: initialProfile, settings: defaultSettings,
});

interface State extends Data {
  celebrations: Celebration[]; // transient, never saved

  createFolder: (input: NewFolderInput) => string;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;

  createTask: (input: NewTaskInput) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;

  logProgress: (taskId: string, amount: number, note?: string, evidence?: EvidenceInput, planId?: string) => LogResult | null;
  attachEvidence: (entryId: string, input: EvidenceInput) => AttachResult;
  deleteEntry: (entryId: string) => void;
  toggleMilestone: (taskId: string, milestoneId: string) => void;
  addMilestone: (taskId: string, title: string) => void;
  removeMilestone: (taskId: string, milestoneId: string) => void;
  addResource: (taskId: string, title: string, url?: string) => void;
  removeResource: (taskId: string, resourceId: string) => void;
  setReminder: (taskId: string, reminder: Reminder | undefined) => void;

  addPlan: (input: NewPlanInput) => string;
  updatePlan: (id: string, patch: Partial<Plan>) => void;
  deletePlan: (id: string) => void;
  /** Checks or unchecks a to-do. A stand-alone one pays a little XP; one tied to a goal is paid by its log. */
  togglePlanDone: (id: string) => void;

  createHabit: (input: NewHabitInput) => string;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  archiveHabit: (id: string) => void;
  deleteHabit: (id: string) => void;
  toggleHabit: (habitId: string, day?: string) => void;
  /** Ticks or clears a prayer, a fast or the adhkar for a day; pays (or takes back) its XP. */
  toggleWorship: (key: WorshipKey, day?: string) => void;
  /** Starts a khatm plan (replacing the one under way), counting `page` pages as already read. */
  startKhatm: (days: number, page?: number) => void;
  /** Changes how many days the khatm plan takes; the pages read stay. */
  setKhatmDays: (days: number) => void;
  /** Moves the khatm bookmark. New pages pay XP (capped per day); the last page finishes the khatm. */
  readQuran: (page: number) => void;
  /**
   * Counts a finished focus session: its minutes are logged on the timed goal it was for (with that
   * log's XP), or else earn focus XP. Returns the XP it brought.
   */
  finishFocus: (minutes: number, taskId?: string, note?: string) => number;

  /**
   * Saves a page of the journal and returns its id. A page with no title, no words and no feeling is
   * not kept (null). `finish` is for the moment the writer leaves the page: the first diary entry of
   * today then earns its XP and counts as today's activity. While they are still writing, nothing is paid.
   */
  savePage: (input: PageInput, finish?: boolean) => string | null;
  deletePage: (id: string) => void;
  /** Ticks or unticks the list item on one line of a page. */
  tickItem: (id: string, line: number) => void;

  /**
   * XP for a juz marked read in a group khatm, once the bot's server has accepted the mark (it decides
   * how much). A mark taken back comes as a negative number, and the XP goes back.
   */
  payJuz: (xp: number) => void;

  setNudge: (patch: Partial<NudgeSettings>) => void;
  saveEcho: (input: { name: string; skin: number; hair: number; gender: 'boy' | 'girl' }) => void;
  buyItem: (itemId: string) => BuyCheck;
  wearItem: (slot: Slot, itemId: string) => void;
  setName: (name: string) => void;
  setDailyGoal: (xp: number) => void;
  toggleHaptics: () => void;
  setSettings: (patch: Partial<Settings>) => void;

  dismissCelebration: (id: string) => void;
  /** For the badges the data cannot show (friend challenges). */
  unlockBadge: (id: EventBadge) => void;
  /** Replaces all data at once (cloud sync, demo data, restore). */
  replaceData: (data: Data) => void;
  resetAll: () => void;
}

type Core = Pick<State, 'profile' | 'tasks' | 'entries' | 'folders' | 'habits' | 'checks' | 'worship' | 'pages' | 'plans' | 'settings'>;

/** Adds XP (and Sparks) to the profile and finds the level-ups and badges that follow. */
function award(s: Core, xp: number, patch: Partial<Profile> = {}, sparks: number = sparksFor(xp)) {
  const before = levelInfo(s.profile.xp).level;
  const profile: Profile = { ...s.profile, ...patch, xp: s.profile.xp + xp, sparks: s.profile.sparks + sparks };
  const celebrations: Celebration[] = [];
  const after = levelInfo(profile.xp).level;
  let levelUp: number | undefined;
  if (after > before) {
    levelUp = after;
    celebrations.push({ id: uid(), kind: 'levelup', level: after });
  }
  if (xp > 0) profile.specialDays = rememberSpecial(profile.specialDays, dayKey(), s.settings.hijriOffset);
  const gifts = earnedItems({ ...s, profile });
  if (gifts.length) {
    profile.owned = [...(profile.owned ?? []), ...gifts];
    celebrations.push(...gifts.map((item): Celebration => ({ id: uid(), kind: 'item', item })));
  }
  const achievements = { ...profile.achievements };
  for (const id of earnedBadges({ ...s, profile })) {
    if (!achievements[id]) {
      achievements[id] = Date.now();
      celebrations.push({ id: uid(), kind: 'achievement', badge: id });
    }
  }
  profile.achievements = achievements;
  return { profile, celebrations, levelUp };
}

/** Counts today as an active day. Returns the profile fields to merge and a toast when the streak grew. */
function activity(profile: Profile, today: string) {
  const st = applyActivity(profile.streak, profile.freezes, today);
  const toast: Celebration[] =
    st.increased && st.streak.current >= 2
      ? [{ id: uid(), kind: 'streak', days: st.streak.current, freezeUsed: st.usedFreeze, freezeEarned: st.earnedFreeze }]
      : [];
  return { st, patch: { streak: st.streak, freezes: st.freezes }, toast };
}

const mapTask = (tasks: Task[], id: string, fn: (t: Task) => Task): Task[] => tasks.map((t) => (t.id === id ? fn(t) : t));

/** Logging a goal ticks off its to-dos for today (and the one the log was started from). */
function settlePlans(plans: Plan[], taskId: string, today: string, planId?: string): Plan[] {
  return plans.map((p) =>
    !p.doneAt && ((p.taskId === taskId && p.day === today) || p.id === planId) ? { ...p, doneAt: Date.now() } : p,
  );
}

export const useStore = create<State>()((set, get) => ({
  ...emptyData(),
  celebrations: [],

  createFolder: (input) => {
    const id = uid();
    set((s) => {
      const folders = [...s.folders, { ...input, name: input.name.trim(), id, createdAt: Date.now() }];
      const { profile, celebrations } = award({ ...s, folders }, 0);
      return { folders, profile, celebrations: [...s.celebrations, ...celebrations] };
    });
    return id;
  },

  updateFolder: (id, patch) => set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

  deleteFolder: (id) =>
    set((s) => {
      const gone = new Set(s.tasks.filter((t) => t.folderId === id).map((t) => t.id));
      return {
        folders: s.folders.filter((f) => f.id !== id),
        tasks: s.tasks.filter((t) => t.folderId !== id),
        entries: s.entries.filter((e) => !gone.has(e.taskId)),
        plans: s.plans.filter((p) => !p.taskId || !gone.has(p.taskId)),
      };
    }),

  createTask: (input) => {
    const id = uid();
    const task: Task = {
      id,
      folderId: input.folderId,
      title: input.title.trim(),
      progressType: input.progressType,
      target: input.target,
      unit: input.unit,
      deadline: input.deadline,
      milestones: input.milestones.filter((m) => m.trim()).map((title) => ({ id: uid(), title: title.trim(), done: false })),
      resources: input.resources
        .filter((r) => r.title.trim())
        .map((r) => ({ id: uid(), title: r.title.trim(), url: r.url?.trim() || undefined })),
      createdAt: Date.now(),
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    return id;
  },

  updateTask: (id, patch) => set((s) => ({ tasks: mapTask(s.tasks, id, (t) => ({ ...t, ...patch })) })),

  deleteTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      entries: s.entries.filter((e) => e.taskId !== id),
      plans: s.plans.filter((p) => p.taskId !== id),
    })),

  completeTask: (id) =>
    set((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task || task.completedAt) return {};
      const tasks = mapTask(s.tasks, id, (t) => ({ ...t, completedAt: Date.now() }));
      const { profile, celebrations } = award({ ...s, tasks }, XP.taskComplete);
      return {
        tasks,
        profile,
        celebrations: [...s.celebrations, { id: uid(), kind: 'complete', title: task.title, xp: XP.taskComplete }, ...celebrations],
      };
    }),

  reopenTask: (id) => set((s) => ({ tasks: mapTask(s.tasks, id, (t) => ({ ...t, completedAt: undefined })) })),

  logProgress: (taskId, amount, note, evidenceInput, planId) => {
    const s = get();
    const task = s.tasks.find((t) => t.id === taskId);
    if (!task || amount <= 0) return null;

    const today = dayKey();
    const act = activity(s.profile, today);
    let xp = xpForLog(task, amount, act.st.streak.current);

    // Daily quest: the first log of the day on a goal you have not touched today.
    let questBonus = false;
    if (s.profile.questDay !== today && !loggedToday(taskId, s.entries)) {
      questBonus = true;
      xp += XP.dailyQuest;
    }

    // Proof earns bonus XP now and releases the Sparks; without it the Sparks wait.
    const evidence = cleanEvidence(evidenceInput);
    const bonus = evidence ? evidenceBonus(xp) : 0;
    xp += bonus;

    const trust = evidence ? 'evidence' : 'quick';
    const entry: Entry = { id: uid(), taskId, at: Date.now(), amount, note: note?.trim() || undefined, xp, trust, evidence };
    const entries = [...s.entries, entry];

    let tasks = s.tasks;
    let completed = false;
    if (!task.completedAt && computeProgress(task, entries).ratio >= 1) {
      completed = true;
      xp += XP.taskComplete;
      tasks = mapTask(tasks, taskId, (t) => ({ ...t, completedAt: Date.now() }));
    }

    const sparks = sparksForAward(trust, entry.xp, xp);
    const { profile, celebrations, levelUp } = award(
      { ...s, tasks, entries },
      xp,
      { ...act.patch, questDay: questBonus ? today : s.profile.questDay },
      sparks,
    );

    const queue: Celebration[] = [{ id: uid(), kind: 'xp', xp, from: evidence ? 'proof' : 'log', sparks: sparks || undefined }];
    if (completed) queue.push({ id: uid(), kind: 'complete', title: task.title, xp: XP.taskComplete });
    set({
      entries,
      tasks,
      profile,
      plans: settlePlans(s.plans, taskId, today, planId),
      celebrations: [...s.celebrations, ...queue, ...act.toast, ...celebrations],
    });
    return {
      xp, completed, levelUp, streakIncreased: act.st.increased, questBonus,
      verified: !!evidence, bonus, pendingSparks: evidence ? 0 : sparksFor(entry.xp),
    };
  },

  attachEvidence: (entryId, input) => {
    const s = get();
    const entry = s.entries.find((e) => e.id === entryId);
    if (!entry) return { ok: false, reason: 'missing' };
    const state = evidenceState(entry);
    if (state === 'verified' || state === 'legacy') return { ok: false, reason: 'already' };
    if (state === 'expired') return { ok: false, reason: 'expired' };
    const evidence = cleanEvidence(input);
    if (!evidence) return { ok: false, reason: 'invalid' };

    const bonus = evidenceBonus(entry.xp);
    const updated: Entry = { ...entry, xp: entry.xp + bonus, trust: 'evidence', evidence };
    const entries = s.entries.map((e) => (e.id === entryId ? updated : e));
    const sparks = sparksGranted(updated); // none were paid before, so all of it is released now
    const { profile, celebrations } = award({ ...s, entries }, bonus, {}, sparks);
    set({
      entries,
      profile,
      celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp: bonus, from: 'proof', sparks: sparks || undefined }, ...celebrations],
    });
    return { ok: true, bonus, sparks };
  },

  deleteEntry: (entryId) =>
    set((s) => {
      const entry = s.entries.find((e) => e.id === entryId);
      if (!entry) return {};
      return {
        entries: s.entries.filter((e) => e.id !== entryId),
        profile: {
          ...s.profile,
          xp: Math.max(0, s.profile.xp - entry.xp),
          sparks: Math.max(0, s.profile.sparks - sparksGranted(entry)),
        },
      };
    }),

  toggleMilestone: (taskId, milestoneId) => {
    const s = get();
    const task = s.tasks.find((t) => t.id === taskId);
    const ms = task?.milestones.find((m) => m.id === milestoneId);
    if (!task || !ms) return;

    const nowDone = !ms.done;
    const milestones: Milestone[] = task.milestones.map((m) =>
      m.id === milestoneId ? { ...m, done: nowDone, doneAt: nowDone ? Date.now() : undefined } : m,
    );
    let tasks = mapTask(s.tasks, taskId, (t) => ({ ...t, milestones }));
    if (!nowDone) {
      set({ tasks: mapTask(tasks, taskId, (t) => ({ ...t, completedAt: undefined })) });
      return;
    }

    // Ticking a milestone counts as activity and earns XP.
    const today = dayKey();
    const act = activity(s.profile, today);
    let xp = Math.round(XP.milestone * streakMultiplier(act.st.streak.current));
    const entry: Entry = { id: uid(), taskId, at: Date.now(), amount: 0, note: `✓ ${ms.title}`, xp, trust: 'quick' };
    const entries = [...s.entries, entry];

    let completed = false;
    if (!task.completedAt && milestones.length > 0 && milestones.every((m) => m.done)) {
      completed = true;
      xp += XP.taskComplete;
      tasks = mapTask(tasks, taskId, (t) => ({ ...t, completedAt: Date.now() }));
    }
    const { profile, celebrations } = award({ ...s, tasks, entries }, xp, act.patch, sparksForAward('quick', entry.xp, xp));
    const queue: Celebration[] = [{ id: uid(), kind: 'xp', xp, from: 'milestone' }];
    if (completed) queue.push({ id: uid(), kind: 'complete', title: task.title, xp: XP.taskComplete });
    set({
      tasks,
      entries,
      profile,
      plans: settlePlans(s.plans, taskId, today),
      celebrations: [...s.celebrations, ...queue, ...act.toast, ...celebrations],
    });
  },

  addMilestone: (taskId, title) =>
    set((s) => ({
      tasks: mapTask(s.tasks, taskId, (t) => ({
        ...t,
        completedAt: undefined,
        milestones: [...t.milestones, { id: uid(), title: title.trim(), done: false }],
      })),
    })),

  removeMilestone: (taskId, milestoneId) =>
    set((s) => ({
      tasks: mapTask(s.tasks, taskId, (t) => ({ ...t, milestones: t.milestones.filter((m) => m.id !== milestoneId) })),
    })),

  addResource: (taskId, title, url) =>
    set((s) => ({
      tasks: mapTask(s.tasks, taskId, (t) => ({
        ...t,
        resources: [...t.resources, { id: uid(), title: title.trim(), url: url?.trim() || undefined } as Resource],
      })),
    })),

  removeResource: (taskId, resourceId) =>
    set((s) => ({
      tasks: mapTask(s.tasks, taskId, (t) => ({ ...t, resources: t.resources.filter((r) => r.id !== resourceId) })),
    })),

  setReminder: (taskId, reminder) => set((s) => ({ tasks: mapTask(s.tasks, taskId, (t) => ({ ...t, reminder })) })),

  addPlan: (input) => {
    const id = uid();
    const plan: Plan = {
      id,
      taskId: input.taskId,
      title: input.title?.trim() || undefined,
      icon: input.icon,
      day: input.day,
      time: input.time,
      note: input.note?.trim() || undefined,
      createdAt: Date.now(),
    };
    set((s) => ({ plans: [...s.plans, plan] }));
    return id;
  },

  updatePlan: (id, patch) => set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  deletePlan: (id) =>
    set((s) => {
      const plan = s.plans.find((p) => p.id === id);
      if (!plan) return {};
      const back = plan.doneAt ? (plan.xp ?? 0) : 0;
      return {
        plans: s.plans.filter((p) => p.id !== id),
        profile: back ? { ...s.profile, xp: Math.max(0, s.profile.xp - back) } : s.profile,
      };
    }),

  togglePlanDone: (id) => {
    const s = get();
    const plan = s.plans.find((p) => p.id === id);
    if (!plan) return;
    const swap = (next: Plan) => s.plans.map((p) => (p.id === id ? next : p));

    if (plan.doneAt) {
      const back = plan.xp ?? 0;
      set({
        plans: swap({ ...plan, doneAt: undefined, xp: undefined }),
        profile: back ? { ...s.profile, xp: Math.max(0, s.profile.xp - back) } : s.profile,
      });
      return;
    }
    const linked = !!plan.taskId && s.tasks.some((t) => t.id === plan.taskId);
    if (linked) {
      set({ plans: swap({ ...plan, doneAt: Date.now() }) });
      return;
    }
    const act = activity(s.profile, dayKey());
    const { profile, celebrations } = award(s, TODO_XP, act.patch, 0);
    set({
      plans: swap({ ...plan, doneAt: Date.now(), xp: TODO_XP }),
      profile,
      celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp: TODO_XP, from: 'todo' }, ...act.toast, ...celebrations],
    });
  },

  createHabit: (input) => {
    const id = uid();
    const habit: Habit = { ...input, title: input.title.trim(), id, createdAt: Date.now() };
    set((s) => ({ habits: [...s.habits, habit] }));
    return id;
  },

  updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),

  archiveHabit: (id) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: Date.now() } : h)) })),

  deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id), checks: withoutHabit(s.checks, id) })),

  toggleHabit: (habitId, day = dayKey()) => {
    const s = get();
    if (!s.habits.some((h) => h.id === habitId)) return;
    const on = !isChecked(s.checks, habitId, day);
    const checks: Checks = withCheck(s.checks, habitId, day, on);
    if (!on) {
      set({ checks, profile: { ...s.profile, xp: Math.max(0, s.profile.xp - HABIT_XP) } });
      return;
    }
    const today = dayKey();
    // Only a tick for today keeps the day streak going; filling in an earlier day just earns its XP.
    const act = day === today ? activity(s.profile, today) : { patch: {}, toast: [] as Celebration[] };
    const { profile, celebrations } = award({ ...s, checks }, HABIT_XP, act.patch, 0);
    set({
      checks,
      profile,
      celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp: HABIT_XP, from: 'habit' }, ...act.toast, ...celebrations],
    });
  },

  toggleWorship: (key, day = dayKey()) => {
    const s = get();
    const xp = WORSHIP_XP[key];
    const on = !isChecked(s.worship, key, day);
    const worship = withCheck(s.worship, key, day, on);
    if (!on) {
      set({ worship, profile: { ...s.profile, xp: Math.max(0, s.profile.xp - xp) } });
      return;
    }
    const today = dayKey();
    const act = day === today ? activity(s.profile, today) : { patch: {}, toast: [] as Celebration[] };
    const { profile, celebrations } = award({ ...s, worship }, xp, act.patch, 0);
    set({
      worship,
      profile,
      celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp, from: key === 'fast' ? 'fast' : key === 'am' || key === 'pm' ? 'adhkar' : 'prayer' }, ...act.toast, ...celebrations],
    });
  },

  startKhatm: (days, page = 0) => set((s) => ({ profile: { ...s.profile, khatm: newKhatm(days, dayKey(), page) } })),

  setKhatmDays: (days) =>
    set((s) => (s.profile.khatm ? { profile: { ...s.profile, khatm: { ...s.profile.khatm, days } } } : {})),

  readQuran: (page) => {
    const s = get();
    const k = s.profile.khatm;
    if (!k) return;
    const today = dayKey();
    const r = readTo(k, page, today);
    if (r.khatm.page === k.page) return;
    const fresh = r.khatm.best - k.best;
    const quranPages = fresh > 0 ? (s.profile.quranPages ?? 0) + fresh : s.profile.quranPages;
    if (r.xp <= 0) {
      const result = award(s, 0, { khatm: r.khatm, quranPages }, 0);
      set({ profile: result.profile, celebrations: [...s.celebrations, ...result.celebrations] });
      return;
    }
    const act = activity(s.profile, today);
    const khatms = (s.profile.khatms ?? 0) + (r.finished ? 1 : 0);
    const { profile, celebrations } = award(s, r.xp, { ...act.patch, khatm: r.khatm, khatms, quranPages }, 0);
    const done: Celebration[] = r.finished ? [{ id: uid(), kind: 'khatm', n: khatms }] : [];
    set({
      profile,
      celebrations: [...s.celebrations, ...done, { id: uid(), kind: 'xp', xp: r.xp, from: 'quran' }, ...act.toast, ...celebrations],
    });
  },

  finishFocus: (minutes, taskId, note) => {
    const s = get();
    const today = dayKey();
    const task = taskId ? s.tasks.find((x) => x.id === taskId && x.progressType === 'time' && !x.completedAt) : undefined;
    const focus = addSession(s.profile.focus, minutes, today, !!task);
    if (task) {
      set({ profile: { ...s.profile, focus } });
      return get().logProgress(task.id, minutes, note)?.xp ?? 0;
    }
    const xp = focusXp(minutes, focusToday(s.profile.focus, today).min);
    const act = activity(s.profile, today);
    const { profile, celebrations } = award(s, xp, { ...act.patch, focus });
    const sparks = profile.sparks - s.profile.sparks;
    set({
      profile,
      celebrations: [
        ...s.celebrations,
        ...(xp > 0 ? [{ id: uid(), kind: 'xp', xp, from: 'focus', sparks: sparks || undefined } as Celebration] : []),
        ...act.toast,
        ...celebrations,
      ],
    });
    return xp;
  },

  savePage: (input, finish = false) => {
    const s = get();
    const old = input.id ? s.pages.find((p) => p.id === input.id) : undefined;
    const title = (input.title ?? '').trim().slice(0, TITLE_LIMIT) || undefined;
    const text = (finish ? input.text.trimEnd() : input.text).slice(0, TEXT_LIMIT);
    if (isBlank({ title, text, mood: input.mood })) {
      if (old) get().deletePage(old.id);
      return null;
    }
    const now = Date.now();
    const today = dayKey();
    const page: Page = {
      ...(old ?? { id: uid(), kind: input.kind, day: input.day ?? today, at: now }),
      title,
      text,
      mood: input.mood,
      pin: input.pin || undefined,
      color: input.color,
      ask: input.ask === '' ? undefined : input.ask ?? old?.ask,
    };
    if (old && !isNote(old) && !old.xp && input.day) page.day = input.day;
    if (!isNote(page) && page.day === today) {
      // What the app will have forgotten by tomorrow travels with today's entry.
      const live = liveFacts(s.profile, today);
      page.quran = Math.max(page.quran ?? 0, live.quran) || undefined;
      page.focus = Math.max(page.focus ?? 0, live.focus) || undefined;
    }
    const pay = finish && !isNote(page) && page.day === today && !page.xp && !paidOn(s.pages, today);
    const same =
      !!old && old.title === page.title && old.text === page.text && old.mood === page.mood && old.pin === page.pin &&
      old.color === page.color && old.ask === page.ask && old.day === page.day && old.quran === page.quran && old.focus === page.focus;
    if (same && !pay) return page.id;
    if (old && !same) page.edited = now;
    if (pay) page.xp = JOURNAL_XP;
    const pages = old ? s.pages.map((p) => (p.id === page.id ? page : p)) : [...s.pages, page];
    if (!pay) {
      const result = finish ? award({ ...s, pages }, 0) : null;
      set({ pages, ...(result ? { profile: result.profile, celebrations: [...s.celebrations, ...result.celebrations] } : {}) });
      return page.id;
    }
    const act = activity(s.profile, today);
    const { profile, celebrations } = award({ ...s, pages }, JOURNAL_XP, act.patch, 0);
    set({
      pages,
      profile,
      celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp: JOURNAL_XP, from: 'journal' }, ...act.toast, ...celebrations],
    });
    return page.id;
  },

  deletePage: (id) =>
    set((s) => {
      const page = s.pages.find((p) => p.id === id);
      if (!page) return {};
      const back = page.xp ?? 0;
      return {
        pages: s.pages.filter((p) => p.id !== id),
        profile: back ? { ...s.profile, xp: Math.max(0, s.profile.xp - back) } : s.profile,
      };
    }),

  tickItem: (id, line) =>
    set((s) => {
      const page = s.pages.find((p) => p.id === id);
      const text = page ? toggleItem(page.text, line) : '';
      if (!page || text === page.text) return {};
      return { pages: s.pages.map((p) => (p.id === id ? { ...p, text, edited: Date.now() } : p)) };
    }),

  payJuz: (xp) => {
    const s = get();
    if (xp < 0) {
      set({ profile: { ...s.profile, xp: Math.max(0, s.profile.xp + xp) } });
      return;
    }
    if (xp === 0) return;
    const act = activity(s.profile, dayKey());
    const { profile, celebrations } = award(s, xp, act.patch, 0);
    set({ profile, celebrations: [...s.celebrations, { id: uid(), kind: 'xp', xp, from: 'quran' }, ...act.toast, ...celebrations] });
  },

  setNudge: (patch) => set((s) => ({ profile: { ...s.profile, nudge: { ...s.profile.nudge, ...patch } } })),

  saveEcho: ({ name, skin, hair, gender }) =>
    set((s) => {
      const clean = name.trim().slice(0, 20);
      if (!clean) return {};
      const echo: EchoProfile = { name: clean, skin, hair, gender, bornAt: s.profile.echo?.bornAt ?? Date.now() };
      return { profile: { ...s.profile, echo } };
    }),

  buyItem: (itemId) => {
    const s = get();
    // The bot's owner can open what waits for a level; then every stage's items can be bought.
    const stage = useServer.getState().levelsOpen ? TOP_STAGE : growthFor(s.profile.xp).index;
    const check = canBuy(s.profile, itemId, stage, s.profile.echo?.gender ?? 'boy', useServer.getState().sparksGift);
    if (!check.ok) return check;
    const item = itemById(itemId)!;
    set({
      profile: {
        ...s.profile,
        owned: [...(s.profile.owned ?? []), itemId],
        outfit: { ...(s.profile.outfit ?? {}), [item.slot]: itemId }, // wear it right away
      },
      celebrations: [...s.celebrations, { id: uid(), kind: 'item', item: itemId }],
    });
    return check;
  },

  wearItem: (slot, itemId) =>
    set((s) => {
      const item = itemById(itemId);
      if (!item || item.slot !== slot || !isOwned(s.profile, item)) return {};
      if (item.gender && item.gender !== (s.profile.echo?.gender ?? 'boy')) return {};
      return { profile: { ...s.profile, outfit: { ...(s.profile.outfit ?? {}), [slot]: itemId } } };
    }),

  setName: (name) => set((s) => ({ profile: { ...s.profile, name: name.trim().slice(0, 32) } })),
  setDailyGoal: (xp) => set((s) => ({ profile: { ...s.profile, dailyGoalXp: xp } })),
  toggleHaptics: () => set((s) => ({ profile: { ...s.profile, haptics: !s.profile.haptics } })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  dismissCelebration: (id) => set((s) => ({ celebrations: s.celebrations.filter((c) => c.id !== id) })),

  unlockBadge: (id) =>
    set((s) =>
      s.profile.achievements[id]
        ? {}
        : {
            profile: { ...s.profile, achievements: { ...s.profile.achievements, [id]: Date.now() } },
            celebrations: [...s.celebrations, { id: uid(), kind: 'achievement', badge: id }],
          },
    ),

  replaceData: (data) => {
    const next = { ...data, worship: data.worship ?? {}, pages: data.pages ?? [] };
    const result = award(next, 0);
    set({ ...next, profile: result.profile, celebrations: [...get().celebrations, ...result.celebrations] });
  },

  resetAll: () => set((s) => ({ ...emptyData(), settings: { ...s.settings }, celebrations: [] })),
}));

/** The saved part of the state. */
export function snapshot(s: State = useStore.getState()): Data {
  return {
    folders: s.folders, tasks: s.tasks, entries: s.entries, plans: s.plans,
    habits: s.habits, checks: s.checks, worship: s.worship, pages: s.pages, profile: s.profile, settings: s.settings,
  };
}

export const dataChanged = (a: Data, b: Data): boolean =>
  a.folders !== b.folders || a.tasks !== b.tasks || a.entries !== b.entries || a.plans !== b.plans ||
  a.habits !== b.habits || a.checks !== b.checks || a.worship !== b.worship || a.pages !== b.pages ||
  a.profile !== b.profile || a.settings !== b.settings;

/** The day streak to show right now (it lapses after a missed day no freeze can cover). */
export function useVisibleStreak(): number {
  const streak = useStore((s) => s.profile.streak);
  const freezes = useStore((s) => s.profile.freezes);
  return visibleStreak(streak, freezes);
}

/** All data as one object for the pure stats functions. Stable while nothing changes. */
let memo: { key: State; data: Data } | null = null;
export function useData(): Data {
  return useStore((s) => {
    if (memo && !dataChanged(memo.data, s)) return memo.data;
    memo = { key: s, data: snapshot(s) };
    return memo.data;
  });
}
