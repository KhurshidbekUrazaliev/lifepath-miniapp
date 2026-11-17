// Home under the companion: which cards there are, the order the person gave them, what they hid,
// which one the time of day lifts to the top, and the sky behind the companion. Pure, so it can be tested.
import type { Settings } from './types';

/** The cards of Home in the order they come when nobody has moved them. */
export const HOME_BLOCKS = ['special', 'prayer', 'journal', 'buddy', 'ayah', 'adhkar', 'gkhatm', 'ring', 'quick', 'habits', 'plan', 'goals'] as const;
export const HOME_READY = HOME_BLOCKS;
export type HomeBlock = (typeof HOME_BLOCKS)[number];

const isBlock = (id: string): id is HomeBlock => (HOME_BLOCKS as readonly string[]).includes(id);

/**
 * The person's order. A card they have never placed (one a later version added) goes after the card it
 * follows in the usual order, so a new card turns up where it belongs and not at the bottom.
 */
export function homeOrder(s: Pick<Settings, 'home'>): HomeBlock[] {
  const saved = (s.home?.order ?? []).filter(isBlock).filter((id, i, all) => all.indexOf(id) === i);
  if (saved.length === 0) return [...HOME_BLOCKS];
  const out = [...saved];
  HOME_BLOCKS.forEach((id, i) => {
    if (out.includes(id)) return;
    // after the nearest card before it in the usual order that is already placed
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) at = out.indexOf(HOME_BLOCKS[j]);
    out.splice(at + 1, 0, id);
  });
  return out;
}

/** The three cards that had a switch of their own before Home could be arranged; they keep it. */
const OWN_SWITCH: Partial<Record<HomeBlock, 'prayerCard' | 'verse' | 'journalCard'>> = { prayer: 'prayerCard', ayah: 'verse', journal: 'journalCard' };

type HomeView = Pick<Settings, 'home' | 'prayerCard' | 'verse' | 'journalCard'>;

/** The cards hidden through Home's own list. Until one is saved, the adhkar follow the prayer card, as they did. */
function hiddenList(s: HomeView): string[] {
  return s.home?.hidden ?? (s.prayerCard === false ? ['adhkar'] : []);
}

export function homeHidden(s: HomeView, id: HomeBlock): boolean {
  const own = OWN_SWITCH[id];
  if (own === 'verse') return !s.verse;
  if (own) return s[own] === false;
  return hiddenList(s).includes(id);
}

/** The change to Settings that shows or hides a card. */
export function hideHome(s: HomeView, id: HomeBlock, hidden: boolean): Partial<Settings> {
  const own = OWN_SWITCH[id];
  const list = hiddenList(s).filter((x) => x !== id);
  // Saving the list even for a card with its own switch makes what was inherited explicit from now on.
  const home = { ...s.home, hidden: own || !hidden ? list : [...list, id] };
  return own ? { [own]: !hidden, home } : { home };
}

export interface HomeMoment {
  /** The hour on the phone's clock. */
  hour: number;
  /** A prayer is close (prayerIsNear). */
  prayerNear: boolean;
  /** The adhkar of this part of the day are due and not yet read. */
  adhkarDue: boolean;
  /** Today already has a diary entry. */
  written: boolean;
}

/**
 * The card the time of day asks for, or none. Near a prayer it is the prayer card; in the morning and the
 * evening the adhkar until they are read, then the day's question until it is written.
 */
export function cardForNow(m: HomeMoment, shown: (id: HomeBlock) => boolean): HomeBlock | null {
  const wants: HomeBlock[] = [];
  if (m.prayerNear) wants.push('prayer');
  if (m.adhkarDue) wants.push('adhkar');
  if (!m.written && ((m.hour >= 5 && m.hour < 11) || m.hour >= 19)) wants.push('journal');
  return wants.find(shown) ?? null;
}

/** The order Home draws: the person's own, with the card for this moment first when Home follows the day. */
export function homeNow(s: Pick<Settings, 'home'>, lift: HomeBlock | null): HomeBlock[] {
  const order = homeOrder(s);
  if (s.home?.auto === false || !lift || order[0] === lift) return order;
  return [lift, ...order.filter((id) => id !== lift)];
}

/**
 * A prayer is close: the next prayer is within half an hour, or the one whose time it is has not been
 * ticked and either began within 45 minutes or ends within half an hour. Sunrise is a time, not a
 * prayer: nothing is close when it is merely next, unless Fajr is still open.
 */
export function prayerIsNear(m: { toNext: number; nextIsPrayer: boolean; sinceCurrent: number; currentOpen: boolean }): boolean {
  const min = 60_000;
  if (m.nextIsPrayer && m.toNext <= 30 * min) return true;
  return m.currentOpen && (m.sinceCurrent <= 45 * min || m.toNext <= 30 * min);
}

// ---------- the sky behind the companion ----------

export type SkyPhase = 'night' | 'dawn' | 'morning' | 'day' | 'gold' | 'dusk';

/**
 * The part of the day, from the prayer time we are in where a place is set (before Fajr and after Isha it
 * is night), otherwise from the clock.
 */
export function skyPhase(current: string | null | undefined, hour: number): SkyPhase {
  if (current !== undefined) {
    switch (current) {
      case 'fajr': return 'dawn';
      case 'sunrise': return 'morning';
      case 'dhuhr': return 'day';
      case 'asr': return 'gold';
      case 'maghrib': return 'dusk';
      default: return 'night';
    }
  }
  if (hour < 5 || hour >= 20) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 16) return 'day';
  if (hour < 18) return 'gold';
  return 'dusk';
}

// ---------- what the companion does about a deed ----------

/** The gesture that answers something just done (the names are the companion's motions). */
export function gestureFor(c: { kind: string; from?: string }): 'cheer' | 'dua' | 'read' | 'nod' | 'wave' | null {
  switch (c.kind) {
    case 'xp':
      switch (c.from) {
        case 'prayer': case 'adhkar': case 'fast': return 'dua';
        case 'quran': return 'read';
        case 'todo': case 'journal': return 'nod';
        default: return 'cheer';
      }
    case 'khatm': return 'dua';
    case 'streak': return 'wave';
    case 'complete': case 'levelup': case 'achievement': case 'item': return 'cheer';
    default: return null;
  }
}
