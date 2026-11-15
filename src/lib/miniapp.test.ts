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
import {
  PRAYERS, WORSHIP_XP, alertPrayers, canTick, daysToRamadan, kmToKaaba, nextPrayerAt, prayerNow, prayerStreak, prayedOn, qiblaBearing,
  ramadanDays, resolveMethod, shiftDate, timesFor, turn, worshipXpOn,
} from './prayer';
import { cityById, nearestCity, searchCities } from '../content/cities';
import { ADHKAR } from '../content/adhkar';
import { BOOKS, SESSION_SIZE, finished, inSession, sessionAt, sourceLabel, textOf } from './adhkar';
import { KHATM_XP, PAGES, PAGE_XP_CAP, dueBy, finishDay, juzOf, mergeKhatm, newKhatm, pace, portion, readTo, surahOf } from './khatm';
import { mergeProfiles } from './syncPlan';
import { FOCUS_XP_DAILY_MINUTES, addSession, clock, focusToday, focusXp, isOver, mergeFocus, newRun, pauseRun, remaining, resumeRun } from './focus';
import { Challenge, counters, daysLeft, inviteLink, sortChallenges, timeRatio, upsertChallenge } from './challenges';
import { NAME_LANGS, matchIdea, nameIdeas } from './names';
import { BADGES, bestPrayerRun, earnedBadges } from './achievements';
import { PART_HEAD, PART_OTHER, PART_TORSO, measureBody, partOf, restCap } from '../companion/fit';
import { ITEMS } from './wardrobe';
import { en } from '../i18n/en';

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
const empty = (): Data => ({ folders: [], tasks: [], entries: [], plans: [], habits: [], checks: {}, worship: {}, profile, settings });

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
  d.worship = withCheck(withCheck({}, 'fajr', '2026-11-14', true), 'fast', '2026-03-01', true);
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

test('merge: prayer and fast ticks from two devices both survive', () => {
  const base = sample(1);
  const phone = { ...base, worship: withCheck(base.worship, 'isha', '2026-11-14', true) };
  const laptop = { ...base, worship: withCheck(base.worship, 'fajr', '2026-11-14', false) };
  const m = merge(phone, base, laptop);
  assert.equal(isChecked(m.worship, 'isha', '2026-11-14'), true);
  assert.equal(isChecked(m.worship, 'fajr', '2026-11-14'), false);
  assert.equal(isChecked(m.worship, 'fast', '2026-03-01'), true);
});

test('merge: a place or method chosen on the other device arrives, and going back to automatic travels', () => {
  const tashkent = { lat: 41.31, lon: 69.28, tz: 'Asia/Tashkent', city: 'tashkent' };
  const base = { ...sample(1), settings: { ...settings, place: { ...tashkent }, prayerMethod: 'mwl' } };
  const remote = { ...base, settings: { ...base.settings, place: { lat: 39.65, lon: 66.96, tz: 'Asia/Samarkand', city: 'samarkand' } } };
  delete (remote.settings as Settings).prayerMethod;
  const local = { ...base, settings: { ...base.settings, place: { ...tashkent } } }; // equal, but not the same object
  const m = merge(local, base, remote);
  assert.equal(m.settings.place?.city, 'samarkand');
  assert.equal('prayerMethod' in m.settings, false);
  const edited = { ...base, settings: { ...base.settings, place: { ...tashkent, city: 'chirchiq' } } };
  assert.equal(merge(edited, base, remote).settings.place?.city, 'chirchiq', 'a change made here too wins');
});

// ---------- prayer times ----------

const tashkent = { lat: 41.31, lon: 69.28, tz: 'Asia/Tashkent' };
const zoned = (day: string, hm: string, offset: string) => new Date(`${day}T${hm}:00${offset}`).getTime();

test('prayer: the method and Asr follow the time zone unless chosen', () => {
  assert.deepEqual(resolveMethod({}, 'Asia/Tashkent'), { method: 'uz', asr: 'hanafi', autoMethod: 'uz', autoAsr: 'hanafi' });
  assert.equal(resolveMethod({}, 'Asia/Samarkand').method, 'uz');
  const istanbul = resolveMethod({}, 'Europe/Istanbul');
  assert.equal(istanbul.method, 'turkey');
  assert.equal(istanbul.asr, 'standard');
  assert.equal(resolveMethod({}, 'Europe/Moscow').asr, 'hanafi');
  assert.equal(resolveMethod({}, 'Asia/Karachi').method, 'karachi');
  assert.equal(resolveMethod({}, 'Antarctica/Troll').method, 'mwl');
  const chosen = resolveMethod({ prayerMethod: 'makkah', asr: 'standard' }, 'Asia/Tashkent');
  assert.equal(chosen.method, 'makkah');
  assert.equal(chosen.asr, 'standard');
  assert.equal(resolveMethod({ prayerMethod: 'nonsense' }, 'Asia/Tashkent').method, 'uz');
});

