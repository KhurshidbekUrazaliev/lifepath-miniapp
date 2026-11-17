// Doing things together: buddy streaks (two friends keep one streak) and group khatms (friends or a
// family share out the thirty juz of the Qurʼan). The bot's server keeps both (worker/src/buddies.ts and
// gkhatm.ts). Here is how the app reads what it sends, and the rules themselves, which the examples in
// ?demo=1 run on and the tests check.
import quran from '../content/quran.json';
import { daysBetween } from './dates';
import { shiftDay } from './habits';

// ---------- buddy streaks ----------

export const MAX_BUDDIES = 5;

/** A pair, as the server shows it to one of the two. */
export interface Buddy {
  id: string;
  /** The buddy's first name. */
  name: string;
  since: number;
  /** Shared days in a row. 0 when there is none, or it has ended: the next shared day starts it at 1. */
  streak: number;
  best: number;
  /** Each has done something today, by their own calendar. */
  meDone: boolean;
  theyDone: boolean;
  /** The person has nudged this buddy today, and whether they may now. */
  nudged: boolean;
  canNudge: boolean;
}

/** What an invite link says before it is accepted. */
export interface BuddyInvite {
  name: string;
  /** It is the person's own link. */
  mine: boolean;
  /** They are buddies already. */
  buddy: boolean;
  /** Whoever shared it has five buddies; the person themself has five. */
  full: boolean;
  limit: boolean;
}

export const buddyLink = (bot: string | null, code: string): string => (bot ? `https://t.me/${bot}?startapp=b_${code}` : 'https://t.me');

/** Who has done today's part: both, only the person, only the buddy, or neither. */
export type PairToday = 'both' | 'me' | 'them' | 'none';

export const pairToday = (b: Buddy): PairToday => (b.meDone ? (b.theyDone ? 'both' : 'me') : b.theyDone ? 'them' : 'none');

/**
 * How much a pair needs the person right now, smallest first: a running streak that waits for them, a
 * running streak that waits for the buddy, a pair with no streak to lose, and last a day already shared.
 */
export function urgency(b: Buddy): number {
  if (b.meDone && b.theyDone) return 3;
  if (b.streak < 1) return 2;
  return b.meDone ? 1 : 0;
}

/**
 * The pair as it stands once the person has done something today. The server hears of it a moment
 * later and then says the same (and what it did to the streak); what is on screen should not wait.
 */
export const withMyDay = (b: Buddy, activeToday: boolean): Buddy => (activeToday && !b.meDone ? { ...b, meDone: true } : b);

/**
 * The pairs in the order they need looking at; among equals the longer streak first. `activeToday`:
 * the person has done something today, whether or not the server has heard of it.
 */
export function sortBuddies(list: Buddy[], activeToday = false): Buddy[] {
  const need = (b: Buddy) => urgency(withMyDay(b, activeToday));
  return [...list].sort((a, b) => need(a) - need(b) || b.streak - a.streak || a.name.localeCompare(b.name));
}

/** The pair closest to breaking, for the card on Home. */
export function closestPair(list: Buddy[], activeToday: boolean): Buddy | undefined {
  const first = sortBuddies(list, activeToday)[0];
  return first && withMyDay(first, activeToday);
}

/** The streak of each pair when the person last looked. */
export type Seen = Record<string, number>;

export const seenOf = (list: Buddy[]): Seen => Object.fromEntries(list.map((b) => [b.id, b.streak]));

/** Pairs whose streak has grown since the person last looked (a pair never seen before is not news). */
export const grownSince = (seen: Seen, list: Buddy[]): Buddy[] => list.filter((b) => seen[b.id] !== undefined && b.streak > (seen[b.id] ?? 0));

/**
 * The day to report to the server as the last active one: the streak's last day when that is today or
 * yesterday (yesterday is still worth telling, in case the phone was offline then).
 */
export function reportableDay(lastDay: string | undefined, today: string): string | undefined {
  return lastDay && (lastDay === today || lastDay === shiftDay(today, -1)) ? lastDay : undefined;
}

/** What is kept for a pair: each side's last active day and the one before, and the last day they shared. */
export interface PairDays {
  aDay: string | null;
  aPrev: string | null;
  bDay: string | null;
  bPrev: string | null;
  both: string | null;
  streak: number;
  best: number;
}

