// Tests for buddy streaks and group khatms: run with `npx tsx src/lib/together.test.ts`.
import assert from 'node:assert/strict';
import {
  Buddy, GroupKhatm, JUZ_COUNT, JUZ_XP, JUZ_XP_DAY, JuzPaid, PairDays,
  activeOn, applyJuz, board, buddyLink, closestPair, demoBuddies, demoInvite, demoKhatm, demoPair, dueIn, freeCount, grownSince, homeKhatm,
  juzPages, juzUrl, khatmLink, myUnread, newPair, nextRound, pairToday, reportableDay, seenOf, sortBuddies, sortKhatms, streakAlive,
  upsertKhatm, urgency, withMyDay, withoutMember,
} from './together';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ---------- buddy streaks ----------

const buddy = (patch: Partial<Buddy>): Buddy => ({
  id: 'aaaaaaaa', name: 'Aziz', since: 0, streak: 0, best: 0, meDone: false, theyDone: false, nudged: false, canNudge: false, ...patch,
});

test('buddies: the invite link carries the code, and there is none without the bot', () => {
  assert.equal(buddyLink('lifepath_bot', 'abc23456'), 'https://t.me/lifepath_bot?startapp=b_abc23456');
  assert.equal(buddyLink(null, 'abc23456'), 'https://t.me');
  assert.equal(khatmLink('lifepath_bot', 'kkkk2345'), 'https://t.me/lifepath_bot?startapp=k_kkkk2345');
  assert.equal(khatmLink(null, 'kkkk2345'), 'https://t.me');
});

test('buddies: who has done today', () => {
  assert.equal(pairToday(buddy({ meDone: true, theyDone: true })), 'both');
  assert.equal(pairToday(buddy({ meDone: true })), 'me');
  assert.equal(pairToday(buddy({ theyDone: true })), 'them');
  assert.equal(pairToday(buddy({})), 'none');
});

test('buddies: a streak that waits for the person comes first, a day already shared last', () => {
  const waitsForMe = buddy({ id: 'a', name: 'Aziz', streak: 4, theyDone: true });
  const waitsForThem = buddy({ id: 'b', name: 'Bek', streak: 9, meDone: true });
  const nothingToLose = buddy({ id: 'c', name: 'Dona', streak: 0 });
  const shared = buddy({ id: 'd', name: 'Eldor', streak: 30, meDone: true, theyDone: true });
  assert.deepEqual([waitsForMe, waitsForThem, nothingToLose, shared].map(urgency), [0, 1, 2, 3]);
  assert.deepEqual(sortBuddies([shared, nothingToLose, waitsForThem, waitsForMe]).map((b) => b.id), ['a', 'b', 'c', 'd']);
  // Among pairs that need the same, the longer streak has more to lose; then by name.
  const longer = buddy({ id: 'e', name: 'Zafar', streak: 12, theyDone: true });
  const twin = buddy({ id: 'f', name: 'Anvar', streak: 4, theyDone: true });
  assert.deepEqual(sortBuddies([waitsForMe, twin, longer]).map((b) => b.id), ['e', 'f', 'a']);
  const list = [shared, waitsForMe];
  sortBuddies(list);
  assert.equal(list[0], shared, 'the list handed in is left as it was');
  // What the person did today counts in the order before the server has heard of it.
  assert.deepEqual(sortBuddies([waitsForMe, nothingToLose], true).map((b) => [b.id, b.meDone]), [['c', false], ['a', false]]);
});

test('buddies: what the person did today shows before the server has heard of it', () => {
  const waiting = buddy({ streak: 4, theyDone: true });
  assert.equal(withMyDay(waiting, false), waiting);
  assert.equal(withMyDay(waiting, true).meDone, true);
  assert.equal(pairToday(withMyDay(waiting, true)), 'both');
  const done = buddy({ meDone: true });
  assert.equal(withMyDay(done, true), done, 'nothing to change when the server knows already');
});

