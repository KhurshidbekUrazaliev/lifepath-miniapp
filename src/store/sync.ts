// Saves the store: instantly to this device, then to the clouds.
//
// There are two: the user's Telegram CloudStorage (inside Telegram), and the shared copy on the bot's
// server (worker/src/app.ts), which the Mini App and the Android app both sync with, so the two stay
// the same. The server's copy never holds the journal: its records are left out on the way up, and the
// journal on this device is kept as it is whatever comes down.
//
// Both run the same steps (a Syncer): pull when the other side has a newer revision, merge three ways
// against what both last agreed on, push what differs, and announce it with the manifest last. The
// layout and merge rules are pure and live in lib/cloudCodec.ts; this file does timing and I/O.
import { create } from 'zustand';
import { cloud, hasCloud, inTelegram, onTelegramEvent, tgUser } from '../tg/telegram';
import {
  KeyMap, MANIFEST_KEY, Placement, chunksOf, decode, diff, encode, keysOf, manifestFor, merge, parseManifest, sameData, unlisted, usage,
} from '../lib/cloudCodec';
import { Data } from '../lib/stats';
import { writeBackup } from '../lib/backup';
import { dataChanged, emptyData, snapshot, useStore } from './store';
import { api } from './server';

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: number;
  /** False until the first read of the cloud finished (or failed) on a device with no saved copy. */
  ready: boolean;
  usage: { bytes: number; keys: number; share: number };
  /** The shared copy on the server: off until the server answers (outside Telegram: until signed in). */
  shared: 'off' | SyncStatus;
  sharedAt?: number;
}

export const useSync = create<SyncState>()(() => ({
  status: hasCloud ? 'idle' : 'local',
  ready: false,
  usage: { bytes: 0, keys: 0, share: 0 },
  shared: 'off',
}));

// ---------- Where the copies live ----------

interface Store {
  getItem(key: string): Promise<string | undefined>;
  getItems(keys: string[]): Promise<KeyMap>;
  setItems(pairs: [string, string][]): Promise<void>;
  removeItems(keys: string[]): Promise<void>;
  getKeys(): Promise<string[]>;
}

