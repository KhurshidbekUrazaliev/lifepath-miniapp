// How the app's data is laid out in Telegram CloudStorage (pure; no Telegram calls here).
//
// CloudStorage gives every user 1024 keys with values of up to 4096 characters. Records are packed into
// chunks ("e0", "e1", ... for log entries) that each stay under the limit. A record stays in the chunk
// it was first written to, so adding a log rewrites one small value instead of the whole history.
// The manifest ("m") lists how many chunks each kind has and carries a revision counter.
import { Checks, Entry, Folder, Habit, Plan, Profile, Settings, Task } from './types';
import { Data } from './stats';
import { mergeProfiles, stableStringify } from './syncPlan';

export type KeyMap = Record<string, string>;

/** Bytes per value. Staying under 4096 in UTF-8 bytes is safe whether Telegram counts characters or bytes. */
export const VALUE_LIMIT = 3900;
/** New records only fill a chunk this far, leaving room for records in it to grow. */
const SOFT_LIMIT = 3100;
export const MAX_KEYS = 1024;

export const MANIFEST_KEY = 'm';
const PROFILE_KEY = 'pr';
const SETTINGS_KEY = 'st';

const KINDS = ['f', 't', 'e', 'p', 'h', 'c'] as const;
type Kind = (typeof KINDS)[number];

export interface Manifest {
  v: 1;
  rev: number;
  at: number;
  n: Partial<Record<Kind, number>>;
}

/** Remembers which chunk each record lives in: "<kind>:<id>" -> chunk index. */
export type Placement = Map<string, number>;

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4; // a surrogate pair is one 4-byte character
      i++;
    } else n += 3;
  }
  return n;
}

/** Cuts a string into pieces of at most `limit` UTF-8 bytes without splitting a character. */
function slices(s: string, limit: number): string[] {
  const out: string[] = [];
  let start = 0;
  let size = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const pair = c >= 0xd800 && c <= 0xdbff;
    const w = c < 0x80 ? 1 : c < 0x800 ? 2 : pair ? 4 : 3;
    if (size + w > limit) {
      out.push(s.slice(start, i));
      start = i;
      size = 0;
    }
    size += w;
    if (pair) i++;
  }
  out.push(s.slice(start));
  return out;
}

interface Packed {
  id: string;
  json: string;
  size: number;
}

/**
 * Packs one kind's records into chunk strings. Records keep their chunk; new ones go to a recent chunk
 * with room. A record too big for one value is cut into "~id~part~count~text" values at the end.
 */
function pack(kind: Kind, records: { id: string; json: string }[], placement: Placement): string[] {
  const chunks: { items: Packed[]; size: number }[] = [];
  const at = (i: number) => {
    while (chunks.length <= i) chunks.push({ items: [], size: 2 });
    return chunks[i];
  };
  const loose: Packed[] = [];
  const huge: Packed[] = [];

  for (const r of records) {
    const rec: Packed = { ...r, size: utf8Length(r.json) };
    if (rec.size > VALUE_LIMIT - 8) {
      huge.push(rec);
      placement.delete(`${kind}:${r.id}`);
      continue;
    }
    const home = placement.get(`${kind}:${r.id}`);
    if (home === undefined) {
      loose.push(rec);
      continue;
    }
    const c = at(home);
    if (c.size + rec.size + 1 > VALUE_LIMIT) loose.push(rec); // it outgrew its chunk: re-home it
    else {
      c.items.push(rec);
      c.size += rec.size + 1;
    }
  }

  for (const rec of loose) {
    let target = -1;
    for (let i = chunks.length - 1; i >= 0 && i >= chunks.length - 4; i--) {
      if (chunks[i].size + rec.size + 1 <= SOFT_LIMIT) {
        target = i;
        break;
      }
    }
    if (target < 0) {
      chunks.push({ items: [], size: 2 });
      target = chunks.length - 1;
    }
    chunks[target].items.push(rec);
    chunks[target].size += rec.size + 1;
    placement.set(`${kind}:${rec.id}`, target);
  }

  while (chunks.length && chunks[chunks.length - 1].items.length === 0) chunks.pop();
  const out = chunks.map((c) => `[${c.items.map((i) => i.json).join(',')}]`);

  for (const rec of huge) {
    const parts = slices(rec.json, VALUE_LIMIT - 80);
    parts.forEach((text, i) => out.push(`~${rec.id}~${i}~${parts.length}~${text}`));
  }
  return out;
}