test('buddies: the card on Home shows the pair closest to breaking', () => {
  const aziz = buddy({ id: 'a', name: 'Aziz', streak: 12, theyDone: true });
  const madina = buddy({ id: 'm', name: 'Madina', streak: 5 });
  assert.equal(closestPair([madina, aziz], false)?.id, 'a', 'the longer streak that waits for the person');
  // Once the person has done something, both wait for the buddy, and the day with Aziz is shared.
  const after = closestPair([madina, aziz], true);
  assert.equal(after?.id, 'm');
  assert.equal(after?.meDone, true);
  assert.equal(closestPair([], true), undefined);
});

test('buddies: a streak that grew since the last look is news, a new pair is not', () => {
  const before = [buddy({ id: 'a', streak: 4 }), buddy({ id: 'b', streak: 7 }), buddy({ id: 'c', streak: 0 })];
  const seen = seenOf(before);
  assert.deepEqual(seen, { a: 4, b: 7, c: 0 });
  const now = [buddy({ id: 'a', streak: 5 }), buddy({ id: 'b', streak: 7 }), buddy({ id: 'c', streak: 1 }), buddy({ id: 'n', streak: 3 })];
  assert.deepEqual(grownSince(seen, now).map((b) => b.id), ['a', 'c'], 'one more day, and a streak that began again');
  assert.deepEqual(grownSince(seen, [buddy({ id: 'b', streak: 0 })]), [], 'a streak that ended is not a celebration');
  assert.deepEqual(grownSince({}, now), []);
});

test('buddies: the day reported is the last active one, when that is today or yesterday', () => {
  assert.equal(reportableDay('2026-11-17', '2026-11-17'), '2026-11-17');
  assert.equal(reportableDay('2026-11-16', '2026-11-17'), '2026-11-16');
  assert.equal(reportableDay('2026-11-15', '2026-11-17'), undefined);
  assert.equal(reportableDay('2026-10-31', '2026-11-01'), '2026-10-31', 'across a month');
  assert.equal(reportableDay(undefined, '2026-11-17'), undefined);
});

const D1 = '2026-11-14';
const D2 = '2026-11-15';
const D3 = '2026-11-16';
const D4 = '2026-11-17';
const D5 = '2026-11-18';
const days = (p: PairDays, ...steps: ['a' | 'b', string][]): PairDays => steps.reduce((pair, [who, day]) => activeOn(pair, who, day), p);

test('buddies: a day counts when the second of the two has done it', () => {
  let p = activeOn(newPair(), 'a', D1);
  assert.equal(p.streak, 0, 'one side is not a shared day');
  assert.equal(p.both, null);
  p = activeOn(p, 'b', D1);
  assert.deepEqual([p.streak, p.best, p.both], [1, 1, D1]);
  // The next day, whoever comes second.
  p = days(p, ['b', D2], ['a', D2]);
  assert.deepEqual([p.streak, p.best, p.both], [2, 2, D2]);
});

test('buddies: telling the same day twice, or an older day, changes nothing', () => {
  const p = days(newPair(), ['a', D1], ['b', D1], ['a', D2]);
  assert.equal(activeOn(p, 'a', D2), p);
  assert.equal(activeOn(p, 'a', D1), p, "a side's days only move forward");
  const q = activeOn(p, 'b', D2);
  assert.equal(activeOn(q, 'b', D2), q);
  assert.equal(q.streak, 2);
});

test('buddies: after a day one of them missed the streak starts again at one, and the best stays', () => {
  let p = days(newPair(), ['a', D1], ['b', D1], ['a', D2], ['b', D2], ['a', D3], ['b', D3]);
  assert.deepEqual([p.streak, p.best], [3, 3]);
  // Only one of them on D4; both again on D5.
  p = days(p, ['a', D4], ['a', D5], ['b', D5]);
  assert.deepEqual([p.streak, p.best, p.both], [1, 3, D5]);
});

test('buddies: two calendars a day apart still meet', () => {
  // The first is already on the next day when the second gets to the day they both did.
  let p = days(newPair(), ['a', D1], ['b', D1], ['a', D2], ['a', D3]);
  assert.equal(p.streak, 1);
  p = activeOn(p, 'b', D2);
  assert.deepEqual([p.streak, p.both], [2, D2], 'the day before the last one is remembered');
  p = activeOn(p, 'b', D3);
  assert.deepEqual([p.streak, p.both], [3, D3]);
});