export const newPair = (): PairDays => ({ aDay: null, aPrev: null, bDay: null, bPrev: null, both: null, streak: 0, best: 0 });

/**
 * One side was active on `day`. When the other was active that day too, it becomes their last shared
 * day: the streak grows by one if the shared day before it was the day before, and starts again at one
 * otherwise. Two calendars can be a day apart, which is why each side keeps two days.
 */
export function activeOn(p: PairDays, who: 'a' | 'b', day: string): PairDays {
  const mine = who === 'a' ? p.aDay : p.bDay;
  if (mine !== null && mine >= day) return p; // a side's days only move forward
  const [theirs, theirPrev] = who === 'a' ? [p.bDay, p.bPrev] : [p.aDay, p.aPrev];
  const shared = (theirs === day || theirPrev === day) && (p.both === null || p.both < day);
  const streak = shared ? (p.both === shiftDay(day, -1) ? p.streak + 1 : 1) : p.streak;
  return {
    ...p,
    ...(who === 'a' ? { aPrev: p.aDay, aDay: day } : { bPrev: p.bDay, bDay: day }),
    both: shared ? day : p.both,
    streak,
    best: shared ? Math.max(p.best, streak) : p.best,
  };
}

/**
 * Does the streak still count? It does while the day after the last shared one is not lost: each side
 * either was active on it, or their own calendar (`todayA`, `todayB`) has not gone past it.
 */
export function streakAlive(p: PairDays, todayA: string, todayB: string): boolean {
  if (!p.both || p.streak < 1) return false;
  const next = shiftDay(p.both, 1);
  const kept = (day: string | null, prev: string | null, today: string) => today <= next || day === next || prev === next;
  return kept(p.aDay, p.aPrev, todayA) && kept(p.bDay, p.bPrev, todayB);
}

// ---------- group khatm ----------

export const JUZ_COUNT = 30;
/** XP for a juz marked read, and the most a day brings from it (the server decides, the app only shows it). */
export const JUZ_XP = 20;
export const JUZ_XP_DAY = 40;
export const MAX_KHATM_MEMBERS = 40;

export interface KhatmMember {
  /** What the server calls this member by. */
  key: string;
  name: string;
  isMe: boolean;
  isOwner: boolean;
  /** Juz they hold, read or not, and how many of them are read. */
  taken: number;
  read: number;
}

/** A juz somebody took. The juz nobody took are simply not in the list. */
export interface KhatmPart {
  juz: number;
  name: string;
  mine: boolean;
  done: boolean;
}

export interface GroupKhatm {
  id: string;
  title: string;
  /** YYYY-MM-DD the group wants to finish by, if any. */
  due: string | null;
  round: number;
  /** Who started it. */
  owner: string;
  isOwner: boolean;
  joined: boolean;
  /** All thirty are read. */
  done: boolean;
  read: number;
  members: KhatmMember[];
  parts: KhatmPart[];
}

export type JuzAction = 'take' | 'release' | 'read' | 'unread';

/** free: nobody's. mine / taken: held and not read yet. mineRead / read: read. */
export type JuzState = 'free' | 'mine' | 'mineRead' | 'taken' | 'read';

export interface JuzCell {
  juz: number;
  state: JuzState;
  /** Who holds it ('' when free). */
  name: string;
}

export const khatmLink = (bot: string | null, id: string): string => (bot ? `https://t.me/${bot}?startapp=k_${id}` : 'https://t.me');

/** All thirty juz in order, each with its state. */
export function board(k: GroupKhatm): JuzCell[] {
  const byJuz = new Map(k.parts.map((p) => [p.juz, p]));
  return Array.from({ length: JUZ_COUNT }, (_, i) => {
    const p = byJuz.get(i + 1);
    const state: JuzState = !p ? 'free' : p.mine ? (p.done ? 'mineRead' : 'mine') : p.done ? 'read' : 'taken';
    return { juz: i + 1, state, name: p?.name ?? '' };
  });
}

export const freeCount = (k: GroupKhatm): number => JUZ_COUNT - k.parts.length;

