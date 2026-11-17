import assert from 'node:assert/strict';
import { specialOn, specialBadges, ramadanFasts, whiteFasts, rememberSpecial } from './special';
import { hijriOf } from './prayer';
import { shiftDay, withCheck } from './habits';
import { dayKeyToMs } from './calendar';
import type { Checks, Profile } from './types';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${name}`); }
// Find dates from the same calendar the app uses, rather than assuming a moon-sighting date.
const calendar = Array.from({ length: 1100 }, (_, i) => { const day = shiftDay('2025-01-01', i); return { day, h: hijriOf(day)! }; });
const find = (month: number, n: number, year?: number) => calendar.find(x => x.h.month === month && x.h.day === n && (!year || x.h.year === year))!.day;
const profile = { achievements: {}, xp: 0, sparks: 0, streak: { current: 0, best: 0 }, freezes: 0 } as Profile;
const data = (worship: Checks) => ({ worship, checks: {}, entries: [], plans: [], profile });
const fast = (days: string[]) => days.reduce((w, day) => withCheck(w, 'fast', day, true), {} as Checks);
test('priority: the two Eids never offer fasting', () => {
  assert.deepEqual(specialOn(find(10, 1)), { kind: 'fitr', day: 1, fast: false });
  assert.deepEqual(specialOn(find(12, 10)), { kind: 'adha', day: 10, fast: false });
});
test('Arafah, Ashura, the ninth, and the first eight days', () => {
  assert.equal(specialOn(find(12, 9))?.kind, 'arafah');
  assert.equal(specialOn(find(1, 9))?.kind, 'muharram9');
  assert.equal(specialOn(find(1, 10))?.kind, 'ashura');
  for (let n = 1; n <= 8; n++) assert.equal(specialOn(find(12, n))?.kind, 'dhul');
});
test('Ramadan wins over white days and Friday', () => {
  assert.equal(specialOn(find(9, 13))?.kind, 'ramadan');
  const friday = calendar.find(x => x.h.month === 9 && new Date(dayKeyToMs(x.day, 12)).getDay() === 5)!;
  assert.equal(specialOn(friday.day)?.kind, 'ramadan');
});
test('no white-day fast on 13 Dhul-Hijjah or fasting invitation on Tashriq', () => {
  for (const n of [11, 12, 13]) assert.notEqual(specialOn(find(12, n))?.fast, true);
  for (const n of [13, 14, 15]) assert.equal(specialOn(find(2, n))?.kind, 'white');
});
test('Friday is the fallback, ordinary days have no card', () => {
  const fri = calendar.find(x => x.h.month === 2 && x.h.day < 9 && new Date(dayKeyToMs(x.day, 12)).getDay() === 5)!;
  assert.equal(specialOn(fri.day)?.kind, 'friday');
  assert.equal(specialOn(shiftDay(fri.day, 1)), null);
});
test('moon-sighting offset changes which special day is shown', () => {
  assert.equal(specialOn(shiftDay(find(12, 9), -1), 1)?.kind, 'arafah');
  assert.equal(specialOn(shiftDay(find(12, 9), 1), -1)?.kind, 'arafah');
});
test('Ramadan count excludes later fasts and other months', () => {
  const start = find(9, 1);
  const worship = fast([start, shiftDay(start, 1), shiftDay(start, 10), shiftDay(start, -1)]);
  assert.equal(ramadanFasts(worship, shiftDay(start, 5)), 2);
});
test('the 20 Ramadan fasts must belong to one year', () => {
  const start = find(9, 1), year = hijriOf(start)!.year;
  const first = Array.from({ length: 19 }, (_, i) => shiftDay(start, i));
  assert.ok(!specialBadges(data(fast([...first, find(9, 1, year + 1)]))).includes('special-ramadan'));
  assert.ok(specialBadges(data(fast([...first, shiftDay(start, 19)]))).includes('special-ramadan'));
});
test('Arafah and Ashura badges need a fast on the right day', () => {
  assert.ok(specialBadges(data(fast([find(12, 9)]))).includes('special-arafah'));
  assert.ok(specialBadges(data(fast([find(1, 10)]))).includes('special-ashura'));
  assert.equal(specialBadges(data(fast([find(1, 9)]))).length, 0);
});
test('all three white days in one month, never Ramadan or Dhul-Hijjah', () => {
  const start = find(2, 13); const worship = fast([start, shiftDay(start, 1), shiftDay(start, 2)]);
  assert.equal(whiteFasts(worship, shiftDay(start, 2)), 3);
  assert.ok(specialBadges(data(worship)).includes('special-white'));
  for (const month of [9, 12]) assert.ok(!specialBadges(data(fast([13, 14, 15].map(n => find(month, n))))).includes('special-white'));
  assert.ok(!specialBadges(data(fast([find(2, 13), find(2, 14), find(3, 15)]))).includes('special-white'));
});
test('ten-day badge needs activity on each day of one year', () => {
  const start = find(12, 1); const days = Array.from({ length: 10 }, (_, i) => shiftDay(start, i));
  const make = (days: string[]) => ({ ...data({}), checks: days.reduce((w, d) => withCheck(w, 'habit', d, true), {} as Checks) });
  assert.ok(specialBadges(make(days)).includes('special-ten'));
  assert.ok(!specialBadges(make(days.slice(1))).includes('special-ten'));
  assert.ok(specialBadges({ ...data({}), profile: { ...profile, specialDays: days } }).includes('special-ten'));
});
test('persistent activity marks are limited to the ten days and deduplicated', () => {
  const day = find(12, 1); assert.deepEqual(rememberSpecial([], day), [day]);
  assert.deepEqual(rememberSpecial([day], day), [day]);
  assert.deepEqual(rememberSpecial([], find(12, 11)), []);
});
test('only the bundled Ramadan narration is cited', () => {
  for (const x of calendar) { const s = specialOn(x.day); if (s?.source) { assert.equal(s.kind, 'ramadan'); assert.equal(s.source, 38); } }
});
console.log(`\n${passed} tests passed`);
