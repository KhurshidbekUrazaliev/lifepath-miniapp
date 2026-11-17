// Buddy streaks and group khatms, which the bot's server keeps (worker/src/buddies.ts and gkhatm.ts).
// Their screens read the lists when they open; the cards on Home read them only when the server said
// at the start that there is something on them. With ?demo=1 nothing is asked: the examples from
// lib/together.ts stand in, and what the person taps changes them here.
import { useEffect } from 'react';
import { create } from 'zustand';
import { ApiError, api, useServer } from './server';
import { uid, useStore } from './store';
import { dayKey } from '../lib/dates';
import { shiftDay } from '../lib/habits';
import {
  Buddy, BuddyInvite, GroupKhatm, JuzAction, JuzPaid, MAX_BUDDIES, Seen,
  applyJuz, demoBuddies, demoGuest, demoInvite, demoJoined, demoKhatm, demoPair, freshKhatm, grownSince, nextRound, reportableDay, seenOf,
  upsertKhatm, withoutMember,
} from '../lib/together';
import { tgUser } from '../tg/telegram';
import { t } from '../i18n';

/** ?demo=1: the examples, and no server. */
export const DEMO = new URLSearchParams(window.location.search).has('demo');

/** Can these be used now? 'ok' with the server (or the examples), 'off' without it, 'unknown' while it is being asked. */
export function useTogetherStatus(): 'unknown' | 'ok' | 'off' {
  const status = useServer((s) => s.status);
  return DEMO ? 'ok' : status;
}

const myName = (): string => useStore.getState().profile.name || tgUser.firstName || t('common.guest');
const activeToday = (): boolean => useStore.getState().profile.streak.lastDay === dayKey();

/**
 * Asking the server for a list. Calls that overlap share one request. `changed()` says that something
 * was changed from here meanwhile: an answer already on its way is then out of date and is dropped.
 */
function asker() {
  let asked: Promise<void> | null = null;
  let turn = 0;
  return {
    ask<T>(read: () => Promise<T>, keep: (answer: T) => void, failed: () => void): Promise<void> {
      if (asked) return asked;
      const mine = turn;
      const going: Promise<void> = read()
        .then(
          (answer) => {
            if (mine === turn) keep(answer);
          },
          () => {
            if (mine === turn) failed();
          },
        )
        .finally(() => {
          if (asked === going) asked = null;
        });
      asked = going;
      return going;
    },
    changed(): void {
      turn++;
      asked = null;
    },
  };
}

// ---------- what this phone has shown already ----------

/** The streak of each pair and the round of each complete khatm when the person last looked. */
interface Looked {
  streaks: Seen;
  rounds: Record<string, number>;
}

const LOOKED_KEY = `lp:${tgUser.id}:together`;
// The examples begin a day behind, so the first look at them shows what a grown streak looks like.
let demoLooked: Looked = { streaks: { demoaziz: 11 }, rounds: {} };