test('buddies: a streak lives while the day after the last shared one can still be done', () => {
  const p = days(newPair(), ['a', D1], ['b', D1]);
  assert.equal(streakAlive(p, D1, D1), true, 'on the day itself');
  assert.equal(streakAlive(p, D2, D2), true, 'and the day after');
  assert.equal(streakAlive(p, D3, D3), false, 'not once that day has gone by for both');
  assert.equal(streakAlive(newPair(), D1, D1), false, 'nothing shared yet');
  assert.equal(streakAlive(activeOn(newPair(), 'a', D1), D1, D1), false);
});

test('buddies: a streak one of them has kept waits for the other while it is still that day for them', () => {
  // A did D2 and has woken up on D3; for B it is still D2.
  const p = days(newPair(), ['a', D1], ['b', D1], ['a', D2]);
  assert.equal(streakAlive(p, D3, D2), true);
  assert.equal(streakAlive(p, D3, D3), false, 'B let D2 go by');
  // A did not do D2 and is on D3: it is over, whatever B did.
  const q = days(newPair(), ['a', D1], ['b', D1], ['b', D2]);
  assert.equal(streakAlive(q, D3, D2), false);
});

// ---------- group khatm ----------

const khatm = (patch: Partial<GroupKhatm> = {}): GroupKhatm => ({
  id: 'kkkkkkkk', title: 'Family khatm', due: null, round: 1, owner: 'Me', isOwner: true, joined: true, done: false, read: 0,
  members: [
    { key: 'me0000', name: 'Me', isMe: true, isOwner: true, taken: 0, read: 0 },
    { key: 'ma0000', name: 'Madina', isMe: false, isOwner: false, taken: 0, read: 0 },
  ],
  parts: [],
  ...patch,
});
const taken = (juz: number, name: string, mine: boolean, done = false) => ({ juz, name, mine, done });

