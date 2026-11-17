// LifePath's ten achievements, two for habits, and the Mini App's own: a higher level, prayer, fasting,
// the adhkar, the Qurʼan, focus, the journal and friend challenges. Most are worked out from the data; the two for
// challenges are unlocked when they happen (the server keeps challenges, not the app).
import { ACHIEVEMENTS, earnedAchievements, levelInfo } from './gamify';
import { Checks, Entry, Folder, Habit, Page, Plan, Profile, Settings, Task } from './types';
import { specialBadges } from './special';
import { bestHabitStreak, shiftDay } from './habits';
import { PRAYERS } from './prayerTimes';
import { bestJournalStreak, writtenDays } from './journal';

export interface Badge {
  id: string;
  icon: string;
  tone: 'blue' | 'violet' | 'orange' | 'green' | 'gold' | 'pink';
}

const TONES: Record<string, Badge['tone']> = {
  'first-log': 'blue', 'ten-logs': 'orange', 'fifty-logs': 'violet', 'first-complete': 'green', 'five-complete': 'gold',
  'streak-3': 'pink', 'streak-7': 'blue', 'streak-30': 'orange', 'three-folders': 'violet', 'level-5': 'gold',
};

export const BADGES: Badge[] = [
  ...ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, tone: TONES[a.id] ?? 'blue' })),
  { id: 'first-habit', icon: '🌱', tone: 'green' },
  { id: 'habit-7', icon: '💎', tone: 'pink' },
  { id: 'level-10', icon: '🚀', tone: 'violet' },
  { id: 'prayer-first', icon: '🕌', tone: 'gold' },
  { id: 'prayer-day', icon: '☀️', tone: 'orange' },
  { id: 'prayer-week', icon: '✨', tone: 'blue' },
  { id: 'prayer-100', icon: '📿', tone: 'green' },
  { id: 'fast-first', icon: '🌙', tone: 'violet' },
  { id: 'fast-10', icon: '🌴', tone: 'green' },
  { id: 'adhkar-first', icon: '🤲', tone: 'gold' },
  { id: 'adhkar-7', icon: '🌅', tone: 'orange' },
  { id: 'quran-100', icon: '📖', tone: 'blue' },
  { id: 'khatm-1', icon: '🌟', tone: 'gold' },
  { id: 'focus-first', icon: '🎯', tone: 'pink' },
  { id: 'focus-10h', icon: '⏳', tone: 'violet' },
  { id: 'journal-first', icon: '📝', tone: 'violet' },
  { id: 'journal-7', icon: '✍️', tone: 'pink' },
  { id: 'journal-30', icon: '📚', tone: 'gold' },
  { id: 'special-ramadan', icon: '🌙', tone: 'violet' },
  { id: 'special-ten', icon: '🌅', tone: 'gold' },
  { id: 'special-arafah', icon: '⛰️', tone: 'green' },
  { id: 'special-ashura', icon: '💧', tone: 'blue' },
  { id: 'special-white', icon: '🌕', tone: 'pink' },
  { id: 'challenge-join', icon: '🤝', tone: 'blue' },
  { id: 'challenge-win', icon: '🏆', tone: 'gold' },
];

/** Unlocked by what happens on the server, not worked out from the data. */
export type EventBadge = 'challenge-join' | 'challenge-win';

export const badgeById = (id: string): Badge | undefined => BADGES.find((b) => b.id === id);

function bits(n: number): number {
  let count = 0;
  for (let v = n >>> 0; v; v &= v - 1) count++;
  return count;
}

/** How many ticks of these keys there are, across all months. */
const ticks = (worship: Checks, keys: readonly string[]): number =>
  Object.values(worship).reduce((sum, month) => sum + keys.reduce((n, k) => n + bits(month[k] ?? 0), 0), 0);

/** Days on which any of these keys is ticked. */
const daysWith = (worship: Checks, keys: readonly string[]): number =>
  Object.values(worship).reduce((sum, month) => sum + bits(keys.reduce((mask, k) => mask | (month[k] ?? 0), 0)), 0);

/** The days with all five prayers ticked, oldest first. */
function fullPrayerDays(worship: Checks): string[] {
  const out: string[] = [];
  for (const [month, keys] of Object.entries(worship)) {
    const all = PRAYERS.reduce((mask, p) => mask & (keys[p] ?? 0), 0x7fffffff);
    for (let d = 0; d < 31; d++) if (all & (1 << d)) out.push(`${month}-${String(d + 1).padStart(2, '0')}`);
  }
  return out.sort();
}

/** The longest run of days in a row with all five prayers. */
export function bestPrayerRun(worship: Checks): number {
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of fullPrayerDays(worship)) {
    run = prev && shiftDay(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

export function earnedBadges(d: {
  profile: Profile; tasks: Task[]; entries: Entry[]; folders: Folder[]; habits: Habit[]; checks: Checks; worship: Checks;
  pages?: Page[]; plans?: Plan[]; settings?: Pick<Settings, 'hijriOffset'>;
}): string[] {
  const ids = earnedAchievements(d.profile, d.tasks, d.entries, d.folders.length);
  const anyTick = Object.values(d.checks).some((month) => Object.values(month).some((mask) => mask !== 0));
  if (anyTick) ids.push('first-habit');
  if (d.habits.some((h) => bestHabitStreak(h, d.checks) >= 7)) ids.push('habit-7');
  if (levelInfo(d.profile.xp).level >= 10) ids.push('level-10');

  const prayers = ticks(d.worship, PRAYERS);
  if (prayers >= 1) ids.push('prayer-first');
  const fullDays = fullPrayerDays(d.worship).length;
  if (fullDays >= 1) ids.push('prayer-day');
  if (fullDays >= 7 && bestPrayerRun(d.worship) >= 7) ids.push('prayer-week');
  if (prayers >= 100) ids.push('prayer-100');
  const fasts = ticks(d.worship, ['fast']);
  if (fasts >= 1) ids.push('fast-first');
  if (fasts >= 10) ids.push('fast-10');
  const adhkarDays = daysWith(d.worship, ['am', 'pm']);
  if (adhkarDays >= 1) ids.push('adhkar-first');
  if (adhkarDays >= 7) ids.push('adhkar-7');

  if ((d.profile.quranPages ?? 0) >= 100) ids.push('quran-100');
  if ((d.profile.khatms ?? 0) >= 1) ids.push('khatm-1');
  const focus = d.profile.focus?.total ?? 0;
  if (focus > 0) ids.push('focus-first');
  if (focus >= 600) ids.push('focus-10h');

  const pages = d.pages ?? [];
  const written = writtenDays(pages).size;
  if (written >= 1) ids.push('journal-first');
  if (written >= 7 && bestJournalStreak(pages) >= 7) ids.push('journal-7');
  if (written >= 30) ids.push('journal-30');
  return [...ids, ...specialBadges(d)];
}
