// Tests for what the Mini App adds to LifePath's rules. Run with: npx tsx src/lib/miniapp.test.ts
import assert from 'node:assert/strict';
import { Checks, Entry, Folder, Habit, Plan, Profile, Settings, Task } from './types';
import { Data, dayStats, lastDays, provenXp, xpSeries } from './stats';
import {
  HABIT_XP, bestHabitStreak, checksOn, completionRate, dayTally, habitStreak, isChecked, isDue, shiftDay, weekdayOf, withCheck, withoutHabit,
} from './habits';
import {
  KeyMap, MANIFEST_KEY, VALUE_LIMIT, decode, diff, encode, keysOf, manifestFor, merge, parseManifest, sameData, usage, utf8Length,
} from './cloudCodec';
import { dayKeyToMs } from './calendar';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  ✓', name);
}

const profile: Profile = {
  name: '', xp: 0, sparks: 0, streak: { current: 0, best: 0 }, freezes: 0, dailyGoalXp: 30, haptics: true,
  achievements: {}, nudge: { enabled: false, hour: 21, minute: 0 },
};
const settings: Settings = { lang: 'auto', theme: 'auto', verse: true, fullscreen: true, reminders: false, onboarded: true };
const empty = (): Data => ({ folders: [], tasks: [], entries: [], plans: [], habits: [], checks: {}, profile, settings });

const at = (day: string, hour = 12) => dayKeyToMs(day, hour);
const habit = (id: string, days = [1, 2, 3, 4, 5, 6, 7], created = '2026-11-01'): Habit => ({
  id, title: id, icon: '🌱', color: '#10B981', days, createdAt: at(created),
});

// ---------- habits ----------

test('habits: ticks are stored per month as bits and can be undone', () => {
  let c: Checks = {};
  c = withCheck(c, 'h1', '2026-11-01', true);
  c = withCheck(c, 'h1', '2026-11-30', true);
  c = withCheck(c, 'h1', '2026-12-31', true);
  assert.equal(isChecked(c, 'h1', '2026-11-01'), true);
  assert.equal(isChecked(c, 'h1', '2026-11-02'), false);
  assert.equal(isChecked(c, 'h1', '2026-12-31'), true);
  assert.deepEqual(Object.keys(c).sort(), ['2026-11', '2026-12']);
  c = withCheck(c, 'h1', '2026-12-31', false);
  assert.equal(c['2026-12'], undefined, 'an empty month is removed');
  assert.equal(checksOn(c, '2026-11-30'), 1);
  assert.deepEqual(withoutHabit(c, 'h1'), {});
});

test('habits: due only on its weekdays, after it was created and before it was archived', () => {
  assert.equal(weekdayOf('2026-11-14'), 7); // a Saturday
  const weekdays = habit('h', [2, 3, 4, 5, 6], '2026-11-10');
  assert.equal(isDue(weekdays, '2026-11-13'), true); // Friday
  assert.equal(isDue(weekdays, '2026-11-14'), false); // Saturday
  assert.equal(isDue(weekdays, '2026-11-09'), false); // before it existed
  assert.equal(isDue({ ...weekdays, archivedAt: at('2026-11-12') }, '2026-11-13'), false);
});

test('habits: streak counts back from today and forgives an unticked today', () => {
  const h = habit('h');
  let c: Checks = {};
  for (const d of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) c = withCheck(c, 'h', d, true);
  assert.equal(habitStreak(h, c, '2026-11-14'), 4, 'today is not ticked yet, the streak still stands');
  assert.equal(habitStreak(h, withCheck(c, 'h', '2026-11-14', true), '2026-11-14'), 5);
  assert.equal(habitStreak(h, c, '2026-11-15'), 0, 'a missed yesterday breaks it');
  assert.equal(bestHabitStreak(h, c, '2026-11-20'), 4);
});

