// LifePath's ten achievements plus two for habits.
import { ACHIEVEMENTS, earnedAchievements } from './gamify';
import { Checks, Entry, Folder, Habit, Profile, Task } from './types';
import { bestHabitStreak } from './habits';

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
];

export const badgeById = (id: string): Badge | undefined => BADGES.find((b) => b.id === id);

export function earnedBadges(d: {
  profile: Profile; tasks: Task[]; entries: Entry[]; folders: Folder[]; habits: Habit[]; checks: Checks;
}): string[] {
  const ids = earnedAchievements(d.profile, d.tasks, d.entries, d.folders.length);
  const anyTick = Object.values(d.checks).some((month) => Object.values(month).some((mask) => mask !== 0));
  if (anyTick) ids.push('first-habit');
  if (d.habits.some((h) => bestHabitStreak(h, d.checks) >= 7)) ids.push('habit-7');
  return ids;
}
