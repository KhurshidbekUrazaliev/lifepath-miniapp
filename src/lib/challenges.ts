// Friend challenges: a short race between friends who joined by an invite link. The bot's server keeps
// the board; the app reports four counters with its activity, and a member's score is how far their
// counter has moved since they joined (worker/src/challenges.ts).
import type { Checks, Profile } from './types';
import { PRAYERS } from './prayerTimes';

export type ChallengeKind = 'xp' | 'prayer' | 'quran' | 'focus';
export const CHALLENGE_KINDS: ChallengeKind[] = ['xp', 'prayer', 'quran', 'focus'];
export const CHALLENGE_DAYS = [3, 7, 14, 30];
export const KIND_EMOJI: Record<ChallengeKind, string> = { xp: '⭐', prayer: '🕌', quran: '📖', focus: '🎯' };

export type Counters = Record<ChallengeKind, number>;

export interface ChallengeMember {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  days: number;
  startsAt: number;
  endsAt: number;
  ended: boolean;
  owner: string;
  isOwner: boolean;
  joined: boolean;
  members: ChallengeMember[];
}

const MAX_COUNTER = 1_000_000_000;
const whole = (n: number | undefined): number => Math.min(MAX_COUNTER, Math.max(0, Math.floor(n ?? 0)));

function bits(n: number): number {
  let count = 0;
  for (let v = n >>> 0; v; v &= v - 1) count++;
  return count;
}

/** The counters a score is measured on: total XP, prayers marked, Qurʼan pages read, focus minutes. */
export function counters(d: { profile: Profile; worship: Checks }): Counters {
  let prayer = 0;
  for (const month of Object.values(d.worship)) for (const key of PRAYERS) prayer += bits(month[key] ?? 0);
  return {
    xp: whole(d.profile.xp),
    prayer: whole(prayer),
    quran: whole(d.profile.quranPages),
    focus: whole(d.profile.focus?.total),
  };
}

/** The link that opens the challenge in the app (and joins it with one tap). */
export const inviteLink = (bot: string | null, id: string): string =>
  bot ? `https://t.me/${bot}?startapp=ch_${id}` : 'https://t.me';

/** Running challenges first (the one ending soonest on top), then the ones that ended, newest first. */
export const sortChallenges = (list: Challenge[]): Challenge[] =>
  [...list].sort((a, b) => Number(a.ended) - Number(b.ended) || (a.ended ? b.endsAt - a.endsAt : a.endsAt - b.endsAt));

export const myPlace = (c: Challenge): ChallengeMember | undefined => c.members.find((m) => m.isMe);

/** Whole days left, counting a part of a day as a day; 0 once it has ended. */
export const daysLeft = (c: Challenge, now: number): number => Math.max(0, Math.ceil((c.endsAt - now) / 86_400_000));

export const timeRatio = (c: Challenge, now: number): number =>
  Math.min(1, Math.max(0, (now - c.startsAt) / Math.max(1, c.endsAt - c.startsAt)));

/** The list with this challenge put first (replacing the copy it had, if any). */
export const upsertChallenge = (list: Challenge[], c: Challenge): Challenge[] => [c, ...list.filter((x) => x.id !== c.id)];
