// A backup: everything the app keeps, as one piece of text to copy away and paste back (pure).
// Writing one and reading one are both here, so the two can never disagree about the format.
// Reading checks every part before any of it is handed over: a wrong paste must not reach the store.
import type { Data } from './stats';
import { levelInfo } from './gamify';
import { isNote } from './journal';

export const BACKUP_APP = 'lifepath-miniapp';
/** Goes up only when an older copy of the app could no longer read what is written. */
export const BACKUP_VERSION = 1;

export function writeBackup(data: Data, at: number = Date.now()): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date(at).toISOString(), data });
}

/** Why a text could not be read: nothing was given, it is something else, it is cut or broken, or it is from a later LifePath. */
export type BackupProblem = 'empty' | 'notBackup' | 'damaged' | 'newer';

/** What a backup holds, to show before anything is replaced. */
export interface BackupSummary {
  /** When it was made; unset when the backup does not say. */
  madeAt?: number;
  goals: number;
  habits: number;
  logs: number;
  /** Diary entries. */
  pages: number;
  notes: number;
  level: number;
}

export type BackupRead = { ok: true; data: Data; summary: BackupSummary } | { ok: false; problem: BackupProblem };

// ---------- what each part has to look like ----------

type Check = (v: unknown) => boolean;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text: Check = (v) => typeof v === 'string';
const id: Check = (v) => typeof v === 'string' && v.length > 0;
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const flag: Check = (v) => typeof v === 'boolean';
/** XP and the like: never below zero, and never so large that working out a level from it would not end. */
const amount: Check = (v) => number(v) && (v as number) >= 0 && (v as number) <= 1_000_000_000;
const integer = (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const day: Check = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const at = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === v;
};
const maybe = (check: Check): Check => (v) => v === undefined || check(v);
const oneOf = (...values: unknown[]): Check => (v) => values.includes(v);
const listOf = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const mapOf = (check: Check): Check => (v) => isObject(v) && Object.values(v).every(check);
/** An object whose named fields pass. Fields it does not name are let through: a later version may have added them. */
const shape = (fields: Record<string, Check>): Check => (v) => isObject(v) && Object.keys(fields).every((key) => fields[key](v[key]));

const progressType = oneOf('units', 'time', 'sessions', 'milestones');

const folder = shape({ id, name: text, icon: text, color: text, templateId: text, progressType, unit: text, createdAt: number });
const task = shape({
  id, folderId: text, title: text, progressType, target: number, unit: text, createdAt: number,
  deadline: maybe(number), completedAt: maybe(number),
  milestones: listOf(shape({ id, title: text, done: flag, doneAt: maybe(number) })),
  resources: listOf(shape({ id, title: text, url: maybe(text) })),
  reminder: maybe(shape({ hour: integer(0, 23), minute: integer(0, 59), days: listOf(integer(1, 7)) })),
});
const entry = shape({
  id, taskId: text, at: number, amount: number, xp: number, note: maybe(text), trust: maybe(oneOf('quick', 'evidence')),
  evidence: maybe(shape({ at: number, summary: maybe(text), url: maybe(text), photoUri: maybe(text), photoPath: maybe(text) })),
});
const plan = shape({
  id, day, createdAt: number, taskId: maybe(text), title: maybe(text), icon: maybe(text), time: maybe(text), note: maybe(text),
  doneAt: maybe(number), xp: maybe(number),
});
const habit = shape({ id, title: text, icon: text, color: text, days: listOf(integer(1, 7)), createdAt: number, time: maybe(text), archivedAt: maybe(number) });
const page = shape({
  id, day, at: number, text, kind: maybe(oneOf('note')), edited: maybe(number), title: maybe(text), mood: maybe(oneOf(1, 2, 3, 4, 5)),
  pin: maybe(flag), color: maybe(number), ask: maybe(text), xp: maybe(number), quran: maybe(number), focus: maybe(number),
});
/** Check-offs: month -> what was ticked -> the days, as bits. */
const checks: Check = (v) => isObject(v) && Object.entries(v).every(([month, masks]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && mapOf(integer(0, 0x7fffffff))(masks));
const profile = shape({
  name: text, xp: amount, sparks: amount, freezes: amount, dailyGoalXp: number, haptics: flag,
  streak: shape({ current: number, best: number, lastDay: maybe(day) }),
  nudge: shape({ enabled: flag, hour: integer(0, 23), minute: integer(0, 59) }),
  achievements: mapOf(number),
  questDay: maybe(text),
  echo: maybe(shape({ name: text, skin: number, hair: number, bornAt: number, gender: maybe(oneOf('boy', 'girl')) })),
  owned: maybe(listOf(text)),
  specialDays: maybe(listOf(day)),
  outfit: maybe(mapOf(text)),
  khatm: maybe(shape({ start: day, days: number, page: number, best: number, xpDay: maybe(text), xpPages: maybe(number), doneAt: maybe(text) })),
  khatms: maybe(number),
  quranPages: maybe(number),
  focus: maybe(shape({ day: text, min: number, n: number, total: number, free: maybe(number) })),
});
const settings = shape({
  lang: oneOf('auto', 'en', 'uz', 'ru'), theme: oneOf('auto', 'dark', 'light'),
  verse: flag, fullscreen: flag, reminders: flag, onboarded: flag,
  reciter: maybe(text), hijriOffset: maybe(integer(-2, 2)),
  place: maybe(shape({ lat: number, lon: number, tz: text, city: maybe(text) })),
  prayerMethod: maybe(text), asr: maybe(oneOf('standard', 'hanafi')),
  prayerCard: maybe(flag), prayerAlerts: maybe(flag), prayerAlertList: maybe(listOf(text)), prayerBefore: maybe(number),
  jumuah: maybe(flag), adhkarTr: maybe(flag), journalCard: maybe(flag), journalAt: maybe(text),
  home: maybe(shape({ order: maybe(listOf(text)), hidden: maybe(listOf(text)), auto: maybe(flag) })),
  weekLetter: maybe(flag),
});

/**
 * The same value without the fields that are null. The app never saves a null, but JSON turns a number
 * that is not one (NaN) into null on the way out; such a field counts as not there.
 */
function withoutNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutNulls);
  if (!isObject(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([, value]) => value !== null).map(([key, value]) => [key, withoutNulls(value)]));
}