test('habits: a weekdays habit keeps its streak across the weekend', () => {
  const h = habit('h', [2, 3, 4, 5, 6], '2026-11-01');
  let c: Checks = {};
  for (const d of ['2026-11-12', '2026-11-13', '2026-11-16']) c = withCheck(c, 'h', d, true); // Thu, Fri, Mon
  assert.equal(habitStreak(h, c, '2026-11-16'), 3);
});

test('habits: tally and completion rate', () => {
  const hs = [habit('a'), habit('b', [2, 3, 4, 5, 6])];
  let c: Checks = {};
  c = withCheck(c, 'a', '2026-11-13', true);
  c = withCheck(c, 'b', '2026-11-13', true);
  c = withCheck(c, 'a', '2026-11-14', true);
  assert.deepEqual(dayTally(hs, c, '2026-11-13'), { done: 2, due: 2 });
  assert.deepEqual(dayTally(hs, c, '2026-11-14'), { done: 1, due: 1 }, 'b is not due on Saturday');
  assert.equal(completionRate(hs, c, '2026-11-13', '2026-11-14'), 1);
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
});

// ---------- stats ----------

test('stats: XP per day adds logs, habit ticks and stand-alone to-dos', () => {
  const d = empty();
  d.entries = [{ id: 'e1', taskId: 't', at: at('2026-11-14'), amount: 1, xp: 12, trust: 'quick' }];
  d.checks = withCheck({}, 'h', '2026-11-14', true);
  d.plans = [{ id: 'p1', title: 'x', day: '2026-11-14', doneAt: at('2026-11-14', 15), xp: 5, createdAt: 0 }];
  assert.deepEqual(xpSeries(d, ['2026-11-13', '2026-11-14']), [0, 12 + HABIT_XP + 5]);
  assert.deepEqual(lastDays(3, '2026-11-14'), ['2026-11-12', '2026-11-13', '2026-11-14']);
});

test('stats: the day ring averages what was on the plate', () => {
  const d = empty();
  d.habits = [habit('a'), habit('b')];
  d.checks = withCheck({}, 'a', '2026-11-14', true);
  d.plans = [
    { id: 'p1', title: 'x', day: '2026-11-14', doneAt: at('2026-11-14'), createdAt: 0 },
    { id: 'p2', title: 'y', day: '2026-11-14', createdAt: 0 },
  ];
  const s = dayStats(d, '2026-11-14');
  assert.deepEqual(s.tasks, { done: 1, total: 2 });
  assert.deepEqual(s.habits, { done: 1, total: 2 });
  // XP 5/30, to-dos 1/2, habits 1/2
  assert.ok(Math.abs(s.overall - (5 / 30 + 0.5 + 0.5) / 3) < 1e-9);
});

test('stats: only proven XP counts for the rankings', () => {
  const entries: Entry[] = [
    { id: '1', taskId: 't', at: 10, amount: 1, xp: 10, trust: 'quick' },
    { id: '2', taskId: 't', at: 20, amount: 1, xp: 15, trust: 'evidence' },
    { id: '3', taskId: 't', at: 30, amount: 1, xp: 7 }, // from before proof existed
  ];
  assert.equal(provenXp(entries), 22);
  assert.equal(provenXp(entries, 25), 7);
});

// ---------- cloud layout ----------

const folder = (id: string): Folder => ({ id, name: `Area ${id}`, icon: '📚', color: '#6C63FF', templateId: 'reading', progressType: 'units', unit: 'pages', createdAt: 1 });
const task = (id: string, title = 'Goal'): Task => ({ id, folderId: 'f1', title, progressType: 'units', target: 300, unit: 'pages', milestones: [], resources: [], createdAt: 2 });
const entry = (i: number): Entry => ({ id: `e${i}`, taskId: 't1', at: 1_794_000_000_000 + i * 60_000, amount: 10 + (i % 7), xp: 12, trust: i % 3 ? 'quick' : 'evidence', note: i % 5 ? undefined : 'Прочитал главу и записал мысли 📖' });

