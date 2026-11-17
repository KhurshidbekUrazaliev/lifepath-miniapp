// Tests for how Home is arranged: run with `npx tsx src/lib/home.test.ts` (part of `npm test`).
import assert from 'node:assert/strict';
import { HOME_BLOCKS, cardForNow, gestureFor, hideHome, homeHidden, homeNow, homeOrder, prayerIsNear, skyPhase } from './home';
import type { Settings } from './types';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const base = { verse: true } as Settings;
const min = 60_000;

test('home: nobody has moved anything, so the cards come in the usual order', () => {
  assert.deepEqual(homeOrder(base), [...HOME_BLOCKS]);
  assert.deepEqual(homeOrder({ home: { order: [] } }), [...HOME_BLOCKS]);
});

test('home: a saved order is kept, unknown names and repeats are dropped', () => {
  const order = homeOrder({ home: { order: ['goals', 'nonsense', 'prayer', 'goals', 'ring'] } });
  assert.equal(new Set(order).size, HOME_BLOCKS.length, 'every card is there once');
  assert.ok(order.indexOf('goals') < order.indexOf('prayer') && order.indexOf('prayer') < order.indexOf('ring'), 'what was placed keeps its order');
});

test('home: a card the person never placed goes after the one it usually follows', () => {
  // Saved before the journal card existed: it turns up after the prayer card, not at the bottom.
  const order = homeOrder({ home: { order: ['ring', 'prayer', 'ayah', 'goals'] } });
  assert.equal(order[order.indexOf('prayer') + 1], 'journal');
  // The first card of the usual order has nothing before it and goes on top.
  assert.equal(order[0], 'special');
  // One that follows a card which is itself new comes right after that one.
  assert.equal(order[order.indexOf('journal') + 1], 'buddy');
});

test('home: the prayer, ayah and journal cards keep their own switches', () => {
  assert.equal(homeHidden(base, 'ayah'), false);
  assert.equal(homeHidden({ ...base, verse: false }, 'ayah'), true);
  assert.equal(homeHidden({ ...base, prayerCard: false }, 'prayer'), true);
  assert.equal(homeHidden({ ...base, journalCard: false }, 'journal'), true);
  assert.deepEqual(hideHome(base, 'ayah', true).verse, false);
  assert.deepEqual(hideHome({ ...base, journalCard: false }, 'journal', false).journalCard, true);
});

test('home: the adhkar follow the prayer card until Home has a list of its own', () => {
  const off = { ...base, prayerCard: false };
  assert.equal(homeHidden(off, 'adhkar'), true, 'as it was before Home could be arranged');
  // Showing the adhkar again writes the list down, and from then on the prayer card's switch is its own.
  const shown = { ...off, ...hideHome(off, 'adhkar', false) };
  assert.equal(homeHidden(shown, 'adhkar'), false);
  assert.equal(homeHidden(shown, 'prayer'), true);
  // Hiding another card keeps what was inherited.
  const more = { ...off, ...hideHome(off, 'ring', true) };
  assert.equal(homeHidden(more, 'adhkar'), true);
  assert.equal(homeHidden(more, 'ring'), true);
  const back = { ...more, ...hideHome(more, 'ring', false) };
  assert.equal(homeHidden(back, 'ring'), false);
});

test('home: a prayer is close before it begins, and while it is open and new or ending', () => {
  assert.equal(prayerIsNear({ toNext: 20 * min, nextIsPrayer: true, sinceCurrent: 3 * 60 * min, currentOpen: false }), true);
  assert.equal(prayerIsNear({ toNext: 40 * min, nextIsPrayer: true, sinceCurrent: 3 * 60 * min, currentOpen: false }), false);
  // Sunrise is next: nothing is close unless Fajr has not been ticked.
  assert.equal(prayerIsNear({ toNext: 20 * min, nextIsPrayer: false, sinceCurrent: 70 * min, currentOpen: false }), false);
  assert.equal(prayerIsNear({ toNext: 20 * min, nextIsPrayer: false, sinceCurrent: 70 * min, currentOpen: true }), true);
  assert.equal(prayerIsNear({ toNext: 3 * 60 * min, nextIsPrayer: true, sinceCurrent: 10 * min, currentOpen: true }), true);
  assert.equal(prayerIsNear({ toNext: 3 * 60 * min, nextIsPrayer: true, sinceCurrent: 90 * min, currentOpen: true }), false);
});

test('home: the card for the moment is the prayer, then the adhkar, then the question', () => {
  const all = () => true;
  const quiet = { hour: 14, prayerNear: false, adhkarDue: false, written: false };
  assert.equal(cardForNow(quiet, all), null, 'the middle of the day asks for nothing');
  assert.equal(cardForNow({ ...quiet, prayerNear: true, adhkarDue: true }, all), 'prayer');
  assert.equal(cardForNow({ ...quiet, adhkarDue: true, hour: 7 }, all), 'adhkar');
  assert.equal(cardForNow({ ...quiet, hour: 7 }, all), 'journal');
  assert.equal(cardForNow({ ...quiet, hour: 21 }, all), 'journal');
  assert.equal(cardForNow({ ...quiet, hour: 21, written: true }, all), null);
  // A card the person switched off is passed over.
  assert.equal(cardForNow({ ...quiet, prayerNear: true, adhkarDue: true }, (id) => id !== 'prayer'), 'adhkar');
});

test('home: the card for the moment goes first, unless Home was told to keep still', () => {
  assert.equal(homeNow(base, 'adhkar')[0], 'adhkar');
  assert.equal(homeNow(base, 'adhkar').filter((id) => id === 'adhkar').length, 1);
  assert.deepEqual(homeNow(base, null), homeOrder(base));
  assert.deepEqual(homeNow({ home: { auto: false } }, 'adhkar'), homeOrder(base));
});

test('home: the sky follows the prayer time, or the clock where no place is set', () => {
  assert.equal(skyPhase(null, 3), 'night'); // before Fajr
  assert.equal(skyPhase('fajr', 6), 'dawn');
  assert.equal(skyPhase('sunrise', 9), 'morning');
  assert.equal(skyPhase('dhuhr', 13), 'day');
  assert.equal(skyPhase('asr', 16), 'gold');
  assert.equal(skyPhase('maghrib', 18), 'dusk');
  assert.equal(skyPhase('isha', 22), 'night');
  assert.deepEqual([2, 6, 9, 13, 17, 19, 23].map((h) => skyPhase(undefined, h)), ['night', 'dawn', 'morning', 'day', 'gold', 'dusk', 'night']);
});

test('home: the companion answers a deed with a gesture of its own', () => {
  assert.equal(gestureFor({ kind: 'xp', from: 'prayer' }), 'dua');
  assert.equal(gestureFor({ kind: 'xp', from: 'quran' }), 'read');
  assert.equal(gestureFor({ kind: 'xp', from: 'habit' }), 'cheer');
  assert.equal(gestureFor({ kind: 'xp', from: 'journal' }), 'nod');
  assert.equal(gestureFor({ kind: 'khatm' }), 'dua');
  assert.equal(gestureFor({ kind: 'levelup' }), 'cheer');
  assert.equal(gestureFor({ kind: 'something new' }), null);
});

console.log(`\n${passed} tests passed`);
