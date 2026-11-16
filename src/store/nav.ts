// Where the user is: one of four tabs, a stack of screens pushed on top, and at most one bottom sheet.
import { create } from 'zustand';
import { haptic } from '../tg/telegram';
import type { Feeling } from '../lib/types';

export type Tab = 'home' | 'you' | 'stats' | 'inbox';

export type Screen =
  | { name: 'tasks' }
  | { name: 'habits' }
  | { name: 'calendar'; day?: string }
  | { name: 'goals' }
  | { name: 'goal'; id: string }
  | { name: 'area'; id: string }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'appearance' }
  | { name: 'language' }
  | { name: 'notifications' }
  | { name: 'data' }
  | { name: 'about' }
  | { name: 'faith' }
  | { name: 'reciter' }
  | { name: 'method' }
  | { name: 'prayer' }
  | { name: 'qibla' }
  | { name: 'adhkar'; session?: 'am' | 'pm' }
  | { name: 'khatm' }
  | { name: 'focus'; taskId?: string }
  | { name: 'echo' }
  | { name: 'shop' }
  | { name: 'rankings' }
  | { name: 'challenges' }
  | { name: 'challenge'; id: string }
  | { name: 'plus' }
  | { name: 'admin' }
  | { name: 'journal'; tab?: 'diary' | 'notes' }
  // One page of the journal. Without an id it is a new one: a diary entry (about `day`, today when left
  // out) or a note; `mood` and `ask` are what the page starts with.
  | { name: 'page'; id?: string; kind?: 'note'; day?: string; mood?: Feeling; ask?: string }
  | { name: 'lookback' };

export type Sheet =
  | { name: 'add' }
  | { name: 'log'; taskId: string; planId?: string }
  | { name: 'task'; id?: string; day?: string; taskId?: string }
  | { name: 'habit'; id?: string }
  | { name: 'goal'; id?: string; folderId?: string }
  | { name: 'area'; id?: string }
  | { name: 'proof'; entryId: string }
  | { name: 'planner'; taskId: string }
  | { name: 'reminder'; taskId: string }
  | { name: 'echo' }
  | { name: 'hadith'; n: number }
  | { name: 'ayah'; id: string }
  | { name: 'place' }
  | { name: 'rank' }
  | { name: 'challengeNew' }
  | { name: 'entry'; entryId: string };

export type Route = Screen & { key: string };

interface Nav {
  tab: Tab;
  stack: Route[];
  sheet: Sheet | null;
  go: (tab: Tab) => void;
  push: (screen: Screen) => void;
  pop: () => void;
  open: (sheet: Sheet) => void;
  close: () => void;
}

let seq = 0;

export const useNav = create<Nav>()((set, get) => ({
  tab: 'home',
  stack: [],
  sheet: null,
  go: (tab) => {
    const s = get();
    if (s.tab === tab && s.stack.length === 0) return;
    haptic('select');
    set({ tab, stack: [], sheet: null });
  },
  push: (screen) => {
    const top = get().stack[get().stack.length - 1];
    if (top && top.name === screen.name && JSON.stringify({ ...top, key: '' }) === JSON.stringify({ ...screen, key: '' })) return;
    haptic('light');
    set((s) => ({ stack: [...s.stack, { ...screen, key: `${screen.name}-${++seq}` }], sheet: null }));
  },
  pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  open: (sheet) => {
    haptic('light');
    set({ sheet });
  },
  close: () => set({ sheet: null }),
}));

/**
 * Opens whatever a deep link points at: "goal_<id>", "ch_<id>" (a friend challenge), "write" (a new
 * diary entry, from the journal reminder), or a screen's name.
 */
export function openDeepLink(param: string | undefined): void {
  if (!param) return;
  const nav = useNav.getState();
  const [kind, id] = param.split('_');
  if (kind === 'goal' && id) nav.push({ name: 'goal', id });
  else if (kind === 'ch' && id) nav.push({ name: 'challenge', id });
  else if (kind === 'write') nav.push({ name: 'page' });
  else if (kind === 'journal') nav.push({ name: 'journal' });
  else if (
    kind === 'habits' || kind === 'tasks' || kind === 'calendar' || kind === 'plus' || kind === 'rankings' || kind === 'goals' ||
    kind === 'prayer' || kind === 'qibla' || kind === 'adhkar' || kind === 'khatm' || kind === 'focus' || kind === 'challenges'
  ) {
    nav.push({ name: kind });
  }
}