test('prayer: Tashkent times come in order and match what the IlmulHaq bot gets from aladhan.com', () => {
  const t = timesFor(tashkent, '2026-11-15', 'uz', 'hanafi');
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  for (let i = 1; i < order.length; i++) assert.ok(t[order[i]] > t[order[i - 1]], `${order[i]} after ${order[i - 1]}`);
  // api.aladhan.com with the bot's "uz" settings (15.5°, Maghrib 4 min after sunset, Hanafi), 15 November 2026.
  const aladhan = { fajr: '05:49', sunrise: '07:11', dhuhr: '12:07', asr: '15:23', maghrib: '17:08', isha: '18:26' };
  const minutes = (d: Date) => {
    const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
    return h * 60 + m;
  };
  for (const key of order) {
    const [h, m] = aladhan[key].split(':').map(Number);
    assert.ok(Math.abs(minutes(t[key]) - (h * 60 + m)) <= 1, `${key}: ${minutes(t[key])} vs ${aladhan[key]}`);
  }
  const standard = timesFor(tashkent, '2026-11-15', 'uz', 'standard');
  assert.ok(t.asr.getTime() - standard.asr.getTime() > 30 * 60000, 'Hanafi Asr is well after the standard one');
  const mwl = timesFor(tashkent, '2026-11-15', 'mwl', 'hanafi');
  assert.equal(t.maghrib.getTime() - mwl.maghrib.getTime(), 4 * 60000, 'Maghrib 4 minutes after sunset');
});

test('prayer: the next prayer, and after Isha it is tomorrow’s Fajr', () => {
  const noon = prayerNow(tashkent, {}, zoned('2026-11-15', '13:00', '+05:00'));
  assert.equal(noon.day, '2026-11-15');
  assert.equal(noon.current, 'dhuhr');
  assert.equal(noon.next.key, 'asr');
  assert.equal(noon.next.tomorrow, false);
  const late = prayerNow(tashkent, {}, zoned('2026-11-15', '23:30', '+05:00'));
  assert.equal(late.current, 'isha');
  assert.equal(late.next.key, 'fajr');
  assert.equal(late.next.tomorrow, true);
  assert.ok(late.next.at.getTime() > zoned('2026-11-16', '05:00', '+05:00'));
  const early = prayerNow(tashkent, {}, zoned('2026-11-15', '03:00', '+05:00'));
  assert.equal(early.current, null);
  assert.equal(early.next.key, 'fajr');
  assert.ok(early.since < early.times.fajr, 'the bar runs from last night’s Isha');
  // The day is the place's own, not the phone's: 23:30 UTC is already the next day in Tashkent.
  assert.equal(prayerNow(tashkent, {}, Date.UTC(2026, 10, 15, 23, 30)).day, '2026-11-16');
});

test('prayer: a prayer can be ticked once its time has come; earlier days any time', () => {
  const at = zoned('2026-11-15', '13:00', '+05:00');
  const now = prayerNow(tashkent, {}, at);
  assert.equal(canTick('fajr', '2026-11-15', now, at), true);
  assert.equal(canTick('dhuhr', '2026-11-15', now, at), true);
  assert.equal(canTick('asr', '2026-11-15', now, at), false);
  assert.equal(canTick('isha', '2026-11-14', now, at), true);
  assert.equal(canTick('fajr', '2026-11-16', now, at), false);
  assert.equal(canTick('fast', '2026-11-15', now, at), true);
});

test('prayer: the streak counts days with all five, and today may still be in progress', () => {
  let w = {} as Checks;
  for (const day of ['2026-11-12', '2026-11-13', '2026-11-14']) for (const p of PRAYERS) w = withCheck(w, p, day, true);
  w = withCheck(w, 'fajr', '2026-11-15', true);
  assert.equal(prayedOn(w, '2026-11-15'), 1);
  assert.equal(prayerStreak(w, '2026-11-15'), 3);
  for (const p of PRAYERS) w = withCheck(w, p, '2026-11-15', true);
  assert.equal(prayerStreak(w, '2026-11-15'), 4);
  assert.equal(prayerStreak(withCheck(w, 'asr', '2026-11-13', false), '2026-11-15'), 2);
  assert.equal(worshipXpOn(withCheck(w, 'fast', '2026-11-15', true), '2026-11-15'), 5 * WORSHIP_XP.fajr + WORSHIP_XP.fast);
});