/** A list of records: none when an older backup has no such list, null when it is not what it should be. */
function records<T extends { id: string }>(v: unknown, check: Check): T[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(check)) return null;
  const seen = new Set<string>();
  return (v as T[]).filter((r) => !seen.has(r.id) && !!seen.add(r.id));
}

const failed = (problem: BackupProblem): BackupRead => ({ ok: false, problem });

/**
 * Reads a pasted backup. `defaults` is what a fresh start has (the store's emptyData()): whatever an
 * older backup lacks is filled from it, the way the cloud's decoder fills gaps.
 */
export function readBackup(pasted: string, defaults: Data): BackupRead {
  const raw = pasted.trim();
  if (!raw) return failed('empty');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A backup that lost its end on the way through the clipboard still begins like one.
    return failed(raw.startsWith('{') && raw.slice(0, 80).includes(`"${BACKUP_APP}"`) ? 'damaged' : 'notBackup');
  }
  if (!isObject(parsed) || parsed.app !== BACKUP_APP || !number(parsed.version) || (parsed.version as number) < 1) return failed('notBackup');
  if ((parsed.version as number) > BACKUP_VERSION) return failed('newer');

  const d = withoutNulls(parsed.data);
  if (!isObject(d)) return failed('damaged');
  const part = (v: unknown, fallback: object): Record<string, unknown> | null =>
    v === undefined ? { ...fallback } : isObject(v) ? { ...fallback, ...v } : null;

  const data = {
    folders: records(d.folders, folder),
    tasks: records(d.tasks, task),
    entries: records(d.entries, entry),
    plans: records(d.plans, plan),
    habits: records(d.habits, habit),
    checks: d.checks ?? {},
    worship: d.worship ?? {},
    pages: records(d.pages, page),
    profile: part(d.profile, defaults.profile),
    settings: part(d.settings, defaults.settings),
  };
  const whole =
    !!data.folders && !!data.tasks && !!data.entries && !!data.plans && !!data.habits && !!data.pages &&
    checks(data.checks) && checks(data.worship) && profile(data.profile) && settings(data.settings);
  if (!whole) return failed('damaged');

  const good = data as unknown as Data;
  const made = typeof parsed.exportedAt === 'string' ? Date.parse(parsed.exportedAt) : NaN;
  return {
    ok: true,
    data: good,
    summary: {
      madeAt: Number.isFinite(made) ? made : undefined,
      goals: good.tasks.length,
      habits: good.habits.length,
      logs: good.entries.length,
      pages: good.pages.filter((p) => !isNote(p)).length,
      notes: good.pages.filter(isNote).length,
      level: levelInfo(good.profile.xp).level,
    },
  };
}

/**
 * What the store takes from a backup: all of it, except what belongs to this phone and this moment.
 * The language and theme stay as they are here; whether the bot may write is Telegram's permission,
 * which a backup cannot know; and the welcome screens are behind us.
 */
export function restored(backup: Data, here: Data): Data {
  const { lang, theme, reminders } = here.settings;
  return { ...backup, settings: { ...backup.settings, lang, theme, reminders, onboarded: true } };
}