function sample(entries = 400): Data {
  const d = empty();
  d.folders = [folder('f1')];
  d.tasks = [task('t1'), task('t2', 'Второй')];
  d.entries = Array.from({ length: entries }, (_, i) => entry(i));
  d.plans = [{ id: 'p1', taskId: 't1', day: '2026-11-14', time: '20:00', createdAt: 3 } as Plan];
  d.habits = [habit('h1')];
  d.checks = withCheck(withCheck({}, 'h1', '2026-11-13', true), 'h1', '2026-10-31', true);
  d.profile = { ...profile, xp: 1234, sparks: 56, name: 'Тест' };
  return d;
}

test('codec: byte length counts multi-byte characters', () => {
  assert.equal(utf8Length('abc'), 3);
  assert.equal(utf8Length('Привет'), 12);
  assert.equal(utf8Length('📖'), 4);
  assert.equal(utf8Length('oʻ'), 3);
});

test('codec: data survives a round trip and every value fits Telegram', () => {
  const d = sample();
  const map = encode(d, new Map());
  for (const [key, value] of Object.entries(map)) {
    assert.ok(/^[A-Za-z0-9_-]{1,128}$/.test(key), `key ${key}`);
    assert.ok(utf8Length(value) <= VALUE_LIMIT, `value of ${key} is ${utf8Length(value)} bytes`);
    assert.ok(value.length <= 4096);
  }
  const manifest = manifestFor(map, 1);
  assert.ok((manifest.n.e ?? 0) > 5, 'entries are spread over several chunks');
  const round = decode({ ...map }, empty());
  assert.ok(sameData(round.data, d));
  assert.deepEqual(keysOf(manifest).sort(), Object.keys(map).sort());
  assert.equal(parseManifest(JSON.stringify(manifest))?.rev, 1);
  assert.equal(parseManifest(''), null);
  assert.ok(usage(map).share > 0 && usage(map).share < 1);
});

test('codec: adding one log rewrites one value, not the whole history', () => {
  const d = sample();
  const first = encode(d, new Map());
  const { placement } = decode(first, empty());
  const next = encode({ ...d, entries: [...d.entries, entry(9999)] }, placement);
  const changed = diff(first, next);
  assert.equal(changed.write.length, 1, `rewrote ${changed.write.join(',')}`);
  assert.equal(changed.remove.length, 0);
});

test('codec: editing or deleting an old log touches only its own chunk', () => {
  const d = sample();
  const first = encode(d, new Map());
  const { placement } = decode(first, empty());
  const edited = d.entries.map((e) => (e.id === 'e3' ? { ...e, note: 'now with a note that makes the record longer' } : e));
  assert.equal(diff(first, encode({ ...d, entries: edited }, new Map(placement))).write.length, 1);
  const removed = d.entries.filter((e) => e.id !== 'e3');
  assert.equal(diff(first, encode({ ...d, entries: removed }, new Map(placement))).write.length, 1);
});

test('codec: a record too big for one value is split and put back together', () => {
  const d = sample(3);
  const big = task('big', 'x');
  big.milestones = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, title: `Шаг номер ${i}: `.repeat(8), done: false }));
  d.tasks = [...d.tasks, big];
  const map = encode(d, new Map());
  for (const value of Object.values(map)) assert.ok(utf8Length(value) <= VALUE_LIMIT);
  assert.ok(Object.values(map).some((v) => v.startsWith('~big~')));
  assert.ok(sameData(decode(map, empty()).data, d));
});

test('codec: removing data frees its keys', () => {
  const d = sample();
  const first = encode(d, new Map());
  const cleared = encode({ ...d, entries: [] }, decode(first, empty()).placement);
  const changed = diff({ ...first, [MANIFEST_KEY]: 'x' }, cleared);
  assert.ok(changed.remove.length >= 5 && changed.remove.every((k) => k.startsWith('e')));
});

// ---------- merging two devices ----------

test('merge: new records from both devices are kept', () => {
  const base = sample(3);
  const phone = { ...base, entries: [...base.entries, entry(100)] };
  const laptop = { ...base, tasks: [...base.tasks, task('t3')] };
  const m = merge(phone, base, laptop);
  assert.equal(m.entries.length, 4);
  assert.equal(m.tasks.length, 3);
});