test('prayer: worship XP counts in the day’s total', () => {
  const d = { ...empty(), worship: withCheck(withCheck({}, 'fajr', '2026-11-14', true), 'fast', '2026-11-14', true) };
  assert.deepEqual(xpSeries(d, ['2026-11-14', '2026-11-15']), [WORSHIP_XP.fajr + WORSHIP_XP.fast, 0]);
});

test('prayer reminders: the next slot, ahead of time, rolls over to tomorrow', () => {
  const at = zoned('2026-11-15', '13:00', '+05:00');
  const today = timesFor(tashkent, '2026-11-15', 'uz', 'hanafi');
  const tomorrow = timesFor(tashkent, '2026-11-16', 'uz', 'hanafi');
  assert.equal(nextPrayerAt(tashkent, 'uz', 'hanafi', 'asr', 10, at), today.asr.getTime() - 10 * 60000);
  assert.equal(nextPrayerAt(tashkent, 'uz', 'hanafi', 'dhuhr', 0, at), tomorrow.dhuhr.getTime(), "today's Dhuhr has passed");
  assert.equal(nextPrayerAt(tashkent, 'uz', 'hanafi', 'fajr', 0, at), tomorrow.fajr.getTime());
  const late = zoned('2026-11-15', '23:59', '+05:00');
  assert.equal(nextPrayerAt(tashkent, 'uz', 'hanafi', 'isha', 0, late), tomorrow.isha.getTime());
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(alertPrayers({}), [...PRAYERS]);
  assert.deepEqual(alertPrayers({ prayerAlertList: ['isha', 'fajr', 'nonsense'] }), ['fajr', 'isha']);
});

test('qibla: bearing and distance from a few cities', () => {
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  assert.ok(near(qiblaBearing(41.31, 69.28), 241, 2), `Tashkent ${qiblaBearing(41.31, 69.28)}`);
  assert.ok(near(qiblaBearing(51.51, -0.13), 119, 2), `London ${qiblaBearing(51.51, -0.13)}`);
  assert.ok(near(qiblaBearing(40.71, -74.01), 58, 2), `New York ${qiblaBearing(40.71, -74.01)}`);
  assert.ok(near(kmToKaaba(41.31, 69.28), 3535, 25), `Tashkent ${kmToKaaba(41.31, 69.28)} km`);
  assert.ok(kmToKaaba(21.4225, 39.8262) < 0.01);
  assert.equal(turn(350, 10), 20);
  assert.equal(turn(10, 350), -20);
  assert.equal(turn(0, 180), -180);
  assert.equal(turn(241, 241), 0);
});

test('ramadan: day count and the countdown before it', () => {
  // 1 Ramadan 1448 is around 8 February 2027 by the Umm al-Qura calendar.
  const days = ramadanDays('2027-02-20');
  assert.ok(days.length >= 11 && days.length <= 14, `day ${days.length}`);
  assert.equal(days[days.length - 1], '2027-02-20');
  assert.deepEqual(ramadanDays('2026-11-15'), []);
  const before = daysToRamadan('2027-01-30');
  assert.ok(before != null && before >= 8 && before <= 11, `days to Ramadan ${before}`);
  assert.equal(daysToRamadan('2026-11-15'), null, 'more than a month away');
  assert.equal(ramadanDays('2027-02-20', 1).length, days.length + 1, 'the offset shifts the day');
});

test('cities: search ignores case, apostrophes and accents; nearest finds the city', () => {
  assert.equal(searchCities('tash')[0]?.id, 'tashkent');
  assert.equal(searchCities('Ташк')[0]?.id, 'tashkent');
  assert.ok(searchCities('fargona').some((c) => c.id === 'fergana'));
  assert.ok(searchCities('Toshkent').some((c) => c.id === 'tashkent'));
  assert.equal(nearestCity(41.3, 69.25)?.id, 'tashkent');
  assert.equal(nearestCity(0, -140), undefined);
  assert.equal(cityById('makkah')?.tz, 'Asia/Riyadh');
});

// ---------- adhkar ----------

