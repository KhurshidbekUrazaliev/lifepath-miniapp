// Core data model. Ported from LifePath v0.8 (src/lib/types.ts) and extended for the Mini App:
// stand-alone to-dos (Plan), daily habits (Habit, Checks) and Settings.

/** How a task measures progress. */
export type ProgressType =
  | 'units' // amount accumulates toward a total (pages, km, chapters)
  | 'time' // minutes accumulate toward a total
  | 'sessions' // each log is one session toward a target count
  | 'milestones'; // checklist of steps

export interface Folder {
  id: string;
  name: string;
  icon: string; // emoji
  color: string; // hex
  templateId: string;
  progressType: ProgressType;
  unit: string; // default unit for new tasks ("pages", "km")
  createdAt: number;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number;
}

export interface Resource {
  id: string;
  title: string;
  url?: string;
}

/** A repeating reminder for a task. */
export interface Reminder {
  hour: number; // 0-23
  minute: number; // 0-59
  days: number[]; // weekdays, 1 = Sunday ... 7 = Saturday
}

export interface Task {
  id: string;
  folderId: string;
  title: string;
  progressType: ProgressType;
  target: number; // ignored for milestones (uses milestone count)
  unit: string;
  deadline?: number; // epoch ms
  milestones: Milestone[];
  resources: Resource[];
  reminder?: Reminder;
  createdAt: number;
  completedAt?: number;
}

/**
 * A dated to-do ("Task" in the Mini App). In LifePath a plan always belongs to a goal; here it may
 * also stand alone with its own title, so `taskId` is optional.
 */
export interface Plan {
  id: string;
  taskId?: string; // the goal it works toward, if any
  title?: string; // its own title (required when there is no goal)
  icon?: string; // emoji
  day: string; // YYYY-MM-DD (local)
  time?: string; // "HH:MM"
  note?: string;
  doneAt?: number;
  xp?: number; // XP paid when a stand-alone to-do was checked (taken back on uncheck)
  createdAt: number;
}

/** A daily check-off (new in the Mini App). */
export interface Habit {
  id: string;
  title: string;
  icon: string; // emoji
  color: string; // hex
  days: number[]; // weekdays it is due, 1 = Sunday ... 7 = Saturday
  time?: string; // reminder time "HH:MM"
  createdAt: number;
  archivedAt?: number;
}

/** Habit check-offs: month ("YYYY-MM") -> habit id -> bitmask of the days checked (bit 0 = the 1st). */
export type Checks = Record<string, Record<string, number>>;

export type LangSetting = 'auto' | 'en' | 'uz' | 'ru';
export type ThemeSetting = 'auto' | 'dark' | 'light';

/** App settings that travel with the account. */
export interface Settings {
  lang: LangSetting;
  theme: ThemeSetting;
  verse: boolean; // daily verse card on Home
  fullscreen: boolean;
  reminders: boolean; // let the bot send reminders
  onboarded: boolean;
}

export interface NudgeSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

/** Proof that a log really happened (v0.4). Photos arrive in a later version. */
export interface Evidence {
  summary?: string; // what you did or learned, in your own words
  url?: string; // a link: a workout app, a lesson page, a book page
  photoUri?: string; // photo on this device (it may not exist on your other devices)
  photoPath?: string; // where the uploaded photo lives in cloud storage
  at: number; // when the proof was added
}

/** What the person typed into the proof fields (before it is validated). */
export interface EvidenceInput {
  summary?: string;
  url?: string;
  photoUri?: string;
}

/**
 * quick    = one tap. XP counts, but Sparks stay pending until proof is added (7 days).
 * evidence = proof attached. Bonus XP and the Sparks are released.
 * Entries from before v0.4 have no trust field and keep the Sparks they already earned.
 */
export type Trust = 'quick' | 'evidence';

export interface Entry {
  id: string;
  taskId: string;
  at: number; // epoch ms
  amount: number; // pages / minutes / km; 1 for a session; 0 for milestone ticks
  note?: string;
  xp: number;
  trust?: Trust;
  evidence?: Evidence;
}

export interface Streak {
  current: number;
  best: number;
  lastDay?: string; // YYYY-MM-DD (local)
}

/** The companion. Name is free; looks are indexes into the palettes in lib/echo.ts. */
export interface EchoProfile {
  name: string;
  skin: number;
  hair: number;
  bornAt: number;
}

export interface Profile {
  name: string;
  xp: number;
  sparks: number;
  streak: Streak;
  freezes: number;
  dailyGoalXp: number;
  haptics: boolean;
  questDay?: string; // day the daily quest bonus was claimed
  nudge: NudgeSettings; // evening "keep your streak" reminder
  achievements: Record<string, number>; // id -> unlockedAt
  echo?: EchoProfile; // set once the person names their Echo
  owned?: string[]; // wardrobe item ids bought with Sparks (free items are always available)
  outfit?: Partial<Record<'top' | 'hat' | 'accessory' | 'backdrop', string>>; // worn items
}