/** The person's own juz that are still to read, lowest first. */
export const myUnread = (k: GroupKhatm): number[] => k.parts.filter((p) => p.mine && !p.done).map((p) => p.juz).sort((a, b) => a - b);

/** The first and last page of a juz in the standard mushaf of 604 pages. */
export function juzPages(juz: number): { from: number; to: number } {
  const from = quran.juzStart[juz - 1] ?? 1;
  return { from, to: (quran.juzStart[juz] ?? 605) - 1 };
}

export const juzUrl = (juz: number): string => `https://quran.com/juz/${Math.max(1, Math.min(JUZ_COUNT, juz))}`;

/** Days until the finish date: 0 on the day, negative after it, null when there is none. */
export const dueIn = (k: GroupKhatm, today: string): number | null => (k.due ? daysBetween(today, k.due) : null);

/** The khatms still being read first (the one nearest its end on top), then the complete ones. */
export const sortKhatms = (list: GroupKhatm[]): GroupKhatm[] =>
  [...list].sort((a, b) => Number(a.done) - Number(b.done) || b.read - a.read || a.title.localeCompare(b.title));

/** The list with this khatm put first (replacing the copy it had, if any). */
export const upsertKhatm = (list: GroupKhatm[], k: GroupKhatm): GroupKhatm[] => [k, ...list.filter((x) => x.id !== k.id)];

/**
 * The khatm for the card on Home: one that is still being read, and of those one in which the person
 * has juz waiting for them before one in which they have none.
 */
export const homeKhatm = (list: GroupKhatm[]): GroupKhatm | undefined => {
  const open = sortKhatms(list).filter((k) => k.joined && !k.done);
  return open.find((k) => myUnread(k).length > 0) ?? open[0];
};

/** The XP each of the person's marks brought today, by juz (the server keeps this; the examples keep it here). */
export type JuzPaid = Record<number, number>;

/**
 * What one tap on a juz does to the board, the way the server does it. A mark brings JUZ_XP while the
 * day's marks have brought less than JUZ_XP_DAY, and taking a mark back takes back what it brought.
 * Returns null when the rules do not allow it.
 */
export function applyJuz(
  k: GroupKhatm, juz: number, action: JuzAction, me: string, paid: JuzPaid = {},
): { khatm: GroupKhatm; xp: number; completed: boolean; paid: JuzPaid } | null {
  if (k.done || !k.joined || juz < 1 || juz > JUZ_COUNT) return null;
  const part = k.parts.find((p) => p.juz === juz);
  if (part && !part.mine) return null;
  let parts = k.parts;
  let xp = 0;
  let nowPaid = paid;
  if (action === 'take') {
    if (!part) parts = [...parts, { juz, name: me, mine: true, done: false }].sort((a, b) => a.juz - b.juz);
  } else if (!part) {
    return null;
  } else if (action === 'release') {
    if (part.done) return null;
    parts = parts.filter((p) => p.juz !== juz);
  } else if (action === 'read') {
    if (!part.done) {
      const today = Object.values(paid).reduce((sum, n) => sum + n, 0);
      xp = today + JUZ_XP <= JUZ_XP_DAY ? JUZ_XP : 0;
      nowPaid = { ...paid, [juz]: xp };
      parts = parts.map((p) => (p.juz === juz ? { ...p, done: true } : p));
    }
  } else if (part.done) {
    const { [juz]: back = 0, ...rest } = paid;
    xp = back ? -back : 0;
    nowPaid = rest;
    parts = parts.map((p) => (p.juz === juz ? { ...p, done: false } : p));
  }
  const read = parts.filter((p) => p.done).length;
  const mine = parts.filter((p) => p.mine);
  const members = k.members.map((m) => (m.isMe ? { ...m, taken: mine.length, read: mine.filter((p) => p.done).length } : m));
  const completed = !k.done && read === JUZ_COUNT;
  return { khatm: { ...k, parts, read, members, done: completed }, xp, completed, paid: nowPaid };
}

/**
 * The khatm after whoever started it took a member out: the juz they had not read are free again, the
 * ones they read stay read. The board knows a reader by name only, so this is for the examples; the
 * server answers with the board as it really is.
 */
