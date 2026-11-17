// Tests for the week in numbers, the bot's Sunday letter and the reminder that carries it.
// Run with `npx tsx src/lib/week.test.ts`.
import assert from 'node:assert/strict';
import {
  LETTER_LIMIT, LetterWords, WeekData, WeekMark, letterReminder, letterWords, markWeek, weekBest, weekDays, weekLetter, weekOf, weekParts, weekStart,
  weekTotals,
} from './week';
import type { Checks, Entry, Habit, Page, Plan, Profile } from './types';
import { dayKeyToMs } from './calendar';
import { withCheck } from './habits';
import { PRAYERS } from './prayer';
import { weekStartMs } from './rankings';
import { en } from '../i18n/en';
import { uz } from '../i18n/uz';
import { ru } from '../i18n/ru';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// The week of Monday 16 to Sunday 22 November 2026, seen on the Thursday.
const MON = '2026-11-16';
const THU = '2026-11-19';
const SUN = '2026-11-22';

const profile = (patch: Partial<Profile> = {}): Profile => ({
  name: '', xp: 0, sparks: 0, streak: { current: 0, best: 0 }, freezes: 0, dailyGoalXp: 30, haptics: true, achievements: {},
  nudge: { enabled: false, hour: 21, minute: 0 }, ...patch,
});
const nothing = (patch: Partial<WeekData> = {}): WeekData => ({ entries: [], plans: [], habits: [], checks: {}, worship: {}, profile: profile(), ...patch });

const habit = (id: string): Habit => ({ id, title: id, icon: '💧', color: '#0EA5E9', days: [1, 2, 3, 4, 5, 6, 7], createdAt: dayKeyToMs('2026-10-01', 8) });
const ticks = (base: Checks, id: string, days: string[]): Checks => days.reduce((c, day) => withCheck(c, id, day, true), base);
const todo = (id: string, day: string, done?: string): Plan => ({ id, title: id, day, createdAt: dayKeyToMs(day, 7), doneAt: done ? dayKeyToMs(done, 18) : undefined, xp: done ? 5 : undefined });
const log = (id: string, day: string, xp: number): Entry => ({ id, taskId: 't', at: dayKeyToMs(day, 20), amount: 30, xp });

/** A week with a bit of everything: see the numbers in the first test. */
function sample(): WeekData {
  let worship: Checks = {};
  for (const day of [MON, '2026-11-17', '2026-11-18']) for (const p of PRAYERS) worship = withCheck(worship, p, day, true);
  worship = ticks(worship, 'fajr', [THU]);
  worship = ticks(worship, 'dhuhr', [THU]);
  worship = ticks(worship, 'fajr', ['2026-11-15']); // last Sunday: not this week
  let checks: Checks = {};
  checks = ticks(checks, 'water', [MON, '2026-11-17', '2026-11-18', THU, '2026-11-14']);
  checks = ticks(checks, 'walk', [MON, '2026-11-18']);
  return {
    entries: [log('e1', MON, 14), log('e2', '2026-11-18', 22), log('e0', '2026-11-13', 50)],
    plans: [todo('p1', MON, MON), todo('p2', '2026-11-17', '2026-11-18'), todo('p3', THU), todo('p0', '2026-11-12', '2026-11-12')],
    habits: [habit('water'), habit('walk')],
    checks,
    worship,
    profile: profile({ streak: { current: 9, best: 12, lastDay: THU }, freezes: 1, quranPages: 240, focus: { day: '2026-11-18', min: 50, n: 2, total: 400 } }),
  };
}

test('week: weeks run Monday to Sunday, as the rankings count them', () => {
  assert.equal(weekStart(THU), MON);
  assert.equal(weekStart(MON), MON);
  assert.equal(weekStart(SUN), MON);
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'a week can straddle the new year');
  assert.deepEqual(weekDays(THU), [MON, '2026-11-17', '2026-11-18', THU, '2026-11-20', '2026-11-21', SUN]);
  // The same Monday the rankings' own clock gives.
  assert.equal(new Date(weekStartMs(Date.UTC(2026, 10, 19, 15))).toISOString().slice(0, 10), MON);
});

