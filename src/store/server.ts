// The parts that need the bot's server (a Cloudflare Worker): reminders, rankings, friend challenges,
// buddy streaks, group khatms, story pictures and Plus.
// Everything else works without it, so every call here is allowed to fail quietly.
import { create } from 'zustand';
import { inTelegram, initData, isNative, tgUser } from '../tg/telegram';
import { appToken, dropToken } from '../native/account';
import { startShared } from './sync';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`${status} ${code}`);
  }
}

function authHeader(): string | null {
  if (inTelegram) return `tma ${initData}`;
  // The phone app or a browser, once signed in through the bot (native/account.ts).
  const token = appToken();
  if (token) return `app ${token}`;
  if (import.meta.env.DEV) {
    // Local development against `wrangler dev` (the Worker only accepts this when DEV_AUTH=1).
    const json = JSON.stringify({ id: 1001, first_name: 'Dev', username: 'dev', language_code: 'en' });
    return `dev ${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  }
  return null;
}

/**
 * Calls the server. The body is sent as JSON, or as it is when it is a file (a Blob, such as a picture).
 * With `keepalive` the call is finished even if the page closes or reloads meanwhile (an error report).
 */
export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, keepalive = false): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new ApiError(0, 'outside_telegram');
  const file = body instanceof Blob ? body : null;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: auth, ...(body === undefined ? {} : { 'Content-Type': file ? file.type : 'application/json' }) },
      body: body === undefined ? undefined : file ?? JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const type = res.headers.get('content-type') ?? '';
  const json: any = type.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok || json === null) throw new ApiError(res.status, json?.error ?? 'server');
  return json as T;
}

export interface PlusInfo {
  active: boolean;
  expiresAt: number | null;
  priceStars: number;
  /** Plus is on because the bot's owner gave it, not because it was paid for. */
  gift?: boolean;
}

export interface RankProfile {
  optedIn: boolean;
  name: string | null;
  country: string | null;
}

export interface RankRow {
  rank: number;
  name: string;
  country: string | null;
  xp: number;
  level: number;
  isMe: boolean;
}

export interface Board {
  rows: RankRow[];
  me: { rank: number; xp: number } | null;
  total: number;
  weekEndsAt: number;
}

interface Hello {
  user: { id: number; firstName: string; username: string | null };
  plus: PlusInfo;
  /** What the bot's owner opened for this person (older servers do not send it). */
  access?: { levels: boolean; sparks?: number; wardrobe?: boolean };
  /** Sent only to the bot's owner. */
  admin?: boolean;
  rank: RankProfile;
  reminders: { enabled: boolean; canMessage: boolean };
  /** How many buddies and group khatms the person has (older servers do not send it). */
  together?: Together;
  bot: { username: string | null };
  now: number;
}

export interface Together {
  buddies: number;
  khatms: number;
}

interface ServerState {
  /** unknown = not asked yet, ok = reachable, off = not reachable (outside Telegram, offline, not deployed). */
  status: 'unknown' | 'ok' | 'off';
  plus: PlusInfo;
  /** The owner opened everything that waits for a level (wardrobe items for an older companion). */
  levelsOpen: boolean;
  /** Sparks the owner gave on top of the earned ones. */
  sparksGift: number;
  /** The owner opened the whole wardrobe: every item is this person's to wear. */
  wardrobeOpen: boolean;
  /** This is the bot's owner: the app shows them the admin panel. */
  admin: boolean;
  rank: RankProfile;
  canMessage: boolean;
  botUsername: string | null;
  /** What there was to load when the app opened; null while the server has not said. */
  together: Together | null;
  hello: (tz: string, lang: string) => Promise<void>;
  refreshPlus: () => Promise<PlusInfo | null>;
  saveRank: (profile: { optedIn: boolean; name: string; country: string | null }) => Promise<boolean>;
}

const PLUS_KEY = `lp:${tgUser.id}:plus`;

/** Plus is remembered on the device so it does not flicker off while the server is being asked. */
function cachedPlus(): PlusInfo {
  try {
    const p = JSON.parse(localStorage.getItem(PLUS_KEY) ?? 'null');
    if (p && typeof p.active === 'boolean') {
      const live = p.active && (!p.expiresAt || p.expiresAt > Date.now());
      return { active: live, expiresAt: p.expiresAt ?? null, priceStars: p.priceStars ?? 150 };
    }
  } catch {
    // ignore
  }
  return { active: false, expiresAt: null, priceStars: 150 };
}

const rememberPlus = (plus: PlusInfo) => {
  try {
    localStorage.setItem(PLUS_KEY, JSON.stringify(plus));
  } catch {
    // ignore
  }
};

const LEVELS_KEY = `lp:${tgUser.id}:levels`;

/** Remembered like Plus, so the wardrobe does not lock again while the server is being asked. */
function cachedLevels(): boolean {
  try {
    return localStorage.getItem(LEVELS_KEY) === '1';
  } catch {
    return false;
  }
}

const rememberLevels = (open: boolean) => {
  try {
    if (open) localStorage.setItem(LEVELS_KEY, '1');
    else localStorage.removeItem(LEVELS_KEY);
  } catch {
    // ignore
  }
};

const WARDROBE_KEY = `lp:${tgUser.id}:wardrobe`;

/** Remembered like the levels, so the wardrobe stays open while the server is being asked. */
function cachedWardrobe(): boolean {
  try {
    return localStorage.getItem(WARDROBE_KEY) === '1';
  } catch {
    return false;
  }
}

const rememberWardrobe = (open: boolean) => {
  try {
    if (open) localStorage.setItem(WARDROBE_KEY, '1');
    else localStorage.removeItem(WARDROBE_KEY);
  } catch {
    // ignore
  }
};

const GIFT_KEY = `lp:${tgUser.id}:gift`;

function cachedGift(): number {
  try {
    const n = Number(localStorage.getItem(GIFT_KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

const rememberGift = (sparks: number) => {
  try {
    if (sparks > 0) localStorage.setItem(GIFT_KEY, String(sparks));
    else localStorage.removeItem(GIFT_KEY);
  } catch {
    // ignore
  }
};

export const useServer = create<ServerState>()((set) => ({
  status: 'unknown',
  plus: cachedPlus(),
  levelsOpen: cachedLevels(),
  sparksGift: cachedGift(),
  wardrobeOpen: cachedWardrobe(),
  admin: false,
  rank: { optedIn: false, name: null, country: null },
  canMessage: false,
  botUsername: null,
  together: null,

  hello: async (tz, lang) => {
    try {
      const h = await api<Hello>('POST', '/hello', { tz, lang });
      const levelsOpen = h.access?.levels === true;
      const sparksGift = Math.max(0, Math.floor(h.access?.sparks ?? 0));
      rememberPlus(h.plus);
      rememberLevels(levelsOpen);
      rememberGift(sparksGift);
      const wardrobeOpen = h.access?.wardrobe === true;
      rememberWardrobe(wardrobeOpen);
      if (!inTelegram) {
        // Signed in on the phone or in a browser: the name and @username come from the server, as Telegram gives them in the Mini App.
        tgUser.id = h.user.id;
        tgUser.firstName = h.user.firstName;
        tgUser.username = h.user.username ?? undefined;
      }
      set({
        status: 'ok',
        plus: h.plus,
        levelsOpen,
        sparksGift,
        wardrobeOpen,
        admin: h.admin === true,
        rank: h.rank,
        // On the phone, reminders are the phone's notifications (serverSync.ts keeps this in step).
        ...(isNative ? {} : { canMessage: h.reminders.canMessage }),
        botUsername: h.bot.username,
        together: h.together ?? null,
      });
      // The shared copy of the data, which the Mini App and the phone app both keep in step (store/sync.ts).
      startShared();
    } catch (e) {
      // A phone whose session the server no longer knows signs out quietly; its data stays.
      if (!inTelegram && e instanceof ApiError && e.status === 401) dropToken();
      set({ status: 'off' });
    }
  },

  refreshPlus: async () => {
    try {
      const plus = await api<PlusInfo>('GET', '/plus');
      rememberPlus(plus);
      set({ plus });
      return plus;
    } catch {
      return null;
    }
  },

  saveRank: async (profile) => {
    try {
      const rank = await api<RankProfile>('PUT', '/rankings/profile', profile);
      set({ rank });
      return true;
    } catch {
      return false;
    }
  },
}));

export const usePlus = (): boolean => useServer((s) => s.plus.active);
export const useLevelsOpen = (): boolean => useServer((s) => s.levelsOpen);
export const useSparksGift = (): number => useServer((s) => s.sparksGift);
export const useWardrobeOpen = (): boolean => useServer((s) => s.wardrobeOpen);