test('adhkar: 24 adhkar, numbered 75–98, each in Arabic, transliterated and translated three ways', () => {
  assert.deepEqual(ADHKAR.map((d) => d.id), Array.from({ length: 24 }, (_, i) => 75 + i));
  const arabic = /[؀-ۿ]/;
  const latin = /[A-Za-z]/;
  const cyrillic = /[Ѐ-ӿ]/;
  for (const d of ADHKAR) {
    for (const t of [d, ...(d.pm ? [d.pm] : [])]) {
      assert.ok(arabic.test(t.ar) && !latin.test(t.ar) && !/[0-9()[\]*]/.test(t.ar), `${d.id} ar`);
      assert.equal(t.ar, t.ar.normalize('NFC'), `${d.id} ar is NFC`);
      for (const k of ['tr', 'trUz', 'en', 'uz'] as const) {
        assert.ok(latin.test(t[k]) && !arabic.test(t[k]) && !cyrillic.test(t[k]), `${d.id} ${k}`);
      }
      assert.ok(cyrillic.test(t.ru) && !arabic.test(t.ru), `${d.id} ru`);
      // no footnote numbers or count notes left from the books
      for (const k of ['en', 'ru', 'uz'] as const) assert.ok(!/[»”.!]\d|\(\d\)|раза?\)|marta\)/.test(t[k]), `${d.id} ${k}: ${t[k].slice(-40)}`);
      assert.ok(!/[ʻʼ’]/.test(t.uz.replace(/[oO]ʻ|[gG]ʻ|\wʼ\w|ʼ\w/g, '')), `${d.id} uz apostrophes`);
    }
    assert.ok(d.count >= 1);
    assert.ok(d.quran || d.src, `${d.id} has a source`);
    for (const part of (d.src ?? '').split(',').filter(Boolean)) assert.ok(BOOKS[part.split(':')[0]], `${d.id} book ${part}`);
    if (d.virtue) for (const k of ['en', 'ru', 'uz'] as const) assert.ok(d.virtue[k].length > 20);
  }
});

test('adhkar: the evening wording says evening, and the session sizes match', () => {
  const evening = ADHKAR.filter((d) => d.pm);
  assert.deepEqual(evening.map((d) => d.id), [77, 78, 80, 81, 89, 90]);
  for (const d of evening) {
    assert.ok(d.pm!.ar.includes('أَمْسَ'), `${d.id} ar`);
    assert.ok(/evening/.test(d.pm!.en) && /вечер/.test(d.pm!.ru), `${d.id} en/ru`);
    assert.ok(/Ams|ams/.test(d.pm!.tr) && /ams/i.test(d.pm!.trUz), `${d.id} tr`);
    assert.equal(textOf(d, 'pm'), d.pm);
    assert.equal(textOf(d, 'am').ar, d.ar);
  }
  for (const s of ['am', 'pm'] as const) assert.equal(ADHKAR.filter((d) => inSession(d, s)).length, SESSION_SIZE[s]);
  assert.ok(!ADHKAR.some((d) => d.id === 97 && inSession(d, 'am')));
  assert.equal(finished(ADHKAR, { 75: 1, 76: 2, 91: 100 }), 2);
});

test('adhkar: sources read as book and number; the session follows Fajr and Dhuhr', () => {
  assert.equal(sourceLabel('abuDawud:5082,tirmidhi:3575', 'en'), 'Abu Dawud 5082; at-Tirmidhi 3575');
  assert.equal(sourceLabel('hakim', 'ru'), 'аль-Хаким');
  assert.equal(sourceLabel('bukhari:6306', 'uz'), 'Buxoriy 6306');
  const day = (h: number, m = 0) => new Date(2026, 10, 15, h, m).getTime();
  const times = { fajr: new Date(day(5, 49)), dhuhr: new Date(day(12, 7)) };
  assert.equal(sessionAt(times, day(5, 48)), 'pm');
  assert.equal(sessionAt(times, day(5, 49)), 'am');
  assert.equal(sessionAt(times, day(12, 6)), 'am');
  assert.equal(sessionAt(times, day(12, 7)), 'pm');
  assert.equal(sessionAt(null, day(9)), 'am');
  assert.equal(sessionAt(null, day(20)), 'pm');
});

// ---------- khatm ----------