const checksToRecords = (checks: Checks) => Object.keys(checks).sort().map((month) => ({ id: month, v: checks[month] }));

/** Every key/value the cloud should hold for this data, except the manifest. */
export function encode(data: Data, placement: Placement): KeyMap {
  const lists: Record<Kind, { id: string }[]> = {
    f: data.folders,
    t: data.tasks,
    e: data.entries,
    p: data.plans,
    h: data.habits,
    c: checksToRecords(data.checks),
  };
  const map: KeyMap = {};
  for (const kind of KINDS) {
    const records = lists[kind].map((r) => ({ id: r.id, json: stableStringify(r) }));
    pack(kind, records, placement).forEach((value, i) => {
      map[`${kind}${i}`] = value;
    });
  }
  map[PROFILE_KEY] = stableStringify(data.profile);
  map[SETTINGS_KEY] = stableStringify(data.settings);
  return map;
}

export function manifestFor(map: KeyMap, rev: number, at: number = Date.now()): Manifest {
  const n: Manifest['n'] = {};
  for (const kind of KINDS) {
    let count = 0;
    while (map[`${kind}${count}`] !== undefined) count++;
    n[kind] = count;
  }
  return { v: 1, rev, at, n };
}

export function parseManifest(raw: string | undefined | null): Manifest | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (m && m.v === 1 && typeof m.rev === 'number' && m.n && typeof m.n === 'object') return m as Manifest;
  } catch {
    // not a manifest
  }
  return null;
}

