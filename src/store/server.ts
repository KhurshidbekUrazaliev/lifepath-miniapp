// The parts that need the bot's server (a Cloudflare Worker): reminders, rankings, friend challenges,
// story pictures and Plus.
// Everything else works without it, so every call here is allowed to fail quietly.
import { create } from 'zustand';
import { inTelegram, initData, tgUser } from '../tg/telegram';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`${status} ${code}`);
  }
}

function authHeader(): string | null {
  if (inTelegram) return `tma ${initData}`;
  if (import.meta.env.DEV) {
    // Local development against `wrangler dev` (the Worker only accepts this when DEV_AUTH=1).
    const json = JSON.stringify({ id: 1001, first_name: 'Dev', username: 'dev', language_code: 'en' });
    return `dev ${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  }
  return null;
}

/** Calls the server. The body is sent as JSON, or as it is when it is a file (a Blob, such as a picture). */
export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new ApiError(0, 'outside_telegram');
  const file = body instanceof Blob ? body : null;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: auth, ...(body === undefined ? {} : { 'Content-Type': file ? file.type : 'application/json' }) },
      body: body === undefined ? undefined : file ?? JSON.stringify(body),
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
  rank: RankProfile;
  reminders: { enabled: boolean; canMessage: boolean };
  bot: { username: string | null };
  now: number;
}

interface ServerState {
  /** unknown = not asked yet, ok = reachable, off = not reachable (outside Telegram, offline, not deployed). */
  status: 'unknown' | 'ok' | 'off';
  plus: PlusInfo;
  rank: RankProfile;
  canMessage: boolean;
  botUsername: string | null;
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

export const useServer = create<ServerState>()((set) => ({
  status: 'unknown',
  plus: cachedPlus(),
  rank: { optedIn: false, name: null, country: null },
  canMessage: false,
  botUsername: null,

  hello: async (tz, lang) => {
    try {
      const h = await api<Hello>('POST', '/hello', { tz, lang });
      rememberPlus(h.plus);
      set({ status: 'ok', plus: h.plus, rank: h.rank, canMessage: h.reminders.canMessage, botUsername: h.bot.username });
    } catch {
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
