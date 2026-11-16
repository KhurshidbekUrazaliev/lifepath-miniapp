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

/** How a day felt, from 1 (hard) to 5 (great). */
export type Feeling = 1 | 2 | 3 | 4 | 5;

/**
 * A page of the journal: a diary entry about a day, or a free note (kind 'note').
 * The text is plain. A line that starts with "- " is a list item, "✓ " one that is done; "#word" is a tag.
 */
export interface Page {
  id: string;
  kind?: 'note';
  day: string; // the day a diary entry is about; the day a note was started
  at: number; // when it was written
  edited?: number; // when it was last changed
  title?: string;
  text: string;
  mood?: Feeling;
  pin?: boolean; // a note kept on top
  color?: number; // a note's colour (lib/journal.ts)
  ask?: string; // the question it answers (lib/journal.ts)
  xp?: number; // XP paid for it: the first diary entry of a day earns some
  quran?: number; // Qurʼan pages read that day, as far as the app knew when the entry was saved
  focus?: number; // minutes of focus that day, likewise
}

export type LangSetting = 'auto' | 'en' | 'uz' | 'ru';
export type ThemeSetting = 'auto' | 'dark' | 'light';

/** Where prayer times are for. Coordinates are rounded to about a kilometre before they are saved. */
export interface Place {
  lat: number;
  lon: number;
  tz: string; // IANA time zone of the place
  city?: string; // id in content/cities.ts when picked from the list
}

/** App settings that travel with the account. */
export interface Settings {
  lang: LangSetting;
  theme: ThemeSetting;
  verse: boolean; // the ayah of the day on Home
  reciter?: string; // whose recitation plays (content/reciters.ts); the first one when unset
  fullscreen: boolean;
  reminders: boolean; // let the bot send reminders
  onboarded: boolean;
  hijriOffset?: number; // days added to the Umm al-Qura date where the local moon sighting differs (-2..2)
  place?: Place; // where prayer times are for
  prayerMethod?: string; // a calculation method (lib/prayer.ts); unset = what is usual at the place
  asr?: 'standard' | 'hanafi'; // unset = what is usual at the place
  prayerCard?: boolean; // the next prayer on Home (on unless turned off)
  prayerAlerts?: boolean; // the bot writes at prayer times (needs `reminders` and a place)
  prayerAlertList?: string[]; // which prayers; all five when unset
  prayerBefore?: number; // minutes ahead of the prayer: 0, 10, 15 or 30
  jumuah?: boolean; // a Friday-morning reminder to read Surah Al-Kahf
  adhkarTr?: boolean; // transliteration under the Arabic of the adhkar (on unless turned off)
  journalCard?: boolean; // the day's question on Home (on unless turned off)
  journalAt?: string; // "HH:MM": the bot asks about the day at this time (needs `reminders`)
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

/** The companion. Name is free; skin and hair are indexes into the palettes in lib/echo.ts (2D picture). */
export interface EchoProfile {
  name: string;
  skin: number;
  hair: number;
  bornAt: number;
  gender?: 'boy' | 'girl'; // the 3D model; companions from before the 3D update are boys until changed
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
  outfit?: Partial<Record<'head' | 'face' | 'hold' | 'pet' | 'place' | 'sky', string>>; // worn items
  khatm?: Khatm; // the Qurʼan reading plan under way (lib/khatm.ts)
  khatms?: number; // khatms completed
  quranPages?: number; // khatm pages read for the first time, all plans together (friend challenges count them)
  focus?: FocusStats; // focus timer sessions (lib/focus.ts)
}

/** Focus timer sessions: today's, and minutes over all time. */
export interface FocusStats {
  day: string; // the day `min` and `n` are for
  min: number; // minutes focused that day
  n: number; // sessions finished that day
  total: number; // minutes over all time
  free?: number; // of those, minutes that were not logged on a goal
}

/** Reading the whole Qurʼan in a set number of days. */
export interface Khatm {
  start: string; // the plan's first day
  days: number; // how many days it is meant to take
  page: number; // pages read so far, 0–604
  best: number; // the furthest page XP was given for
  xpDay?: string; // the last day pages earned XP…
  xpPages?: number; // …and how many did that day (capped)
  doneAt?: string; // the day the last page was read
}
