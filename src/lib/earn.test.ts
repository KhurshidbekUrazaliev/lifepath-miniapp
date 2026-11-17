import assert from 'node:assert/strict';
import { earnedItems, earnProgress, itemById, isOwned, canBuy, sparkBalance } from './wardrobe';
import { withCheck } from './habits';
import type { Checks, Page } from './types';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${name}`); }
const profile = { sparks: 500, quranPages: 0, owned: [] as string[] };
const base = { profile, worship: {} as Checks, pages: [] as Page[] };
test('earned items are not free or for sale', () => {
  for (const id of ['base-masjid', 'notebook', 'rehal']) {
    assert.equal(isOwned(profile, itemById(id)!), false);
    assert.deepEqual(canBuy(profile, id, 3), { ok: false, reason: 'earned' });
  }
  assert.equal(isOwned(profile, itemById('hold-none')!), true);
});
test('Fajr is counted across months, including day 31', () => {
  let worship: Checks = {};
  for (let n = 1; n <= 29; n++) worship = withCheck(worship, 'fajr', `2026-01-${String(n).padStart(2, '0')}`, true);
  assert.deepEqual(earnedItems({ ...base, worship }), []);
  worship = withCheck(worship, 'fajr', '2026-03-31', true);
  worship = withCheck(worship, 'dhuhr', '2026-03-31', true);
  assert.deepEqual(earnProgress({ ...base, worship }, itemById('base-masjid')!), { have: 30, need: 30 });
  assert.deepEqual(earnedItems({ ...base, worship }), ['base-masjid']);
});
test('Qurʼan threshold is inclusive', () => {
  assert.deepEqual(earnedItems({ ...base, profile: { ...profile, quranPages: 99 } }), []);
  assert.deepEqual(earnedItems({ ...base, profile: { ...profile, quranPages: 100 } }), ['rehal']);
});
test('journal counts different diary days, not notes or duplicate pages', () => {
  const pages: Page[] = Array.from({ length: 7 }, (_, i) => ({ id: String(i), day: `2026-01-0${i + 1}`, at: i, text: 'A day' }));
  assert.deepEqual(earnedItems({ ...base, pages }), ['notebook']);
  assert.deepEqual(earnedItems({ ...base, pages: pages.map(p => ({ ...p, kind: 'note' })) }), []);
  assert.deepEqual(earnedItems({ ...base, pages: pages.map(p => ({ ...p, day: '2026-01-01' })) }), []);
});
test('already bought items stay owned and are never earned twice', () => {
  const p = { ...profile, owned: ['rehal'], quranPages: 150 };
  assert.equal(isOwned(p, itemById('rehal')!), true);
  assert.deepEqual(earnedItems({ ...base, profile: p }), []);
  assert.deepEqual(canBuy(p, 'rehal', 3), { ok: false, reason: 'owned' });
});
test('earned items consume no Sparks and survive unticking', () => {
  const p = { ...profile, owned: ['notebook', 'rehal', 'base-masjid'] };
  assert.equal(sparkBalance(p), profile.sparks);
  assert.equal(isOwned(p, itemById('notebook')!), true);
  assert.deepEqual(earnedItems({ ...base, profile: p }), []);
});
console.log(`\n${passed} tests passed`);