test('khatm: daily portions keep a 30-day plan on time, and pace says how far ahead or behind', () => {
  const k = newKhatm(30, '2026-11-01');
  assert.equal(dueBy(k, 0), 21);
  assert.equal(dueBy(k, 29), PAGES);
  assert.equal(dueBy(k, 40), PAGES);
  assert.deepEqual(portion(k, '2026-11-01'), { from: 1, to: 21, pages: 21 });
  const read = { ...k, page: 21, best: 21 };
  assert.equal(portion(read, '2026-11-01').pages, 0);
  assert.equal(pace(read, '2026-11-01'), 0, 'today read: on track, not ahead');
  assert.equal(pace(read, '2026-11-02'), 0, 'today still to read: on track');
  assert.equal(pace(read, '2026-11-04'), 21 - 61);
  assert.equal(pace({ ...read, page: 100 }, '2026-11-02'), 100 - 41);
  assert.deepEqual(portion(read, '2026-11-04'), { from: 22, to: 81, pages: 60 });
  assert.equal(finishDay(k), '2026-11-30');
  assert.deepEqual(portion({ ...k, page: PAGES }, '2026-12-25'), { from: PAGES, to: PAGES, pages: 0 });
});

test('khatm: juz and surah of a page', () => {
  assert.equal(juzOf(1), 1);
  assert.equal(juzOf(21), 1);
  assert.equal(juzOf(22), 2);
  assert.equal(juzOf(604), 30);
  assert.equal(surahOf(1).n, 1);
  assert.equal(surahOf(2).n, 2);
  assert.equal(surahOf(50).n, 3);
  assert.equal(surahOf(604).n, 112);
});

test('khatm: XP only for new pages, at most 60 a day, and a bonus for the last page', () => {
  let k = newKhatm(30, '2026-11-01');
  let r = readTo(k, 100, '2026-11-01');
  assert.equal(r.xp, PAGE_XP_CAP);
  k = r.khatm;
  assert.equal(k.best, 100);
  r = readTo(k, 120, '2026-11-01');
  assert.equal(r.xp, 0, 'cap reached today');
  k = r.khatm;
  r = readTo(k, 50, '2026-11-02');
  assert.equal(r.xp, 0, 'going back pays nothing');
  assert.equal(r.khatm.best, 120);
  r = readTo(r.khatm, 130, '2026-11-02');
  assert.equal(r.xp, 10, 'only the pages past the furthest so far');
  k = { ...r.khatm, page: 600, best: 600 };
  r = readTo(k, 700, '2026-11-20');
  assert.equal(r.khatm.page, PAGES);
  assert.ok(r.finished);
  assert.equal(r.xp, 4 + KHATM_XP);
  assert.equal(r.khatm.doneAt, '2026-11-20');
  assert.equal(readTo(r.khatm, PAGES, '2026-11-20').finished, false);
});

test('khatm: two devices merge to the newer plan, or the furthest page of the same plan', () => {
  const a = { ...newKhatm(30, '2026-11-01'), page: 40, best: 40, xpDay: '2026-11-02', xpPages: 19 };
  const b = { ...newKhatm(30, '2026-11-01'), page: 25, best: 45, xpDay: '2026-11-02', xpPages: 25 };
  const m = mergeKhatm(a, b)!;
  assert.equal(m.page, 40);
  assert.equal(m.best, 45);
  assert.equal(m.xpPages, 25);
  const fresh = newKhatm(15, '2026-11-10');
  assert.equal(mergeKhatm(a, fresh), fresh);
  assert.equal(mergeKhatm(undefined, b), b);
  const merged = mergeProfiles({ ...profile, khatm: a, khatms: 1 }, { ...profile, khatm: fresh, khatms: 2 });
  assert.equal(merged.khatm, fresh);
  assert.equal(merged.khatms, 2);
});

// ---------- focus timer ----------

test('focus: the clock pauses, resumes and ends on time', () => {
  const t0 = 1_000_000;
  const run = newRun('focus', 25, t0, 'g1');
  assert.equal(remaining(run, t0 + 60_000), 24 * 60_000);
  const paused = pauseRun(run, t0 + 10 * 60_000);
  assert.equal(paused.endsAt, undefined);
  assert.equal(remaining(paused, t0 + 99 * 60_000), 15 * 60_000, 'time stands still while paused');
  assert.equal(isOver(paused, t0 + 99 * 60_000), false);
  const resumed = resumeRun(paused, t0 + 30 * 60_000);
  assert.equal(resumed.endsAt, t0 + 45 * 60_000);
  assert.equal(resumed.taskId, 'g1');
  assert.ok(isOver(resumed, t0 + 45 * 60_000));
  assert.equal(clock(25 * 60_000), '25:00');
  assert.equal(clock(61_500), '1:02');
  assert.equal(clock(60 * 60_000), '1:00:00');
});

