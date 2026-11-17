// Saves the store: instantly to this device, then to the user's Telegram CloudStorage.
// The layout and merge rules are pure and live in lib/cloudCodec.ts; this file does timing and I/O.
import { create } from 'zustand';
import { cloud, hasCloud, onTelegramEvent, tgUser } from '../tg/telegram';
import {
  KeyMap, MANIFEST_KEY, Placement, chunksOf, decode, diff, encode, keysOf, manifestFor, merge, parseManifest, sameData, unlisted, usage,
} from '../lib/cloudCodec';
import { Data } from '../lib/stats';
import { writeBackup } from '../lib/backup';
import { dataChanged, emptyData, snapshot, useStore } from './store';

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: number;
  /** False until the first read of the cloud finished (or failed) on a device with no saved copy. */
  ready: boolean;
  usage: { bytes: number; keys: number; share: number };
}

export const useSync = create<SyncState>()(() => ({
  status: hasCloud ? 'idle' : 'local',
  ready: false,
  usage: { bytes: 0, keys: 0, share: 0 },
}));

interface Cache {
  rev: number; // the cloud revision this device last saw
  cloud: KeyMap; // what the cloud held at that revision (the merge base)
  pending?: Data; // local state not in the cloud yet
}

const cacheKey = `lp:${tgUser.id}:cache`;
let cache: Cache = { rev: 0, cloud: {} };
let placement: Placement = new Map();
let base: Data | null = null;
let fresh = true; // nothing was ever saved on this device
let applying = false; // the store is being updated by a sync, not by the user

function writeCache(): void {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    try {
      // Out of room: keep the unsaved data and drop the copy of the cloud (the next sync merges without a base).
      localStorage.setItem(cacheKey, JSON.stringify({ rev: 0, cloud: {}, pending: cache.pending ?? snapshot() }));
    } catch {
      // storage is unavailable; the cloud copy still protects the data
    }
  }
}

/** Reads this device's saved copy. Returns null on a device that has none. */
export function readCache(): Data | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    if (!parsed || typeof parsed !== 'object') return null;
    cache = { rev: parsed.rev ?? 0, cloud: parsed.cloud ?? {}, pending: parsed.pending };
    fresh = false;
    const hasCloudCopy = Object.keys(cache.cloud).length > 0;
    if (hasCloudCopy) {
      const d = decode(cache.cloud, emptyData());
      placement = d.placement;
      base = d.data;
    }
    if (cache.pending) return { ...emptyData(), ...cache.pending };
    return hasCloudCopy ? base : null;
  } catch {
    return null;
  }
}

// ---------- Talking to the cloud ----------

async function fetchAll(keys: string[]): Promise<KeyMap> {
  const out: KeyMap = {};
  for (let i = 0; i < keys.length; i += 40) {
    const got = await cloud.getItems(keys.slice(i, i + 40));
    for (const k of Object.keys(got)) if (got[k]) out[k] = got[k];
  }
  return out;
}

async function writeAll(pairs: [string, string][]): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < pairs.length) {
      const [key, value] = pairs[next++];
      await cloud.setItem(key, value);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

let running: Promise<void> | null = null;
let again = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

/** Pulls what another device saved, merges it, and pushes what this device changed. Safe to call often. */
export function syncNow(): Promise<void> {
  if (!hasCloud) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    useSync.setState({ status: 'syncing' });
    try {
      const remoteManifest = parseManifest(await cloud.getItem(MANIFEST_KEY));

      if (remoteManifest && remoteManifest.rev !== cache.rev) {
        // Another device saved since this one last looked (or this device never looked): pull and merge.
        const keys = keysOf(remoteManifest);
        // An older copy of the app saved last: what it does not know about is still there, just not counted.
        const older = unlisted(remoteManifest);
        if (older.length) keys.push(...chunksOf(await cloud.getKeys(), older));
        const remoteMap = await fetchAll(keys);
        const remote = decode(remoteMap, emptyData());
        const local = snapshot();
        const untouched = fresh && !cache.pending;
        const merged = untouched ? remote.data : merge(local, base, remote.data);
        placement = remote.placement;
        base = remote.data;
        cache.cloud = { ...remoteMap, [MANIFEST_KEY]: JSON.stringify(remoteManifest) };
        cache.rev = remoteManifest.rev;
        if (!sameData(merged, local)) {
          applying = true;
          useStore.getState().replaceData(merged);
          applying = false;
        }
      } else if (!remoteManifest && cache.rev > 0) {
        // The cloud is empty although this device had synced before: write everything again.
        cache = { rev: 0, cloud: {}, pending: cache.pending };
        placement = new Map();
        base = null;
      }
      fresh = false;

      // Push whatever differs from what the cloud holds.
      const data = snapshot();
      const target = encode(data, placement);
      const { write, remove } = diff(cache.cloud, target);
      if (write.length || remove.length || !remoteManifest) {
        const rev = cache.rev + 1;
        await writeAll(write.map((k) => [k, target[k]]));
        const manifest = JSON.stringify(manifestFor(target, rev));
        await cloud.setItem(MANIFEST_KEY, manifest); // last, so a half-finished save is never announced
        if (remove.length) await cloud.removeItems(remove).catch(() => undefined);
        cache.cloud = { ...target, [MANIFEST_KEY]: manifest };
        cache.rev = rev;
        base = data;
      }
      const now = snapshot();
      cache.pending = dataChanged(now, data) ? now : undefined; // edits made while saving stay pending
      writeCache();
      failures = 0;
      useSync.setState({ status: 'idle', lastSyncedAt: Date.now(), ready: true, usage: usage(cache.cloud) });
      if (cache.pending) again = true;
    } catch {
      failures++;
      useSync.setState({ status: 'offline', ready: true });
      clearTimeout(retry);
      retry = setTimeout(() => void syncNow(), Math.min(120_000, 4000 * 2 ** Math.min(failures, 5)));
    }
  })();
  const done = running.finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return done;
}

// ---------- Wiring ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function noteChange(): void {
  cache.pending = snapshot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeCache, 200);
  if (!hasCloud) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), 1400);
}

function flush(): void {
  clearTimeout(saveTimer);
  if (cache.pending) writeCache();
}

/**
 * Call once at start, after the store was filled from readCache(). Watches the store, saves every
 * change, and keeps the cloud in step: on start, after edits, and whenever the app comes back.
 */
export function startSync(): void {
  useStore.subscribe((s, prev) => {
    if (applying || !dataChanged(s, prev)) return;
    noteChange();
  });

  const back = () => {
    const last = useSync.getState().lastSyncedAt ?? 0;
    if (Date.now() - last > 20_000) void syncNow();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? flush() : back()));
  window.addEventListener('pagehide', flush);
  onTelegramEvent('deactivated', flush);
  onTelegramEvent('activated', back);

  if (hasCloud) void syncNow();
  else useSync.setState({ ready: true });
}

/** Everything as one JSON string, for a manual backup (lib/backup.ts writes it, and reads it back). */
export function exportJson(): string {
  return writeBackup(snapshot());
}