test('week: the numbers of a week, counted up to today', () => {
  const w = weekOf(sample(), THU);
  assert.equal(w.start, MON);
  assert.equal(w.end, SUN);
  assert.equal(w.soFar, 4);
  assert.equal(w.prayers, 17, 'three full days and two prayers today; last Sunday is not this week');
  assert.deepEqual(w.habits, { done: 6, due: 8 }, 'two habits on each of the four days so far');
  assert.equal(w.tasks, 2, 'the to-dos finished this week, whichever day they were for');
  assert.equal(w.focus, 50, 'what the saved data still knows: the last day of focus');
  assert.equal(w.quran, 0, 'no pages are known without a mark');
  // 17 prayers and 6 habit ticks at 5 XP, two logs, two stand-alone to-dos.
  assert.equal(w.xp, 17 * 5 + 6 * 5 + 14 + 22 + 5 + 5);
  assert.deepEqual(w.days.map((x) => x.active), [true, true, true, true, false, false, false]);
  assert.deepEqual(w.days.map((x) => x.later), [false, false, false, false, true, true, true]);
  assert.equal(w.active, 4);
  assert.equal(w.streak, 9);
  assert.equal(w.empty, false);
});

test('week: Sunday closes it and Monday starts again from nothing', () => {
  const sunday = weekOf(sample(), SUN);
  assert.equal(sunday.soFar, 7);
  assert.deepEqual(sunday.habits, { done: 6, due: 14 });
  assert.equal(sunday.prayers, 17);
  const monday = weekOf(sample(), '2026-11-23');
  assert.equal(monday.start, '2026-11-23');
  assert.equal(monday.empty, true);
  assert.deepEqual([monday.prayers, monday.tasks, monday.xp, monday.focus, monday.active], [0, 0, 0, 0, 0]);
});

test('week: the journal is not counted, not even its XP', () => {
  const page: Page = { id: 'j1', day: MON, at: dayKeyToMs(MON, 21), text: 'A page', mood: 5, xp: 10, quran: 20, focus: 45 };
  const withJournal = { ...nothing(), pages: [page] };
  const w = weekOf(withJournal, THU);
  assert.equal(w.empty, true);
  assert.deepEqual([w.xp, w.quran, w.focus, w.active], [0, 0, 0, 0]);
  assert.equal(weekLetter(w, wordsIn('en')), '');
});

test('week: with the phone\'s mark, Qurʼan pages and focus minutes are counted from Monday', () => {
  const d = sample();
  const mark: WeekMark = { week: MON, quran: 200, focus: 310, seen: { quran: 240, focus: 400 } };
  const w = weekOf(d, THU, mark);
  assert.equal(w.quran, 40);
  assert.equal(w.focus, 90);
  // A mark made for another week says nothing about this one.
  const stale = weekOf(d, THU, { ...mark, week: '2026-11-09' });
  assert.deepEqual([stale.quran, stale.focus], [0, 50]);
  // Pages read today are known even without a mark (the plan remembers its last day).
  const today = weekOf({ ...d, profile: { ...d.profile, khatm: { start: MON, days: 30, page: 12, best: 12, xpDay: THU, xpPages: 12 } } }, THU);
  assert.equal(today.quran, 12);
  // And a day on which only pages were read is an active day.
  const only = weekOf(nothing({ profile: profile({ khatm: { start: MON, days: 30, page: 7, best: 7, xpDay: MON, xpPages: 7 } }) }), THU);
  assert.deepEqual(only.days.map((x) => x.active), [true, false, false, false, false, false, false]);
  assert.equal(only.empty, false);
});

test('week: the mark begins a week from what was last seen in the one before', () => {
  const first = markWeek(null, { quran: 100, focus: 60 }, MON);
  assert.deepEqual(first, { week: MON, quran: 100, focus: 60, seen: { quran: 100, focus: 60 } });
  const later = markWeek(first, { quran: 130, focus: 85 }, MON);
  assert.deepEqual(later, { week: MON, quran: 100, focus: 60, seen: { quran: 130, focus: 85 } });
  // The next Monday, already five pages into the new week when the app first looks.
  const next = markWeek(later, { quran: 135, focus: 85 }, '2026-11-23');
  assert.deepEqual(next, { week: '2026-11-23', quran: 130, focus: 85, seen: { quran: 135, focus: 85 } });
  // The data was replaced by something smaller: counting starts again from there.
  const reset = markWeek(next, { quran: 0, focus: 20 }, '2026-11-23');
  assert.deepEqual(reset, { week: '2026-11-23', quran: 0, focus: 20, seen: { quran: 0, focus: 20 } });
  assert.deepEqual(weekTotals(profile({ quranPages: 7, focus: { day: MON, min: 25, n: 1, total: 300 } })), { quran: 7, focus: 300 });
  assert.deepEqual(weekTotals(profile()), { quran: 0, focus: 0 });
});

// ---------- the letter ----------