test('focus: 1 XP per 5 minutes, for up to 2 hours a day', () => {
  assert.equal(focusXp(25, 0), 5);
  assert.equal(focusXp(60, 0), 12);
  assert.equal(focusXp(25, FOCUS_XP_DAILY_MINUTES - 10), 2, 'only the minutes under the cap pay');
  assert.equal(focusXp(25, FOCUS_XP_DAILY_MINUTES), 0);
});

test('focus: stats count sessions per day and merge across devices', () => {
  let f = addSession(undefined, 25, '2026-11-14', false);
  f = addSession(f, 45, '2026-11-14', true);
  assert.deepEqual(f, { day: '2026-11-14', min: 70, n: 2, total: 70, free: 25 });
  const next = addSession(f, 15, '2026-11-15', false);
  assert.deepEqual(focusToday(next, '2026-11-15'), { min: 15, n: 1 });
  assert.deepEqual(focusToday(next, '2026-11-16'), { min: 0, n: 0 });
  assert.equal(next.total, 85);
  // The phone did yesterday's sessions; the laptop one today: today's counts and the larger totals win.
  const other = addSession(undefined, 60, '2026-11-15', false);
  assert.deepEqual(mergeFocus(next, other), { day: '2026-11-15', min: 60, n: 1, total: 85, free: 60 });
  assert.equal(mergeFocus(undefined, other), other);
});

test('challenges: counters are total XP, prayers marked, Qurʼan pages and focus minutes', () => {
  let worship: Checks = {};
  for (const day of ['2026-10-31', '2026-11-01', '2026-11-02']) for (const p of PRAYERS) worship = withCheck(worship, p, day, true);
  worship = withCheck(worship, 'fast', '2026-11-01', true); // a fast is not a prayer
  worship = withCheck(worship, 'am', '2026-11-01', true); // nor are the adhkar
  worship = withCheck(worship, 'isha', '2026-11-02', false);
  const p: Profile = { ...profile, xp: 1234.6, quranPages: 40, focus: { day: '2026-11-02', min: 25, n: 1, total: 95 } };
  assert.deepEqual(counters({ profile: p, worship }), { xp: 1234, prayer: 14, quran: 40, focus: 95 });
  assert.deepEqual(counters({ profile, worship: {} }), { xp: 0, prayer: 0, quran: 0, focus: 0 });
});

test('challenges: running ones first (soonest end on top), then ended ones, newest first', () => {
  const ch = (id: string, endsAt: number, ended = false): Challenge => ({
    id, kind: 'xp', days: 7, startsAt: endsAt - 7 * 86_400_000, endsAt, ended, owner: 'A', isOwner: false, joined: true, members: [],
  });
  const now = Date.UTC(2026, 10, 15);
  const list = [ch('old', now - 5e8, true), ch('late', now + 6e8), ch('soon', now + 1e8), ch('recent', now - 1e8, true)];
  assert.deepEqual(sortChallenges(list).map((c) => c.id), ['soon', 'late', 'recent', 'old']);
  assert.equal(daysLeft(ch('x', now + 86_400_000 + 1), now), 2, 'a part of a day counts as a day');
  assert.equal(daysLeft(ch('x', now - 1, true), now), 0);
  assert.equal(timeRatio(ch('x', now + 3.5 * 86_400_000), now), 0.5);
  assert.deepEqual(upsertChallenge(list, { ...list[2]!, days: 3 }).map((c) => `${c.id}:${c.days}`), ['soon:3', 'old:7', 'late:7', 'recent:7']);
  assert.equal(inviteLink('lifepath_bot', 'abc23xyz'), 'https://t.me/lifepath_bot?startapp=ch_abc23xyz');
});