const telegramStore: Store = {
  getItem: async (key) => (await cloud.getItem(key)) || undefined,
  async getItems(keys) {
    const out: KeyMap = {};
    for (let i = 0; i < keys.length; i += 40) {
      const got = await cloud.getItems(keys.slice(i, i + 40));
      for (const k of Object.keys(got)) if (got[k]) out[k] = got[k];
    }
    return out;
  },
  async setItems(pairs) {
    let next = 0;
    const worker = async () => {
      while (next < pairs.length) {
        const [key, value] = pairs[next++];
        await cloud.setItem(key, value);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  },
  removeItems: (keys) => cloud.removeItems(keys).then(() => undefined),
  getKeys: () => cloud.getKeys(),
};

/** The shared copy on the server. It takes the same keys, except the journal's, which it refuses. */
const serverStore: Store = {
  getItem: async (key) => (await api<{ items: KeyMap }>('POST', '/kv/get', { keys: [key] })).items[key],
  async getItems(keys) {
    const out: KeyMap = {};
    for (let i = 0; i < keys.length; i += 100) {
      Object.assign(out, (await api<{ items: KeyMap }>('POST', '/kv/get', { keys: keys.slice(i, i + 100) })).items);
    }
    return out;
  },
  async setItems(pairs) {
    // About 100 KB per call: values are up to ~4 KB each.
    for (let i = 0; i < pairs.length; i += 25) {
      await api('POST', '/kv/set', { items: Object.fromEntries(pairs.slice(i, i + 25)) });
    }
  },
  async removeItems(keys) {
    for (let i = 0; i < keys.length; i += 100) await api('POST', '/kv/remove', { keys: keys.slice(i, i + 100) });
  },
  getKeys: async () => (await api<{ keys: string[] }>('GET', '/kv/keys')).keys,
};

// ---------- One cloud's sync ----------

interface Cache {
  rev: number; // the cloud revision this device last saw
  cloud: KeyMap; // what the cloud held at that revision (the merge base)
  pending?: Data; // local state not in the cloud yet (the Telegram syncer only: it also keeps this device's copy)
}

/** The data as the shared copy may hold it: everything but the journal. */
const withoutJournal = (d: Data): Data => ({ ...d, pages: [] });

class Syncer {
  cache: Cache = { rev: 0, cloud: {} };
  placement: Placement = new Map();
  base: Data | null = null;
  /** Nothing was ever saved on this device (the Telegram cloud only: the first pull is taken as it is). */
  fresh = true;
  private running: Promise<void> | null = null;
  private again = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;

  constructor(
    readonly store: Store,
    readonly cacheKey: string,
    /** False for the shared copy: the journal stays on the device. */
    readonly journal: boolean,
    readonly report: (state: { status: SyncStatus; at?: number; map?: KeyMap }) => void,
    /** Whether this cloud can be reached right now. */
    readonly available: () => boolean,
  ) {}

  writeCache(): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
    } catch {
      try {
        // Out of room: keep the unsaved data and drop the copy of the cloud (the next sync merges without a base).
        localStorage.setItem(this.cacheKey, JSON.stringify({ rev: 0, cloud: {}, pending: this.cache.pending }));
      } catch {
        // storage is unavailable; the cloud copy still protects the data
      }
    }
  }

  /** Reads this device's copy of the cloud. Returns the data it holds for this device, or null. */
  readCache(): Data | null {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Cache;
      if (!parsed || typeof parsed !== 'object') return null;
      this.cache = { rev: parsed.rev ?? 0, cloud: parsed.cloud ?? {}, pending: parsed.pending };
      this.fresh = false;
      const hasCloudCopy = Object.keys(this.cache.cloud).length > 0;
      if (hasCloudCopy) {
        const d = decode(this.cache.cloud, emptyData());
        this.placement = d.placement;
        this.base = d.data;
      }
      if (this.cache.pending) return { ...emptyData(), ...this.cache.pending };
      return hasCloudCopy ? this.base : null;
    } catch {
      return null;
    }
  }

  /** What this cloud should hold for `d`. */
  private shape(d: Data): Data {
    return this.journal ? d : withoutJournal(d);
  }

  /** Pulls what another device saved, merges it, and pushes what this device changed. Safe to call often. */
  sync(): Promise<void> {
    if (!this.available()) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.report({ status: 'syncing' });
      try {
        const remoteManifest = parseManifest(await this.store.getItem(MANIFEST_KEY));

        if (remoteManifest && remoteManifest.rev !== this.cache.rev) {
          // Another device saved since this one last looked (or this device never looked): pull and merge.
          const keys = keysOf(remoteManifest);
          // An older copy of the app saved last: what it does not know about is still there, just not counted.
          const older = unlisted(remoteManifest).filter((kind) => this.journal || kind !== 'j');
          if (older.length) keys.push(...chunksOf(await this.store.getKeys(), older));
          const remoteMap = await this.store.getItems(this.journal ? keys : keys.filter((k) => !/^j\d+$/.test(k)));
          const remote = decode(remoteMap, emptyData());
          const local = snapshot();
          let merged: Data;
          if (this.journal) {
            const untouched = this.fresh && !this.cache.pending;
            merged = untouched ? remote.data : merge(local, this.base, remote.data);
          } else {
            // The journal is this device's alone: what comes down never has it, and must not take it away.
            const keep = (d: Data): Data => ({ ...d, pages: local.pages });
            merged = merge(local, this.base ? keep(this.base) : null, keep(remote.data));
          }
          this.placement = remote.placement;
          this.base = remote.data;
          this.cache.cloud = { ...remoteMap, [MANIFEST_KEY]: JSON.stringify(remoteManifest) };
          this.cache.rev = remoteManifest.rev;
          if (!sameData(merged, local)) {
            applying = this;
            useStore.getState().replaceData(merged);
            applying = null;
          }
        } else if (!remoteManifest && this.cache.rev > 0) {
          // The cloud is empty although this device had synced before: write everything again.
          this.cache = { rev: 0, cloud: {}, pending: this.cache.pending };
          this.placement = new Map();
          this.base = null;
        }
        this.fresh = false;

        // Push whatever differs from what the cloud holds.
        const data = snapshot();
        const target = encode(this.shape(data), this.placement);
        const { write, remove } = diff(this.cache.cloud, target);
        if (write.length || remove.length || !remoteManifest) {
          const rev = this.cache.rev + 1;
          await this.store.setItems(write.map((k) => [k, target[k]]));
          const manifest = JSON.stringify(manifestFor(target, rev));
          await this.store.setItems([[MANIFEST_KEY, manifest]]); // last, so a half-finished save is never announced
          if (remove.length) await this.store.removeItems(remove).catch(() => undefined);
          this.cache.cloud = { ...target, [MANIFEST_KEY]: manifest };
          this.cache.rev = rev;
          this.base = this.shape(data);
        }
        if (this.journal) {
          const now = snapshot();
          this.cache.pending = dataChanged(now, data) ? now : undefined; // edits made while saving stay pending
          if (this.cache.pending) this.again = true;
        }
        this.writeCache();
        this.failures = 0;
        this.report({ status: 'idle', at: Date.now(), map: this.cache.cloud });
      } catch {
        this.failures++;
        this.report({ status: 'offline' });
        clearTimeout(this.retry);
        this.retry = setTimeout(() => void this.sync(), Math.min(120_000, 4000 * 2 ** Math.min(this.failures, 5)));
      }
    })();
    return this.running.finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    });
  }
}

