// Tests for what the journal can give out: itself as plain text, and a year in the colours of its days.
// Run with `npx tsx src/lib/journal-text.test.ts`.
import assert from 'node:assert/strict';
import { JournalWords, journalText, journalYears, yearOf } from './journal';
import type { Feeling, Page } from './types';
import { dayKeyToMs } from './calendar';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const words: JournalWords = {
  title: 'LifePath journal',
  diary: 'Diary',
  notes: 'Notes',
  note: 'Note',
  feelings: { 5: 'Great', 4: 'Good', 3: 'Okay', 2: 'Low', 1: 'Hard' },
  date: (day) => `<${day}>`,
};

let seq = 0;
const entry = (day: string, text: string, patch: Partial<Page> = {}): Page => ({ id: `d${++seq}`, day, at: dayKeyToMs(day, 21), text, ...patch });
const note = (day: string, text: string, patch: Partial<Page> = {}): Page => ({ id: `n${++seq}`, kind: 'note', day, at: dayKeyToMs(day, 13), text, ...patch });

test('journal text: the diary from its first day to its last, then the notes', () => {
  const pages = [
    note('2026-11-10', '- Rabbi zidni ʼilma\n✓ Health for my parents\n#duas', { title: 'My duas', pin: true }),
    entry('2026-11-15', 'Tired, skipped the run.\n\nTomorrow is a new page.', { mood: 2, title: 'A heavy day' }),
    entry('2026-11-14', 'Walked to the bazaar with Dad.', { mood: 5 }),
    note('2026-11-12', 'Three kinds of patience. #study #Khutbah', { edited: dayKeyToMs('2026-11-13', 9) }),
  ];
  assert.equal(
    journalText(pages, words),
    [
      'LifePath journal',
      '================',
      '',
      '',
      'Diary',
      '-----',
      '',
      '<2026-11-14> · Great',
      '',
      'Walked to the bazaar with Dad.',
      '',
      '',
      '<2026-11-15> · Low',
      'A heavy day',
      '',
      'Tired, skipped the run.',
      '',
      'Tomorrow is a new page.',
      '',
      '',
      'Notes',
      '-----',
      '',
      'My duas',
      '<2026-11-10> · #duas',
      '',
      '- Rabbi zidni ʼilma',
      '[x] Health for my parents',
      '#duas',
      '',
      '',
      'Note',
      '<2026-11-13> · #study #khutbah',
      '',
      'Three kinds of patience. #study #Khutbah',
      '',
    ].join('\n'),
  );
});

test('journal text: list items read as "- ", ticked ones as "[x] ", whatever mark they were written with', () => {
  const text = journalText([note('2026-11-10', '• Milk\n- Bread\n  ✓ Dates\nNot a list - just a line', { title: 'Shop' })], words);
  assert.ok(text.includes('\n- Milk\n- Bread\n[x] Dates\nNot a list - just a line\n'));
});

test('journal text: two entries on one day keep the order they were written in', () => {
  const day = '2026-11-14';
  const text = journalText([entry(day, 'Evening', { at: dayKeyToMs(day, 22) }), entry(day, 'Morning', { at: dayKeyToMs(day, 7) })], words);
  assert.ok(text.indexOf('Morning') < text.indexOf('Evening'));
});

test('journal text: a day with only a feeling, and a day with only words', () => {
  const text = journalText([entry('2026-11-14', '', { mood: 4 }), entry('2026-11-15', 'Just words')], words);
  assert.ok(text.includes('<2026-11-14> · Good\n\n\n<2026-11-15>\n\nJust words\n'));
});

test('journal text: only the parts there are', () => {
  assert.equal(journalText([], words), '', 'an empty journal gives nothing to copy');
  const diaryOnly = journalText([entry('2026-11-14', 'Words')], words);
  assert.ok(diaryOnly.includes('Diary\n-----') && !diaryOnly.includes('Notes'));
  const notesOnly = journalText([note('2026-11-14', 'Words')], words);
  assert.ok(notesOnly.includes('Notes\n-----') && !notesOnly.includes('Diary'));
  assert.ok(notesOnly.endsWith('Words\n'));
});