test('merge: an edit on the other device wins over an untouched copy; a local edit wins a conflict', () => {
  const base = sample(3);
  const remote = { ...base, tasks: base.tasks.map((t) => (t.id === 't1' ? { ...t, title: 'Renamed there' } : t)) };
  assert.equal(merge(base, base, remote).tasks.find((t) => t.id === 't1')!.title, 'Renamed there');
  const local = { ...base, tasks: base.tasks.map((t) => (t.id === 't1' ? { ...t, title: 'Renamed here' } : t)) };
  assert.equal(merge(local, base, remote).tasks.find((t) => t.id === 't1')!.title, 'Renamed here');
});

test('merge: deletions travel, but never delete something edited since', () => {
  const base = sample(3);
  const remoteDeleted = { ...base, tasks: base.tasks.filter((t) => t.id !== 't2') };
  assert.equal(merge(base, base, remoteDeleted).tasks.length, 1, 'deleted there, untouched here');
  const localEdited = { ...base, tasks: base.tasks.map((t) => (t.id === 't2' ? { ...t, target: 999 } : t)) };
  assert.equal(merge(localEdited, base, remoteDeleted).tasks.length, 2, 'edited here: kept');
  const localDeleted = { ...base, entries: base.entries.filter((e) => e.id !== 'e1') };
  assert.equal(merge(localDeleted, base, base).entries.length, 2, 'deleted here stays deleted');
});

test('merge: with no common base nothing is treated as deleted', () => {
  const a = sample(2);
  const b = { ...empty(), entries: [entry(50)], folders: [folder('f9')] };
  const m = merge(a, null, b);
  assert.equal(m.entries.length, 3);
  assert.equal(m.folders.length, 2);
});

test('merge: habit ticks made on two devices both survive, and an untick is respected', () => {
  const base = sample(1);
  const phone = { ...base, checks: withCheck(base.checks, 'h1', '2026-11-14', true) };
  const laptop = { ...base, checks: withCheck(withCheck(base.checks, 'h1', '2026-11-12', true), 'h1', '2026-11-13', false) };
  const m = merge(phone, base, laptop);
  assert.equal(isChecked(m.checks, 'h1', '2026-11-14'), true);
  assert.equal(isChecked(m.checks, 'h1', '2026-11-12'), true);
  assert.equal(isChecked(m.checks, 'h1', '2026-11-13'), false);
  assert.equal(isChecked(m.checks, 'h1', '2026-10-31'), true);
});

test('merge: XP earned separately on two devices adds up', () => {
  const base = sample(1);
  const phone = { ...base, profile: { ...base.profile, xp: base.profile.xp + 30, sparks: base.profile.sparks + 3 } };
  const laptop = { ...base, profile: { ...base.profile, xp: base.profile.xp + 20, streak: { current: 4, best: 9, lastDay: '2026-11-14' } } };
  const m = merge(phone, base, laptop);
  assert.equal(m.profile.xp, base.profile.xp + 50);
  assert.equal(m.profile.sparks, base.profile.sparks + 3);
  assert.equal(m.profile.streak.best, 9);
  // Only one side changed the profile: take that side as it is.
  assert.equal(merge(base, base, laptop).profile.xp, base.profile.xp + 20);
});

test('merge: a setting changed on the other device arrives unless it was changed here too', () => {
  const base = sample(1);
  const remote = { ...base, settings: { ...base.settings, theme: 'light' as const, verse: false } };
  const local = { ...base, settings: { ...base.settings, verse: true, lang: 'uz' as const } };
  const m = merge(local, base, remote);
  assert.equal(m.settings.theme, 'light');
  assert.equal(m.settings.lang, 'uz');
  assert.equal(m.settings.verse, false, 'verse was not changed here, so the other device decides');
});

console.log(`\n${passed} tests passed`);