/** The syncer whose pull is being put into the store right now (its own change is not a change to push back). */
let applying: Syncer | null = null;

/** The Telegram cloud. Its cache is also this device's own copy of everything, the journal included. */
const telegram = new Syncer(
  telegramStore,
  `lp:${tgUser.id}:cache`,
  true,
  ({ status, at, map }) =>
    useSync.setState({
      status,
      ready: status === 'syncing' ? useSync.getState().ready : true,
      ...(at ? { lastSyncedAt: at } : {}),
      ...(map ? { usage: usage(map) } : {}),
    }),
  () => hasCloud,
);

/** The shared copy can be used once the server answered (outside Telegram: once signed in). */
let sharedOn = false;

const shared = new Syncer(
  serverStore,
  `lp:${tgUser.id}:shared`,
  false,
  ({ status, at }) => {
    useSync.setState({ shared: status, ...(at ? { sharedAt: at } : {}) });
    // Outside Telegram the shared copy is the only cloud, so the usual sync line shows it.
    if (!inTelegram) useSync.setState({ status, ...(at ? { lastSyncedAt: at } : {}) });
  },
  () => sharedOn,
);

/** Reads this device's saved copy. Returns null on a device that has none. */
export function readCache(): Data | null {
  shared.readCache();
  return telegram.readCache();
}

/** Syncs with every cloud this device can reach. */
export function syncNow(): Promise<void> {
  return Promise.all([telegram.sync(), shared.sync()]).then(() => undefined);
}

/** The server answered: from now on the shared copy is kept in step too (server.ts calls this). */
export function startShared(): void {
  if (sharedOn) return;
  sharedOn = true;
  void shared.sync();
}

/** Signed out of the phone app: forget this device's copy of the shared data (the data itself stays). */
export function clearShared(): void {
  sharedOn = false;
  shared.cache = { rev: 0, cloud: {} };
  shared.placement = new Map();
  shared.base = null;
  try {
    localStorage.removeItem(shared.cacheKey);
  } catch {
    // nothing saved
  }
  useSync.setState({ shared: 'off', ...(!inTelegram ? { status: 'local' as SyncStatus } : {}) });
}

// ---------- Wiring ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let sharedTimer: ReturnType<typeof setTimeout> | undefined;

function noteChange(from: Syncer | null): void {
  // This device's copy, kept by the Telegram syncer's cache (which works with no Telegram cloud at all).
  if (from !== telegram) {
    telegram.cache.pending = snapshot();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => telegram.writeCache(), 200);
    if (hasCloud) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void telegram.sync(), 1400);
    }
  }
  // Whatever changed, here or in the Telegram cloud, goes on to the shared copy.
  if (from !== shared && sharedOn) {
    clearTimeout(sharedTimer);
    sharedTimer = setTimeout(() => void shared.sync(), 2000);
  }
}

function flush(): void {
  clearTimeout(saveTimer);
  if (telegram.cache.pending) telegram.writeCache();
}

/**
 * Call once at start, after the store was filled from readCache(). Watches the store, saves every
 * change, and keeps the clouds in step: on start, after edits, and whenever the app comes back.
 */
export function startSync(): void {
  useStore.subscribe((s, prev) => {
    if (!dataChanged(s, prev)) return;
    noteChange(applying);
  });

  const back = () => {
    const last = Math.max(useSync.getState().lastSyncedAt ?? 0, useSync.getState().sharedAt ?? 0);
    if (Date.now() - last > 20_000) void syncNow();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? flush() : back()));
  window.addEventListener('pagehide', flush);
  onTelegramEvent('deactivated', flush);
  onTelegramEvent('activated', back);

  if (hasCloud) void telegram.sync();
  else useSync.setState({ ready: true });
}

/** Everything as one JSON string, for a manual backup (lib/backup.ts writes it, and reads it back). */
export function exportJson(): string {
  return writeBackup(snapshot());
}