test('badges: prayer, fasting, adhkar, Qurʼan and focus come from the data', () => {
  let worship: Checks = {};
  const week = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
  for (const day of week) for (const p of PRAYERS) worship = withCheck(worship, p, day, true);
  worship = withCheck(worship, 'fast', '2026-11-01', true);
  worship = withCheck(worship, 'am', '2026-11-01', true);
  const d = { ...empty(), worship, profile: { ...profile, quranPages: 120, khatms: 1, focus: { day: '2026-11-03', min: 25, n: 1, total: 25 } } };
  const ids = earnedBadges(d);
  for (const id of ['prayer-first', 'prayer-day', 'prayer-week', 'fast-first', 'adhkar-first', 'quran-100', 'khatm-1', 'focus-first']) {
    assert.ok(ids.includes(id), id);
  }
  for (const id of ['prayer-100', 'fast-10', 'adhkar-7', 'focus-10h', 'level-10', 'challenge-join', 'challenge-win']) assert.ok(!ids.includes(id), id);
  assert.equal(bestPrayerRun(worship), 7, 'a run carries across the end of a month');
  const gap = withCheck(worship, 'asr', '2026-10-31', false);
  assert.equal(bestPrayerRun(gap), 3, 'a missed prayer breaks it');
  assert.ok(!earnedBadges({ ...d, worship: gap }).includes('prayer-week'));
  assert.ok(earnedBadges({ ...empty() }).every((id) => !id.startsWith('prayer') && !id.startsWith('fast')));
});

test('badges: every one has a name and a line under it', () => {
  const english = en as Record<string, string>;
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length, 'no id twice');
  for (const b of BADGES) {
    assert.ok(english[`ach.${b.id}.title`], `${b.id} title`);
    assert.ok(english[`ach.${b.id}.desc`], `${b.id} desc`);
  }
});

test('name ideas: the same count in every language, short, no name twice', () => {
  for (const gender of ['boy', 'girl'] as const) {
    const count = nameIdeas('en', gender).length;
    assert.ok(count >= 8, `${gender}: enough ideas`);
    for (const lang of NAME_LANGS) {
      const ideas = nameIdeas(lang, gender);
      assert.equal(ideas.length, count, `${lang} ${gender}: same count as English`);
      assert.equal(new Set(ideas.map((i) => i.name.toLowerCase())).size, ideas.length, `${lang} ${gender}: no name twice`);
      for (const idea of ideas) {
        assert.ok(idea.name.length >= 2 && idea.name.length <= 20, `${lang} ${idea.name}: fits the name field`);
        assert.ok(idea.meaning.trim().length > 0, `${lang} ${idea.name}: has a meaning`);
      }
    }
  }
  // A boy's and a girl's list never share a name, so the meaning shown is never the other one's.
  for (const lang of NAME_LANGS) {
    const boys = new Set(nameIdeas(lang, 'boy').map((i) => i.name));
    assert.ok(nameIdeas(lang, 'girl').every((i) => !boys.has(i.name)), `${lang}: lists do not overlap`);
  }
  assert.deepEqual(nameIdeas('fr', 'girl'), nameIdeas('en', 'girl'), 'an unknown language falls back to English');
});

test('name ideas: a typed name matches whatever its capitals and spaces', () => {
  const ideas = nameIdeas('en', 'boy');
  assert.equal(matchIdea(ideas, '  zayd ')?.meaning, 'growth');
  assert.equal(matchIdea(ideas, 'ZAYD')?.name, 'Zayd');
  assert.equal(matchIdea(ideas, 'Zay'), undefined);
  assert.equal(matchIdea(ideas, '   '), undefined);
  assert.equal(matchIdea(nameIdeas('ru', 'girl'), 'нур')?.name, 'Нур');
});

// A stand-in for a character: a ball of a head with a tuft of hair on top, a box of a chest, arms held out.
function dummy(rigged = true) {
  const pos: number[] = [];
  const part: number[] = [];
  const add = (x: number, y: number, z: number, p: number) => {
    pos.push(x, y, z);
    part.push(rigged ? p : PART_OTHER);
  };
  for (let a = 0; a <= 60; a++) {
    for (let b = 0; b < 72; b++) {
      const lat = (a / 60 - 0.5) * Math.PI;
      const lon = (b / 72) * 2 * Math.PI;
      add(0.2 * Math.cos(lat) * Math.cos(lon), 0.75 + 0.2 * Math.sin(lat), 0.02 + 0.2 * Math.cos(lat) * Math.sin(lon), PART_HEAD);
    }
  }
  for (let i = 0; i <= 10; i++) add(i % 2 ? 0.01 : -0.01, 0.95 + i * 0.005, 0.02, PART_HEAD); // the tuft, up to 1.0
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const x = -0.1 + i * 0.01;
      const y = 0.25 + j * 0.015;
      add(x, y, -0.06, PART_TORSO);
      add(x, y, 0.08, PART_TORSO);
    }
  }
  for (let i = 0; i <= 30; i++) {
    add(0.1 + i * 0.01, 0.45, 0, PART_OTHER);
    add(-0.1 - i * 0.01, 0.45, 0, PART_OTHER);
  }
  const joints = { head: [0, 0.58, 0], neck: [0, 0.54, 0.01], chest: [0, 0.45, 0], hips: [0, 0.25, 0] } as const;
  return { pos, part, joints: { head: [...joints.head], neck: [...joints.neck], chest: [...joints.chest], hips: [...joints.hips] } as Parameters<typeof measureBody>[2] };
}
const near = (value: number, wanted: number, by: number, what: string) =>
  assert.ok(Math.abs(value - wanted) <= by, `${what}: ${value.toFixed(3)} is not within ${by} of ${wanted}`);