const plain: LetterWords = {
  lead: 'Your week:',
  tail: 'A new week starts tomorrow.',
  prayers: (n) => `${n} of 35 prayers`,
  quran: (n) => `${n} pages of Qurʼan`,
  habits: (done, due) => `habits ${done} of ${due}`,
  focus: (n) => `${n} min of focus`,
  tasks: (n) => `${n} tasks done`,
  xp: (n) => `${n} XP`,
};
const numbers = (patch: Partial<Parameters<typeof weekLetter>[0]> = {}) => ({ prayers: 0, quran: 0, habits: { done: 0, due: 0 }, focus: 0, tasks: 0, xp: 0, ...patch });

/** The letter's words as the app has them in a language, read straight from its texts. */
function wordsIn(lang: 'en' | 'uz' | 'ru'): LetterWords {
  const texts = { en, uz, ru }[lang] as Record<string, string>;
  const rules = new Intl.PluralRules(lang);
  const fill = (text: string | undefined, vars: Record<string, string | number> = {}): string => {
    assert.ok(text, 'the text is there');
    return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
  return letterWords(
    (key, vars) => fill(texts[key], vars),
    (key, n) => fill(texts[`${key}_${rules.select(n)}`] ?? texts[`${key}_other`], { n }),
  );
}

test('letter: the week as one message', () => {
  const w = numbers({ prayers: 31, quran: 12, habits: { done: 18, due: 21 } });
  assert.equal(weekLetter(w, plain), 'Your week: 31 of 35 prayers · 12 pages of Qurʼan · habits 18 of 21. A new week starts tomorrow.');
});

test('letter: only what is not zero, three parts at most, the most important first', () => {
  const all = numbers({ prayers: 31, quran: 12, habits: { done: 18, due: 21 }, focus: 140, tasks: 9, xp: 420 });
  assert.deepEqual(weekParts(all), ['prayers', 'quran', 'habits', 'focus', 'tasks', 'xp']);
  assert.equal(weekLetter(all, plain), 'Your week: 31 of 35 prayers · 12 pages of Qurʼan · habits 18 of 21. A new week starts tomorrow.');
  // No prayers and no pages: the next ones move up.
  assert.equal(weekLetter({ ...all, prayers: 0, quran: 0 }, plain), 'Your week: habits 18 of 21 · 140 min of focus · 9 tasks done. A new week starts tomorrow.');
  // Habits that were due but not kept are a zero too.
  assert.equal(weekLetter(numbers({ habits: { done: 0, due: 14 }, tasks: 2, xp: 10 }), plain), 'Your week: 2 tasks done · 10 XP. A new week starts tomorrow.');
  assert.equal(weekLetter(numbers({ xp: 15 }), plain), 'Your week: 15 XP. A new week starts tomorrow.');
});

test('letter: an empty week sends nothing at all', () => {
  assert.equal(weekLetter(numbers(), plain), '');
  assert.equal(weekLetter(numbers({ habits: { done: 0, due: 21 } }), plain), '');
  assert.equal(weekLetter(weekOf(nothing(), THU), plain), '');
});

test('letter: it stays under 200 characters in every language, however big the week', () => {
  const big = numbers({ prayers: 35, quran: 9999, habits: { done: 999, due: 999 }, focus: 10080, tasks: 999, xp: 99999 });
  const parts = ['prayers', 'quran', 'habits', 'focus', 'tasks', 'xp'] as const;
  for (const lang of ['en', 'uz', 'ru'] as const) {
    const words = wordsIn(lang);
    // Every three parts that can stand together, with the mark the bot puts in front.
    for (let a = 0; a < parts.length; a++) {
      for (let b = a + 1; b < parts.length; b++) {
        for (let c = b + 1; c < parts.length; c++) {
          const shown = new Set([parts[a], parts[b], parts[c]]);
          const w = numbers(Object.fromEntries(parts.filter((p) => shown.has(p)).map((p) => [p, big[p]])));
          const text = `✉️ ${weekLetter(w, words)}`;
          assert.ok(text.length < LETTER_LIMIT, `${lang}: ${text.length} characters: ${text}`);
          assert.ok(!/[{}]/.test(text) && text.split(' · ').length === 3, `${lang}: ${text}`);
        }
      }
    }
    // The forms of a number: one page, two, five.
    for (const n of [1, 2, 5, 21]) assert.ok(weekLetter(numbers({ quran: n, tasks: n }), words).includes(String(n)), lang);
  }
  assert.equal(weekLetter(numbers({ prayers: 31, quran: 1, tasks: 1 }), wordsIn('en')), 'Your week: 31 of 35 prayers · 1 page of Qurʼan · 1 task done. A new week starts tomorrow.');
  assert.equal(weekLetter(numbers({ prayers: 31, quran: 2, habits: { done: 18, due: 21 } }), wordsIn('ru')), 'Ваша неделя: 31 из 35 намазов · 2 страницы Корана · привычки 18 из 21. Завтра начинается новая неделя.');
  assert.equal(weekLetter(numbers({ prayers: 31, quran: 12, habits: { done: 18, due: 21 } }), wordsIn('uz')), 'Haftangiz: 35 namozdan 31 tasi · 12 bet Qurʼon · odatlar: 21 tadan 18 tasi. Ertaga yangi hafta boshlanadi.');
});

test('letter: words that run long lose a part, never the limit', () => {
  const wordy: LetterWords = { ...plain, prayers: (n) => `${n} ${'prayers '.repeat(12)}`.trim(), quran: (n) => `${n} ${'pages '.repeat(12)}`.trim() };
  const text = weekLetter(numbers({ prayers: 31, quran: 12, habits: { done: 18, due: 21 } }), wordy);
  assert.ok(text.length < LETTER_LIMIT);
  assert.ok(text.startsWith('Your week: 31 prayers') && text.endsWith('A new week starts tomorrow.'));
  assert.ok(!text.includes('habits'), 'the least important part went first');
});

// ---------- the reminder ----------

test('reminder: one message, on the week\'s Sunday at 20:00, that opens the recap', () => {
  const r = letterReminder('✉️ Your week: 15 XP.', THU, 9 * 60);
  assert.deepEqual(r, { id: 'w_2026-11-22', text: '✉️ Your week: 15 XP.', hour: 20, minute: 0, date: SUN, open: 'week' });
  assert.equal(letterReminder('x', MON, 0)?.date, SUN);
  assert.equal(letterReminder('x', SUN, 19 * 60 + 59)?.id, 'w_2026-11-22', 'still to come on Sunday before eight');
  // What the bot's server asks of an id and of the place a message opens.
  assert.match(r!.id, /^[A-Za-z0-9_.:-]{1,64}$/);
  assert.match(r!.open, /^[A-Za-z0-9_-]{1,64}$/);
});

test('reminder: gone once Sunday 20:00 has passed, and back for the next week on Monday', () => {
  assert.equal(letterReminder('x', SUN, 20 * 60), null);
  assert.equal(letterReminder('x', SUN, 23 * 60 + 59), null);
  assert.equal(letterReminder('x', '2026-11-23', 0)?.id, 'w_2026-11-29');
});

test('reminder: no letter, no reminder', () => {
  assert.equal(letterReminder('', THU, 9 * 60), null);
  assert.equal(letterReminder(weekLetter(weekOf(nothing(), THU), plain), THU, 9 * 60), null);
});

// ---------- what the companion names ----------

test('week: the companion names the best thing, or is kind about a thin week', () => {
  const base = weekOf(nothing(), THU);
  const week = (patch: Partial<typeof base>) => ({ ...base, empty: false, ...patch });
  assert.equal(weekBest(base), 'empty');
  assert.equal(weekBest(week({ prayers: 20 })), 'prayersAll', 'every prayer of the four days so far');
  assert.equal(weekBest(week({ prayers: 17, habits: { done: 6, due: 8 } })), 'prayers');
  assert.equal(weekBest(week({ prayers: 10, habits: { done: 8, due: 8 } })), 'habits');
  assert.equal(weekBest(week({ prayers: 4, quran: 30, focus: 200 })), 'quran');
  assert.equal(weekBest(week({ focus: 90, tasks: 5 })), 'focus');
  assert.equal(weekBest(week({ tasks: 4, xp: 20 })), 'tasks');
  assert.equal(weekBest(week({ prayers: 11, tasks: 1 })), 'prayers', 'more than half of the prayers is still worth naming');
  assert.equal(weekBest(week({ habits: { done: 5, due: 8 } })), 'habits');
  assert.equal(weekBest(week({ habits: { done: 2, due: 2 }, xp: 10 })), 'thin', 'too few habits were due to judge by');
  assert.equal(weekBest(week({ quran: 2 })), 'quran');
  assert.equal(weekBest(week({ xp: 10, streak: 6 })), 'streak');
  assert.equal(weekBest(week({ xp: 10, tasks: 1 })), 'thin');
  assert.equal(weekBest(weekOf(sample(), THU)), 'prayers');
});

console.log(`\n${passed} tests passed`);