export function withoutMember(k: GroupKhatm, key: string): GroupKhatm {
  const gone = k.members.find((m) => m.key === key);
  if (!gone || gone.isOwner || gone.isMe) return k;
  return {
    ...k,
    members: k.members.filter((m) => m.key !== key),
    parts: k.parts.filter((p) => p.done || p.mine || p.name !== gone.name),
  };
}

/** A khatm the moment the person starts it: they are its only reader and the board is empty. */
export const freshKhatm = (id: string, title: string, due: string | null, me: string): GroupKhatm => ({
  id, title, due, round: 1, owner: me, isOwner: true, joined: true, done: false, read: 0,
  members: [{ key: 'me0000', name: me, isMe: true, isOwner: true, taken: 0, read: 0 }],
  parts: [],
});

/** The next round of a complete khatm: the same people, an empty board. */
export const nextRound = (k: GroupKhatm): GroupKhatm => ({
  ...k,
  round: k.round + 1,
  done: false,
  read: 0,
  parts: [],
  members: k.members.map((m) => ({ ...m, taken: 0, read: 0 })),
});

// ---------- examples for ?demo=1 ----------

export function demoBuddies(meDone: boolean, now: number = Date.now()): Buddy[] {
  const day = 86_400_000;
  return [
    { id: 'demoaziz', name: 'Aziz', since: now - 40 * day, streak: 12, best: 21, meDone, theyDone: true, nudged: false, canNudge: false },
    { id: 'demomadi', name: 'Madina', since: now - 9 * day, streak: 5, best: 5, meDone, theyDone: false, nudged: false, canNudge: meDone },
    { id: 'demojasu', name: 'Jasur', since: now - 70 * day, streak: 0, best: 8, meDone, theyDone: false, nudged: false, canNudge: meDone },
  ];
}

/** Who the example invite link is from, and the pair that accepting it makes. */
export const demoInvite = (): BuddyInvite => ({ name: 'Sardor', mine: false, buddy: false, full: false, limit: false });

export const demoPair = (meDone: boolean, now: number = Date.now()): Buddy => ({
  id: 'demosard', name: demoInvite().name, since: now, streak: 0, best: 0, meDone, theyDone: false, nudged: false, canNudge: meDone,
});

/** The example khatm as someone sees it who opened its link and has not joined: it is `owner`'s, and nothing on it is theirs. */
export const demoGuest = (k: GroupKhatm, id: string, owner: string): GroupKhatm => ({
  ...k,
  id,
  owner,
  isOwner: false,
  joined: false,
  members: k.members.map((m) => (m.isMe ? { ...m, name: owner, isMe: false } : m)),
  parts: k.parts.map((p) => (p.mine ? { ...p, name: owner, mine: false } : p)),
});

/** And once they have joined it: the newest reader, with no juz yet. */
export const demoJoined = (k: GroupKhatm, me: string): GroupKhatm => ({
  ...k,
  joined: true,
  members: [...k.members, { key: 'me0000', name: me, isMe: true, isOwner: false, taken: 0, read: 0 }],
});

export function demoKhatm(title: string, me: string, due: string): GroupKhatm {
  // The person first (whatever they are called), then name, juz read, juz taken and still to read.
  const readers: [string, number[], number[]][] = [
    [me, [3, 4], [9]],
    ['Madina', [1, 2, 5], [10, 11]],
    ['Aziz', [6, 7], [12]],
    ['Jasur', [8], [13, 14]],
  ];
  const parts: KhatmPart[] = readers
    .flatMap(([name, read, taken], i) => [
      ...read.map((juz) => ({ juz, name, mine: i === 0, done: true })),
      ...taken.map((juz) => ({ juz, name, mine: i === 0, done: false })),
    ])
    .sort((a, b) => a.juz - b.juz);
  return {
    id: 'demokhtm',
    title,
    due,
    round: 1,
    owner: me,
    isOwner: true,
    joined: true,
    done: false,
    read: parts.filter((p) => p.done).length,
    members: readers.map(([name, read, taken], i) => ({ key: `demo0${i}`, name, isMe: i === 0, isOwner: i === 0, taken: read.length + taken.length, read: read.length })),
    parts,
  };
}