function looked(): Looked {
  if (DEMO) return demoLooked;
  try {
    const saved = JSON.parse(localStorage.getItem(LOOKED_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { streaks: saved.streaks ?? {}, rounds: saved.rounds ?? {} };
  } catch {
    // nothing remembered
  }
  return { streaks: {}, rounds: {} };
}

function remember(patch: Partial<Looked>): void {
  const next = { ...looked(), ...patch };
  if (DEMO) {
    demoLooked = next;
    return;
  }
  try {
    localStorage.setItem(LOOKED_KEY, JSON.stringify(next));
  } catch {
    // the celebration may simply come once more
  }
}

// ---------- buddy streaks ----------

interface BuddyState {
  /** null until the server has answered once. */
  list: Buddy[] | null;
  failed: boolean;
  /** The person's own invite code, once they have one. */
  code: string | null;
  max: number;
  /** When the list was last read. */
  at: number;
  refresh: () => Promise<void>;
  /** The person's invite code, made the first time it is asked for. */
  invite: () => Promise<string>;
  /** Becomes the buddy of whoever shared the code. */
  accept: (code: string) => Promise<Buddy>;
  leave: (id: string) => Promise<void>;
  /** The bot tells the buddy that the person has done today's part (once a day). */
  nudge: (id: string) => Promise<void>;
}

const buddiesAsk = asker();
const DEMO_CODE = 'demo2345';

export const useBuddies = create<BuddyState>()((set, get) => ({
  list: null,
  failed: false,
  code: null,
  max: MAX_BUDDIES,
  at: 0,

  refresh: () => {
    if (DEMO) {
      // Made once; what the person then does to them stays.
      if (!get().list) set({ list: demoBuddies(activeToday()), code: DEMO_CODE, at: Date.now() });
      return Promise.resolve();
    }
    return buddiesAsk.ask(
      () => api<{ buddies: Buddy[]; code: string | null; max: number }>('GET', '/buddies'),
      (r) => set({ list: r.buddies, code: r.code, max: r.max, failed: false, at: Date.now() }),
      () => set((s) => ({ failed: s.list === null })),
    );
  },

  invite: async () => {
    const known = get().code;
    if (known) return known;
    const code = DEMO ? DEMO_CODE : (await api<{ code: string }>('POST', '/buddies/invite')).code;
    set({ code });
    return code;
  },

  accept: async (code) => {
    const activeDay = reportableDay(useStore.getState().profile.streak.lastDay, dayKey());
    const buddy = DEMO ? demoPair(activeToday()) : (await api<{ buddy: Buddy }>('POST', '/buddies/accept', { code, activeDay })).buddy;
    const loaded = get().list !== null;
    buddiesAsk.changed();
    set((s) => ({ list: [buddy, ...(s.list ?? []).filter((b) => b.id !== buddy.id)] }));
    // Accepted before the list was ever read: the other pairs are still to come.
    if (!loaded) void get().refresh();
    return buddy;
  },

  leave: async (id) => {
    if (!DEMO) await api('POST', '/buddies/leave', { id });
    buddiesAsk.changed();
    set((s) => ({ list: (s.list ?? []).filter((b) => b.id !== id) }));
  },

  nudge: async (id) => {
    try {
      if (!DEMO) await api('POST', '/buddies/nudge', { id });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      // The buddy has done their part meanwhile: there is nothing to send, and the list will say so.
      if (code === 'done') return get().refresh();
      // 'nudged' is a nudge that went out from another phone today: the same as one sent now.
      if (code !== 'nudged') throw e;
    }
    buddiesAsk.changed();
    set((s) => ({ list: (s.list ?? []).map((b) => (b.id === id ? { ...b, nudged: true, canNudge: false } : b)) }));
  },
}));

/** Whose invite a code is, for the person deciding whether to accept it. */
export const fetchInvite = (code: string): Promise<BuddyInvite> =>
  DEMO
    ? Promise.resolve(demoInvite())
    : api<{ invite: BuddyInvite }>('GET', `/buddies/invite?code=${encodeURIComponent(code)}`).then((r) => r.invite);

/**
 * The pairs whose streak has grown since the person last looked at their buddies, for a small
 * celebration. The look is remembered, so a day's growth is news once.
 */
export function takeGrown(list: Buddy[]): Buddy[] {
  const grown = grownSince(looked().streaks, list);
  remember({ streaks: seenOf(list) });
  return grown;
}

/** The server has just heard of the person's active day: a pair that was waiting for them has moved on. */
export function activeDayReported(day: string): void {
  const { list, refresh } = useBuddies.getState();
  if (!DEMO && day === dayKey() && list?.some((b) => !b.meDone)) void refresh();
}

// ---------- group khatm ----------

interface KhatmState {
  /** The khatms the person is in; null until the server has answered once. */
  list: GroupKhatm[] | null;
  failed: boolean;
  at: number;
  refresh: () => Promise<void>;
  start: (title: string, due: string | null) => Promise<GroupKhatm>;
  join: (id: string) => Promise<GroupKhatm>;
  /** Puts a khatm that was read on its own (opened by its link) on the list. */
  keep: (khatm: GroupKhatm) => void;
  leave: (id: string) => Promise<void>;
  /** Whoever started the khatm takes a member out of it. */
  remove: (id: string, key: string) => Promise<void>;
  /** Takes a juz, gives it back, marks it read or takes the mark back. The XP for a mark is added here. */
  juz: (id: string, juz: number, action: JuzAction) => Promise<{ xp: number; completed: boolean }>;
  /** Whoever started a complete khatm begins its next round. */
  next: (id: string) => Promise<void>;
  /** Whoever started the khatm deletes it for everyone. */
  destroy: (id: string) => Promise<void>;
}

const khatmsAsk = asker();
const DEMO_OWNER = 'Madina';
// What the marks made in the examples have brought today (the server keeps this for real ones).
let demoPaid: { day: string; paid: JuzPaid } = { day: '', paid: {} };

const example = (): GroupKhatm => demoKhatm(t('gk.demo.title'), myName(), shiftDay(dayKey(), 12));

export const useKhatms = create<KhatmState>()((set, get) => {
  const put = (khatm: GroupKhatm) => {
    khatmsAsk.changed();
    set((s) => ({ list: upsertKhatm(s.list ?? [], khatm) }));
  };
  const drop = (id: string) => {
    khatmsAsk.changed();
    set((s) => ({ list: (s.list ?? []).filter((k) => k.id !== id) }));
  };
  /** The example with this id, changed by `change` (null when the rules do not allow it). */
  const change = (id: string, fn: (k: GroupKhatm) => GroupKhatm | null): GroupKhatm => {
    const k = get().list?.find((x) => x.id === id);
    const next = k ? fn(k) : null;
    if (!next) throw new ApiError(409, 'not_allowed');
    return next;
  };

  return {
    list: null,
    failed: false,
    at: 0,

    refresh: () => {
      if (DEMO) {
        if (!get().list) set({ list: [example()], at: Date.now() });
        return Promise.resolve();
      }
      return khatmsAsk.ask(
        () => api<{ khatms: GroupKhatm[] }>('GET', '/gkhatm'),
        (r) => set({ list: r.khatms, failed: false, at: Date.now() }),
        () => set((s) => ({ failed: s.list === null })),
      );
    },

    start: async (title, due) => {
      const khatm = DEMO
        ? freshKhatm(`demo${Date.now().toString(36).slice(-4)}`, title, due, myName())
        : (await api<{ khatm: GroupKhatm }>('POST', '/gkhatm', { title, due })).khatm;
      put(khatm);
      return khatm;
    },

    join: async (id) => {
      const khatm = DEMO
        ? demoJoined(await fetchKhatm(id), myName())
        : (await api<{ khatm: GroupKhatm }>('POST', '/gkhatm/join', { id })).khatm;
      get().keep(khatm);
      return khatm;
    },

    keep: (khatm) => {
      const loaded = get().list !== null;
      put(khatm);
      // Opened by its link before the list was ever read: the person's other khatms are still to come.
      if (!loaded) void get().refresh();
    },

    leave: async (id) => {
      if (!DEMO) await api('POST', '/gkhatm/leave', { id });
      drop(id);
    },

    remove: async (id, key) => {
      put(
        DEMO
          ? change(id, (k) => withoutMember(k, key))
          : (await api<{ khatm: GroupKhatm }>('POST', '/gkhatm/remove', { id, key })).khatm,
      );
    },

    juz: async (id, juz, action) => {
      let done: { khatm: GroupKhatm; xp: number; completed: boolean };
      if (DEMO) {
        const today = dayKey();
        const k = get().list?.find((x) => x.id === id);
        const r = k ? applyJuz(k, juz, action, myName(), demoPaid.day === today ? demoPaid.paid : {}) : null;
        if (!r) throw new ApiError(409, 'taken');
        demoPaid = { day: today, paid: r.paid };
        done = r;
      } else {
        done = await api<typeof done>('POST', '/gkhatm/juz', { id, juz, action, day: dayKey() });
      }
      put(done.khatm);
      // The server has accepted the mark and said what it is worth (less than nothing when it was taken back).
      if (done.xp) useStore.getState().payJuz(done.xp);
      if (done.completed) celebrateKhatm(done.khatm);
      return { xp: done.xp, completed: done.completed };
    },

    next: async (id) => {
      put(
        DEMO
          ? change(id, (k) => (k.done && k.isOwner ? nextRound(k) : null))
          : (await api<{ khatm: GroupKhatm }>('POST', '/gkhatm/next', { id })).khatm,
      );
    },

    destroy: async (id) => {
      if (!DEMO) await api('POST', '/gkhatm/delete', { id });
      drop(id);
    },
  };
});

/** One khatm, joined or not (an invite link opens it before joining). */
export function fetchKhatm(id: string): Promise<GroupKhatm> {
  if (!DEMO) return api<{ khatm: GroupKhatm }>('GET', `/gkhatm/one?id=${encodeURIComponent(id)}`).then((r) => r.khatm);
  // Among the examples, any link that is not one of the person's khatms opens somebody else's.
  return Promise.resolve(useKhatms.getState().list?.find((k) => k.id === id) ?? demoGuest(example(), id, DEMO_OWNER));
}

/**
 * Confetti and a word for a khatm whose thirty juz are all read: once for each round on this phone, for
 * whoever read the last juz there and then, and for everyone else when they next open it.
 */
export function celebrateKhatm(k: GroupKhatm): void {
  if (!k.done || !k.joined) return;
  const rounds = looked().rounds;
  if ((rounds[k.id] ?? 0) >= k.round) return;
  remember({ rounds: { ...rounds, [k.id]: k.round } });
  useStore.setState((s) => ({ celebrations: [...s.celebrations, { id: uid(), kind: 'khatm', n: k.round }] }));
}

// ---------- for what is always on screen ----------

/** A list read this long ago is read again when a card that shows it comes on screen. */
const OLD_MS = 5 * 60_000;

/**
 * The buddies, for a card on Home: read once the server has said there are some, and again when what
 * is here has grown old. (Their own screen asks every time it opens.)
 */
export function useBuddyList(): Buddy[] | null {
  const status = useServer((s) => s.status);
  const some = useServer((s) => (s.together?.buddies ?? 0) > 0);
  const list = useBuddies((s) => s.list);
  useEffect(() => {
    const s = useBuddies.getState();
    const due = s.list ? s.list.length > 0 && Date.now() - s.at > OLD_MS : some;
    if (DEMO ? !s.list : status === 'ok' && due) void s.refresh();
  }, [status, some]);
  return list;
}

/** The group khatms, for a card on Home: read the same way. */
export function useKhatmList(): GroupKhatm[] | null {
  const status = useServer((s) => s.status);
  const some = useServer((s) => (s.together?.khatms ?? 0) > 0);
  const list = useKhatms((s) => s.list);
  useEffect(() => {
    const s = useKhatms.getState();
    const due = s.list ? s.list.length > 0 && Date.now() - s.at > OLD_MS : some;
    if (DEMO ? !s.list : status === 'ok' && due) void s.refresh();
  }, [status, some]);
  return list;
}
