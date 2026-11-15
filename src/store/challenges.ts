// Friend challenges, kept by the bot's server. The list is refreshed when its screen opens; joining and
// starting send the counters the scores are measured from.
import { create } from 'zustand';
import { api } from './server';
import { snapshot, useStore } from './store';
import { Challenge, ChallengeKind, counters, upsertChallenge } from '../lib/challenges';

interface ChallengeState {
  /** null until the server has answered once. */
  list: Challenge[] | null;
  failed: boolean;
  refresh: () => Promise<void>;
  start: (kind: ChallengeKind, days: number) => Promise<Challenge>;
  join: (id: string) => Promise<Challenge>;
  leave: (id: string) => Promise<void>;
}

const keep = (c: Challenge) => useChallenges.setState((s) => ({ list: upsertChallenge(s.list ?? [], c) }));
const joined = () => useStore.getState().unlockBadge('challenge-join');

export const useChallenges = create<ChallengeState>()((set) => ({
  list: null,
  failed: false,

  refresh: async () => {
    try {
      const { challenges } = await api<{ challenges: Challenge[] }>('GET', '/challenges');
      set({ list: challenges, failed: false });
    } catch {
      set((s) => ({ failed: s.list === null }));
    }
  },

  start: async (kind, days) => {
    const { challenge } = await api<{ challenge: Challenge }>('POST', '/challenges', { kind, days, counters: counters(snapshot()) });
    keep(challenge);
    joined();
    return challenge;
  },

  join: async (id) => {
    const { challenge } = await api<{ challenge: Challenge }>('POST', '/challenges/join', { id, counters: counters(snapshot()) });
    keep(challenge);
    joined();
    return challenge;
  },

  leave: async (id) => {
    await api('POST', '/challenges/leave', { id });
    set((s) => ({ list: (s.list ?? []).filter((c) => c.id !== id) }));
  },
}));

/** One challenge, joined or not (an invite link opens it before joining). */
export const fetchChallenge = (id: string): Promise<Challenge> =>
  api<{ challenge: Challenge }>('GET', `/challenges/one?id=${encodeURIComponent(id)}`).then((r) => r.challenge);