test('journal text: a heading is ruled to its own length in any script', () => {
  const text = journalText([entry('2026-11-14', 'Сегодня')], { ...words, title: 'Дневник LifePath', diary: 'Записи' });
  assert.ok(text.startsWith('Дневник LifePath\n================\n'));
  assert.ok(text.includes('\nЗаписи\n------\n'));
});

// ---------- a year in colours ----------

const felt = (day: string, mood?: Feeling, at = 21): Page => entry(day, 'x', { mood, at: dayKeyToMs(day, at) });

test('year: twelve months of thirty-one places, each day in its own colour', () => {
  const pages = [
    felt('2026-01-01', 5),
    felt('2026-02-28', 3),
    felt('2026-11-16'), // written without a feeling
    felt('2026-11-17', 2),
    note('2026-03-03', 'a note is not a day written'),
    felt('2025-12-31', 1), // another year
  ];
  const y = yearOf(pages, 2026, '2026-11-17');
  assert.equal(y.months.length, 12);
  assert.ok(y.months.every((m) => m.length === 31));
  assert.equal(y.months[0][0], 5);
  assert.equal(y.months[0][1], 'blank', 'a day that passed unwritten');
  assert.equal(y.months[1][27], 3);
  assert.equal(y.months[1][28], null, '2026 has no 29 February');
  assert.equal(y.months[3][30], null, 'and April has no 31st');
  assert.equal(y.months[2][2], 'blank');
  assert.equal(y.months[10][15], 'plain');
  assert.equal(y.months[10][16], 2, 'today');
  assert.equal(y.months[10][17], 'later', 'tomorrow has not come');
  assert.equal(y.months[11][30], 'later');
  assert.deepEqual(y.counts, { 1: 0, 2: 1, 3: 1, 4: 0, 5: 1 });
  assert.equal(y.days, 4);
  assert.equal(yearOf(pages, 2024, '2026-11-17').months[1][28], 'blank', 'a leap year has its 29 February');
});

test('year: a day takes the feeling of its latest entry that has one', () => {
  const day = '2026-06-10';
  const pages = [felt(day, 2, 8), felt(day, 4, 20), felt(day, undefined, 23)];
  assert.equal(yearOf(pages, 2026, '2026-11-17').months[5][9], 4);
  assert.equal(yearOf([...pages].reverse(), 2026, '2026-11-17').months[5][9], 4, 'in whatever order the pages are kept');
  assert.deepEqual(yearOf(pages, 2026, '2026-11-17').counts, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
});

test('year: the days written and the longest run stay inside the year', () => {
  const pages = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-03-10', '2026-03-11'].map((day) => felt(day, 4));
  const y = yearOf(pages, 2026, '2026-11-17');
  assert.equal(y.days, 5);
  assert.equal(y.run, 3, 'the run that began last year counts from 1 January');
  assert.equal(yearOf(pages, 2025, '2026-11-17').run, 2);
});

test('year: an empty year is all blank up to today and has nothing to count', () => {
  const y = yearOf([], 2026, '2026-11-17');
  assert.deepEqual([y.days, y.run], [0, 0]);
  assert.deepEqual(y.counts, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  assert.ok(y.months.flat().every((dot) => dot === 'blank' || dot === 'later' || dot === null));
  assert.equal(y.months.flat().filter((dot) => dot === null).length, 12 * 31 - 365);
});

test('year: the years to choose from are the ones written in, and this year', () => {
  assert.deepEqual(journalYears([], '2026-11-17'), [2026]);
  assert.deepEqual(journalYears([felt('2024-05-01', 3), felt('2026-01-01', 3), note('2023-01-01', 'a note')], '2026-11-17'), [2024, 2026]);
  assert.deepEqual(journalYears([felt('2025-05-01', 3)], '2026-01-01'), [2025, 2026]);
});

console.log(`\n${passed} tests passed`);