/** The data keys a manifest says exist. */
export function keysOf(m: Manifest): string[] {
  const keys = [PROFILE_KEY, SETTINGS_KEY];
  for (const kind of KINDS) for (let i = 0; i < (m.n[kind] ?? 0); i++) keys.push(`${kind}${i}`);
  return keys;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Reads the data back out of a key map and rebuilds the placement of every record. */
export function decode(map: KeyMap, defaults: Data): { data: Data; placement: Placement } {
  const placement: Placement = new Map();
  const read = (kind: Kind): any[] => {
    const seen = new Set<string>();
    const out: any[] = [];
    const parts = new Map<string, string[]>();
    for (let i = 0; map[`${kind}${i}`] !== undefined; i++) {
      const value = map[`${kind}${i}`];
      if (value.startsWith('~')) {
        const m = /^~([^~]+)~(\d+)~(\d+)~([\s\S]*)$/.exec(value);
        if (!m) continue;
        const list = parts.get(m[1]) ?? new Array<string>(Number(m[3])).fill('');
        list[Number(m[2])] = m[4];
        parts.set(m[1], list);
        continue;
      }
      for (const rec of parseJson<any[]>(value, [])) {
        if (!rec || typeof rec.id !== 'string' || seen.has(rec.id)) continue;
        seen.add(rec.id);
        placement.set(`${kind}:${rec.id}`, i);
        out.push(rec);
      }
    }
    for (const [id, list] of parts) {
      const rec = parseJson<any>(list.join(''), null);
      if (rec && rec.id === id && !seen.has(id)) {
        seen.add(id);
        out.push(rec);
      }
    }
    return out;
  };

  const checks: Checks = {};
  for (const rec of read('c')) if (rec.v && typeof rec.v === 'object') checks[rec.id] = rec.v;

  const data: Data = {
    folders: read('f') as Folder[],
    tasks: read('t') as Task[],
    entries: (read('e') as Entry[]).sort((a, b) => a.at - b.at),
    plans: read('p') as Plan[],
    habits: read('h') as Habit[],
    checks,
    profile: { ...defaults.profile, ...parseJson<Partial<Profile>>(map[PROFILE_KEY], {}) },
    settings: { ...defaults.settings, ...parseJson<Partial<Settings>>(map[SETTINGS_KEY], {}) },
  };
  return { data, placement };
}

// ---------- Merging two devices ----------

/**
 * Three-way merge of one list. `base` is what both sides last agreed on.
 * A side that did not touch a record gives way to the side that did; when both did, this device wins.
 */
function mergeList<T extends { id: string }>(local: T[], base: T[], remote: T[]): T[] {
  const str = (r: T | undefined) => (r === undefined ? undefined : stableStringify(r));
  const b = new Map(base.map((r) => [r.id, str(r)]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const l of local) {
    seen.add(l.id);
    const rem = r.get(l.id);
    const lj = str(l);
    const bj = b.get(l.id);
    if (rem === undefined) {
      // Gone on the other device. Keep it only if it is new here or was edited here since.
      if (bj === undefined || bj !== lj) out.push(l);
      continue;
    }
    out.push(lj === bj && str(rem) !== bj ? rem : l);
  }
  for (const rem of remote) {
    if (seen.has(rem.id)) continue;
    if (!b.has(rem.id)) out.push(rem); // new on the other device (otherwise it was deleted here)
  }
  return out;
}

function mergeChecks(local: Checks, base: Checks, remote: Checks): Checks {
  const out: Checks = {};
  const months = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const m of months) {
    const ids = new Set([...Object.keys(local[m] ?? {}), ...Object.keys(remote[m] ?? {})]);
    for (const id of ids) {
      const l = local[m]?.[id] ?? 0;
      const b = base[m]?.[id] ?? 0;
      const r = remote[m]?.[id] ?? 0;
      const touched = l ^ b; // bits this device changed keep this device's value
      const mask = (l & touched) | (r & ~touched);
      if (mask !== 0) (out[m] ??= {})[id] = mask;
    }
  }
  return out;
}

function mergeSettings(local: Settings, base: Settings | null, remote: Settings): Settings {
  if (!base) return { ...remote, ...local };
  const out: any = { ...local };
  for (const key of Object.keys(remote) as (keyof Settings)[]) {
    if (local[key] === base[key] && remote[key] !== base[key]) out[key] = remote[key];
  }
  return out as Settings;
}

/** Merges what this device has with what the cloud has. With no `base` nothing is treated as deleted. */
export function merge(local: Data, base: Data | null, remote: Data): Data {
  // The profile: a side that did not touch it gives way; when both did, merge field by field.
  const lp = stableStringify(local.profile);
  const bp = base ? stableStringify(base.profile) : undefined;
  const rp = stableStringify(remote.profile);
  let profile: Profile;
  if (bp !== undefined && lp === bp) profile = remote.profile;
  else if (bp !== undefined && rp === bp) profile = local.profile;
  else {
    profile = mergeProfiles(local.profile, remote.profile);
    if (base) {
      // XP and Sparks earned separately on two devices add up instead of the larger one winning.
      const add = (l: number, b: number, r: number) => Math.max(l, r, b + (l - b) + (r - b), 0);
      profile.xp = add(local.profile.xp, base.profile.xp, remote.profile.xp);
      profile.sparks = add(local.profile.sparks, base.profile.sparks, remote.profile.sparks);
    }
  }
  const b = base ?? { folders: [], tasks: [], entries: [], plans: [], habits: [], checks: {} };
  return {
    folders: mergeList(local.folders, b.folders, remote.folders),
    tasks: mergeList(local.tasks, b.tasks, remote.tasks),
    entries: mergeList(local.entries, b.entries, remote.entries).sort((x, y) => x.at - y.at),
    plans: mergeList(local.plans, b.plans, remote.plans),
    habits: mergeList(local.habits, b.habits, remote.habits),
    checks: mergeChecks(local.checks, b.checks, remote.checks),
    profile,
    settings: mergeSettings(local.settings, base?.settings ?? null, remote.settings),
  };
}

/** Which keys must be written and which removed to turn `from` into `to`. */
export function diff(from: KeyMap, to: KeyMap): { write: string[]; remove: string[] } {
  const write = Object.keys(to).filter((k) => to[k] !== from[k]);
  const remove = Object.keys(from).filter((k) => to[k] === undefined && k !== MANIFEST_KEY);
  return { write, remove };
}

/** Rough storage use: bytes written and the share of the 1024 keys in use. */
export function usage(map: KeyMap): { bytes: number; keys: number; share: number } {
  const keys = Object.keys(map).length;
  const bytes = Object.values(map).reduce((s, v) => s + utf8Length(v), 0);
  return { bytes, keys, share: Math.max(keys / MAX_KEYS, bytes / (MAX_KEYS * VALUE_LIMIT)) };
}

export const sameData = (a: Data, b: Data): boolean => stableStringify(a) === stableStringify(b);
