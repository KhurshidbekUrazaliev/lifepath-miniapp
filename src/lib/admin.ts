// The owner's panel: what the bot's server sends, and the small rules for showing it. Unit tested.

export interface AdminUser {
  id: number;
  firstName: string;
  username: string | null;
  lang: string;
  tz: string;
  createdAt: number;
  /** When they last opened the app (0 if they have only written to the bot). */
  seenAt: number;
  /** The last day they did something, in their own time zone. */
  lastActiveDay: string | null;
  level: number;
  /** Everything they have earned. */
  xp: number;
  /** The part of it that has proof: their score in the rankings. */
  provenXp: number;
  weekXp: number;
  streak: number;
  canMessage: boolean;
  blocked: boolean;
  reminders: boolean;
  /** Plus they paid for, while it runs. */
  paidUntil: number | null;
  /** The owner opened what waits for a level. */
  levelsOpen: boolean;
  /** The owner gave them Plus. */
  plusGift: boolean;
  /** Sparks the owner gave them, on top of the ones they earned. */
  sparksGift: number;
  wardrobeOpen: boolean; // every wardrobe item is theirs to wear
}

export interface AdminStats {
  users: number;
  today: number;
  week: number;
  month: number;
  fresh: number;
  plus: number;
  levelsOpen: number;
}

export interface AdminList {
  stats: AdminStats;
  users: AdminUser[];
  /** How many people match the search (the list comes a page at a time). */
  total: number;
  more: boolean;
  now: number;
}

export type AdminSort = 'seen' | 'level' | 'new';
export type AdminAccess = Pick<AdminUser, 'id' | 'levelsOpen' | 'plusGift' | 'sparksGift' | 'wardrobeOpen'>;

/** The most Sparks one person can be given (the server refuses more). */
export const MAX_SPARKS_GIFT = 100_000;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * How long ago someone was here, in the largest whole unit: under a minute is "now", then minutes,
 * then hours; from a day on the app shows the date instead.
 */
export function seenAgo(seenAt: number, now: number): { unit: 'never' | 'now' | 'min' | 'hour' | 'date'; n: number } {
  if (!seenAt) return { unit: 'never', n: 0 };
  const ago = Math.max(0, now - seenAt);
  if (ago < MIN) return { unit: 'now', n: 0 };
  if (ago < HOUR) return { unit: 'min', n: Math.floor(ago / MIN) };
  if (ago < DAY) return { unit: 'hour', n: Math.floor(ago / HOUR) };
  return { unit: 'date', n: Math.floor(ago / DAY) };
}

/** Puts what the server answered into the list, leaving everyone else as they were. */
export function withAccess(users: AdminUser[], access: AdminAccess): AdminUser[] {
  return users.map((u) => (u.id === access.id ? { ...u, levelsOpen: access.levelsOpen, plusGift: access.plusGift, sparksGift: access.sparksGift, wardrobeOpen: access.wardrobeOpen } : u));
}

/** The counts at the top after a switch was flipped for one person, without asking the server again. */
export function statsAfter(stats: AdminStats, before: AdminUser, after: AdminAccess, now: number): AdminStats {
  const plus = (u: Pick<AdminUser, 'paidUntil' | 'plusGift'>) => Number(hasPlus(u, now));
  return {
    ...stats,
    levelsOpen: stats.levelsOpen + Number(after.levelsOpen) - Number(before.levelsOpen),
    plus: stats.plus + plus({ paidUntil: before.paidUntil, plusGift: after.plusGift }) - plus(before),
  };
}

/** A person has Plus when they paid for it or were given it. */
export const hasPlus = (u: Pick<AdminUser, 'paidUntil' | 'plusGift'>, now: number): boolean => u.plusGift || (u.paidUntil ?? 0) > now;

/** The address that opens someone's Telegram profile, for those who have a username. */
export const profileLink = (u: Pick<AdminUser, 'username'>): string | null => (u.username ? `https://t.me/${u.username}` : null);

/** The query of GET /api/admin/users. */
export function listQuery(q: string, sort: AdminSort, offset: number): string {
  const params = new URLSearchParams({ sort, offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  return `/admin/users?${params.toString()}`;
}