test('fit: the head, chest and back are measured from the body, and held-out arms are not chest', () => {
  const d = dummy();
  const body = measureBody(d.pos, d.part, d.joints);
  near(body.head.width, 0.4, 0.005, 'head width');
  near(body.head.top, 1, 1e-9, 'top of the head');
  near(body.chest.unit, 0.2, 1e-9, 'chest width');
  near(body.chest.z, 0.08, 1e-9, 'front of the chest');
  near(body.back.z, -0.06, 1e-9, 'surface of the back');
  assert.equal(body.chest.y, 0.45);
  assert.deepEqual([body.neck.x, body.neck.y, body.neck.z, body.neck.unit], [0, 0.54, 0.01, body.chest.unit]);
  // The eyes are 29% of the way up the head; the ball's front at that height is 0.194 from its middle.
  near(body.face.y, 0.58 + 0.42 * 0.29, 1e-9, 'height of the eyes');
  near(body.face.z, 0.02 + 0.194, 0.004, 'front of the face');
  near(body.face.x, 0, 0.005, 'middle of the face');
  assert.equal(body.face.unit, body.head.width);
  // Without a rig nothing tells the arms from the chest, so everything at that height counts.
  const plain = dummy(false);
  near(measureBody(plain.pos, plain.part, plain.joints).chest.unit, 0.8, 1e-9, 'unrigged chest width');
  // With nothing to measure there is still a place to put things.
  const none = measureBody([], [], d.joints);
  assert.ok([none.chest.unit, none.chest.z, none.back.z].every(Number.isFinite) && none.chest.unit > 0);
  assert.equal(restCap(none.head, 0.3), null);
});

test('fit: a cap rests where the head is as wide as its opening', () => {
  const d = dummy();
  const { head } = measureBody(d.pos, d.part, d.joints);
  // On a ball 0.4 wide, an opening of 0.32 fits 0.12 above the middle.
  const cap = restCap(head, 0.32)!;
  near(cap.y, 0.87, 0.012, 'height of the rim');
  near(cap.x, 0, 0.005, 'middle, sideways');
  near(cap.z, 0.02, 0.005, 'middle, front to back');
  near(cap.depth, 1, 0.05, 'a round head');
  const small = restCap(head, 0.2)!;
  assert.ok(small.y > cap.y, 'a smaller cap sits higher');
  assert.ok(small.y < 0.95, 'and still on the head, not on the tuft of hair');
  // A cap wider than the head stops at its widest level instead of sliding over the face.
  near(restCap(head, 0.6)!.y, 0.75, 0.015, 'an oversized cap');
});

test('fit: bones are sorted into head, torso and the rest by name', () => {
  assert.equal(partOf('mixamorig:Head'), PART_HEAD);
  assert.equal(partOf('mixamorigHeadTop_End'), PART_HEAD);
  for (const name of ['mixamorig:Hips', 'mixamorigSpine2', 'mixamorig:Neck', 'mixamorig:LeftShoulder']) assert.equal(partOf(name), PART_TORSO, name);
  for (const name of ['mixamorig:LeftForeArm', 'mixamorig:RightHandIndex1', 'mixamorig:LeftUpLeg', 'mixamorigRightFoot']) assert.equal(partOf(name), PART_OTHER, name);
});

test('wardrobe: every 3D item says where it goes, and every cap how wide its opening is', () => {
  for (const item of ITEMS) {
    if (!item.model) continue;
    const place = item.place!;
    assert.ok(place.size > 0, `${item.id} has a size`);
    if (place.anchor === 'head') assert.ok(place.opening && place.opening > 0 && place.opening <= 1, `${item.id} has an opening`);
    else assert.equal(place.opening, undefined, `${item.id} is not a cap`);
  }
});

console.log(`\n${passed} tests passed`);