test('khatm: the board has thirty juz, each free, taken or read', () => {
  const k = khatm({ parts: [taken(2, 'Me', true), taken(3, 'Me', true, true), taken(7, 'Madina', false), taken(8, 'Madina', false, true)] });
  const cells = board(k);
  assert.equal(cells.length, JUZ_COUNT);
  assert.deepEqual(cells.map((c) => c.juz), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual([1, 2, 3, 7, 8].map((n) => cells[n - 1].state), ['free', 'mine', 'mineRead', 'taken', 'read']);
  assert.deepEqual([1, 2, 7].map((n) => cells[n - 1].name), ['', 'Me', 'Madina']);
  assert.equal(freeCount(k), 26);
  assert.deepEqual(myUnread(khatm({ parts: [taken(12, 'Me', true), taken(3, 'Me', true, true), taken(2, 'Me', true), taken(7, 'Madina', false)] })), [2, 12]);
});

test('khatm: the pages of a juz in the mushaf of 604 pages', () => {
  assert.deepEqual(juzPages(1), { from: 1, to: 21 });
  assert.deepEqual(juzPages(2), { from: 22, to: 41 });
  assert.deepEqual(juzPages(30), { from: 582, to: 604 });
  let next = 1;
  for (let juz = 1; juz <= JUZ_COUNT; juz++) {
    const { from, to } = juzPages(juz);
    assert.equal(from, next, `juz ${juz} begins where the one before ended`);
    assert.ok(to >= from);
    next = to + 1;
  }
  assert.equal(next, 605);
  assert.equal(juzUrl(7), 'https://quran.com/juz/7');
  assert.equal(juzUrl(0), 'https://quran.com/juz/1');
  assert.equal(juzUrl(31), 'https://quran.com/juz/30');
});

test('khatm: days until the finish date', () => {
  assert.equal(dueIn(khatm(), '2026-11-17'), null);
  assert.equal(dueIn(khatm({ due: '2026-11-17' }), '2026-11-17'), 0);
  assert.equal(dueIn(khatm({ due: '2026-12-02' }), '2026-11-17'), 15);
  assert.equal(dueIn(khatm({ due: '2026-11-15' }), '2026-11-17'), -2);
});

test('khatm: the list keeps what is still being read on top, and Home shows one that waits for the person', () => {
  const far = khatm({ id: 'far', title: 'Friends', read: 3 });
  const near = khatm({ id: 'near', title: 'Family', read: 28 });
  const done = khatm({ id: 'done', title: 'Ramadan', read: 30, done: true });
  assert.deepEqual(sortKhatms([done, far, near]).map((k) => k.id), ['near', 'far', 'done']);
  assert.deepEqual(upsertKhatm([far, near], { ...near, read: 29 }).map((k) => [k.id, k.read]), [['near', 29], ['far', 3]]);
  assert.deepEqual(upsertKhatm([far], near).map((k) => k.id), ['near', 'far']);

  assert.equal(homeKhatm([done, far, near])?.id, 'near', 'nearest its end when nothing waits');
  const mine = { ...far, parts: [taken(4, 'Me', true)] };
  assert.equal(homeKhatm([done, mine, near])?.id, 'far', 'the one with a juz to read comes first');
  assert.equal(homeKhatm([done]), undefined, 'a complete khatm is not on Home');
  assert.equal(homeKhatm([khatm({ joined: false })]), undefined, 'nor one the person only looked at');
  assert.equal(homeKhatm([]), undefined);
});

test('khatm: a free juz is taken, and only by one reader', () => {
  const k = khatm({ parts: [taken(7, 'Madina', false)] });
  const r = applyJuz(k, 3, 'take', 'Me');
  assert.deepEqual(r?.khatm.parts.map((p) => [p.juz, p.name, p.mine, p.done]), [[3, 'Me', true, false], [7, 'Madina', false, false]]);
  assert.equal(r?.xp, 0);
  assert.equal(r?.khatm.members[0].taken, 1);
  assert.equal(applyJuz(k, 7, 'take', 'Me'), null, 'it is Madina’s');
  assert.equal(applyJuz(k, 7, 'read', 'Me'), null, 'and only its reader marks it');
  assert.equal(applyJuz(k, 5, 'read', 'Me'), null, 'a juz is taken before it is read');
  assert.equal(applyJuz(k, 0, 'take', 'Me'), null);
  assert.equal(applyJuz(k, 31, 'take', 'Me'), null);
  assert.equal(applyJuz(khatm({ joined: false }), 3, 'take', 'Me'), null, 'only members take a juz');
  assert.equal(applyJuz(khatm({ done: true }), 3, 'take', 'Me'), null, 'a complete khatm stays as it is');
  assert.equal(k.parts.length, 1, 'the board handed in is left as it was');
});

test('khatm: a juz that is not read can be given back, one that is read cannot', () => {
  const k = khatm({ parts: [taken(3, 'Me', true), taken(4, 'Me', true, true)], read: 1 });
  assert.deepEqual(applyJuz(k, 3, 'release', 'Me')?.khatm.parts.map((p) => p.juz), [4]);
  assert.equal(applyJuz(k, 4, 'release', 'Me'), null);
  assert.equal(applyJuz(k, 9, 'release', 'Me'), null, 'nothing to give back');
});

test('khatm: a mark brings 20 XP, at most 40 on one day, and taking it back takes its XP back', () => {
  assert.deepEqual([JUZ_XP, JUZ_XP_DAY], [20, 40]);
  let k = khatm({ parts: [taken(1, 'Me', true), taken(2, 'Me', true), taken(3, 'Me', true)] });
  let paid: JuzPaid = {};
  const tap = (juz: number, action: 'read' | 'unread') => {
    const r = applyJuz(k, juz, action, 'Me', paid);
    assert.ok(r, `juz ${juz}: ${action}`);
    k = r.khatm;
    paid = r.paid;
    return r.xp;
  };
  assert.equal(tap(1, 'read'), 20);
  assert.equal(tap(1, 'read'), 0, 'marking it again brings nothing');
  assert.equal(tap(2, 'read'), 20);
  assert.equal(tap(3, 'read'), 0, 'the day is full');
  assert.deepEqual([k.read, k.members[0].read, k.members[0].taken], [3, 3, 3]);
  assert.equal(tap(2, 'unread'), -20);
  assert.equal(tap(3, 'unread'), 0, 'a mark that brought nothing takes nothing back');
  assert.equal(tap(3, 'unread'), 0, 'and it is not taken back twice');
  assert.equal(tap(3, 'read'), 20, 'the day has room for it again');
  assert.equal(k.read, 2);
  assert.deepEqual(paid, { 1: 20, 3: 20 });
});

test('khatm: the thirtieth juz completes it, and the next round starts with an empty board', () => {
  const others = Array.from({ length: 29 }, (_, i) => taken(i + 1, 'Madina', false, true));
  const k = khatm({ parts: [...others, taken(30, 'Me', true)], read: 29 });
  const early = applyJuz(khatm({ parts: [...others.slice(0, 28), taken(30, 'Me', true)], read: 28 }), 30, 'read', 'Me');
  assert.equal(early?.completed, false);
  const r = applyJuz(k, 30, 'read', 'Me');
  assert.deepEqual([r?.completed, r?.khatm.done, r?.khatm.read, r?.xp], [true, true, 30, 20]);
  assert.equal(applyJuz(r!.khatm, 30, 'unread', 'Me', r!.paid), null, 'what is complete is not undone');
  const next = nextRound(r!.khatm);
  assert.deepEqual([next.round, next.done, next.read, next.parts.length], [2, false, 0, 0]);
  assert.deepEqual(next.members.map((m) => [m.name, m.taken, m.read]), [['Me', 0, 0], ['Madina', 0, 0]]);
});

test('khatm: a member taken out leaves what they read, and what they did not read is free again', () => {
  const k = khatm({ parts: [taken(1, 'Me', true), taken(7, 'Madina', false), taken(8, 'Madina', false, true)], read: 1 });
  const without = withoutMember(k, 'ma0000');
  assert.deepEqual(without.members.map((m) => m.name), ['Me']);
  assert.deepEqual(without.parts.map((p) => [p.juz, p.name, p.done]), [[1, 'Me', false], [8, 'Madina', true]]);
  assert.equal(withoutMember(k, 'me0000'), k, 'whoever started it stays');
  assert.equal(withoutMember(k, 'nobody'), k);
  // A namesake's juz are not the person's own.
  const twins = khatm({
    members: [{ key: 'me0000', name: 'Aziz', isMe: true, isOwner: true, taken: 1, read: 0 }, { key: 'az0000', name: 'Aziz', isMe: false, isOwner: false, taken: 1, read: 0 }],
    parts: [taken(1, 'Aziz', true), taken(2, 'Aziz', false)],
  });
  assert.deepEqual(withoutMember(twins, 'az0000').parts.map((p) => p.juz), [1]);
});

// ---------- examples ----------

test('examples: the pairs follow what the person did today', () => {
  const idle = demoBuddies(false, 1_000_000_000_000);
  assert.equal(idle.length, 3);
  assert.ok(idle.every((b) => !b.meDone && !b.canNudge), 'nobody is nudged by someone who has not done their part');
  const done = demoBuddies(true, 1_000_000_000_000);
  assert.deepEqual(done.map((b) => [b.name, pairToday(b), b.canNudge]), [['Aziz', 'both', false], ['Madina', 'me', true], ['Jasur', 'me', true]]);
  assert.ok(done.every((b) => b.best >= b.streak && /^[a-z0-9]{8}$/.test(b.id)));
  assert.equal(demoPair(true).name, demoInvite().name);
  assert.equal(demoInvite().mine, false);
});

test('examples: the khatm adds up, whatever the person is called', () => {
  for (const me of ['Guest', 'Aziz']) {
    const k = demoKhatm('Family khatm', me, '2026-12-01');
    assert.equal(k.read, k.parts.filter((p) => p.done).length);
    assert.equal(k.members.filter((m) => m.isMe).length, 1);
    assert.ok(k.members[0].isMe && k.members[0].isOwner && k.isOwner && k.joined && !k.done);
    assert.deepEqual(myUnread(k), [9]);
    assert.equal(k.parts.filter((p) => p.mine).length, 3, 'only the person’s own juz are theirs');
    assert.equal(k.members.reduce((sum, m) => sum + m.taken, 0), k.parts.length);
    assert.equal(k.members.reduce((sum, m) => sum + m.read, 0), k.read);
    assert.equal(new Set(k.parts.map((p) => p.juz)).size, k.parts.length, 'no juz has two readers');
    assert.equal(freeCount(k), 16);
  }
});

console.log(`\n${passed} tests passed`);
