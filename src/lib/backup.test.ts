// Tests for backups: what is written, what is read back, and what is turned away.
// Run with `npx tsx src/lib/backup.test.ts`.
import assert from 'node:assert/strict';
import { BACKUP_APP, BACKUP_VERSION, readBackup, restored, writeBackup } from './backup';
import { sameData } from './cloudCodec';
import { levelInfo } from './gamify';
import type { Data } from './stats';
import { emptyData, snapshot, useStore } from '../store/store';
import { exportJson } from '../store/sync';
import { buildDemo } from '../store/demo';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A full, believable set of data: the app's own examples, loaded into the real store.
useStore.getState().replaceData(buildDemo(emptyData()));
const full: Data = snapshot();
const text = exportJson();

const read = (pasted: string) => readBackup(pasted, emptyData());
const problemOf = (pasted: string) => {
  const r = read(pasted);
  return r.ok ? 'ok' : r.problem;
};
/** The backup with its data changed by `change`. */
function altered(change: (data: any) => void): string {
  const backup = JSON.parse(text);
  change(backup.data);
  return JSON.stringify(backup);
}

test('backup: what "Copy a backup" writes comes back equal', () => {
  const r = read(text);
  assert.ok(r.ok);
  assert.ok(sameData(r.data, full), 'every list, the profile and the settings are as they were');
  assert.equal(r.data.pages.length, full.pages.length);
  assert.equal(text, writeBackup(full, Date.parse(JSON.parse(text).exportedAt)), 'the store and this file write the same thing');
});

test('backup: the summary says when it was made and what is in it', () => {
  const made = Date.UTC(2026, 10, 14, 18, 40);
  const r = read(writeBackup(full, made));
  assert.ok(r.ok);
  const notes = full.pages.filter((p) => p.kind === 'note').length;
  assert.deepEqual(r.summary, {
    madeAt: made,
    goals: full.tasks.length,
    habits: full.habits.length,
    logs: full.entries.length,
    pages: full.pages.length - notes,
    notes,
    level: levelInfo(full.profile.xp).level,
  });
  assert.ok(r.summary.goals > 0 && r.summary.logs > 0 && r.summary.pages > 0 && r.summary.notes > 0, 'the example has some of each');
});

test('backup: spaces and line breaks around a paste do not matter', () => {
  assert.equal(problemOf(`\n  ${text}\n\n`), 'ok');
});

test('backup: nothing pasted is said to be nothing', () => {
  assert.equal(problemOf(''), 'empty');
  assert.equal(problemOf('  \n\t '), 'empty');
});

test('backup: rubbish is not a backup', () => {
  for (const rubbish of ['hello there', '12', 'null', 'true', '[]', '"a text"', '{{{', '<html></html>', 'https://t.me/lifepath_bot']) {
    assert.equal(problemOf(rubbish), 'notBackup', rubbish);
  }
});

test('backup: JSON of another shape is not a backup', () => {
  assert.equal(problemOf('{"goals":[],"habits":[]}'), 'notBackup');
  assert.equal(problemOf(JSON.stringify({ app: 'lifepath', version: 1, data: full })), 'notBackup', 'another app');
  assert.equal(problemOf(JSON.stringify({ version: 1, data: full })), 'notBackup', 'no name');
  assert.equal(problemOf(JSON.stringify({ app: BACKUP_APP, data: full })), 'notBackup', 'no version');
  assert.equal(problemOf(JSON.stringify({ app: BACKUP_APP, version: '1', data: full })), 'notBackup', 'a version that is not a number');
  assert.equal(problemOf(JSON.stringify(full)), 'notBackup', 'the data without its wrapping');
});

test('backup: one made by a newer LifePath is named as such', () => {
  assert.equal(problemOf(JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION + 1, exportedAt: '2027-01-01T00:00:00.000Z', data: {} })), 'newer');
});

test('backup: one that lost its end is damaged', () => {
  assert.equal(problemOf(text.slice(0, Math.floor(text.length / 2))), 'damaged');
  assert.equal(problemOf(text.slice(0, -1)), 'damaged');
  assert.equal(problemOf(JSON.stringify({ app: BACKUP_APP, version: 1 })), 'damaged', 'no data at all');
  assert.equal(problemOf(JSON.stringify({ app: BACKUP_APP, version: 1, data: [] })), 'damaged');
});

test('backup: a part of the wrong kind is damaged, whichever part it is', () => {
  const broken: [string, (d: any) => void][] = [
    ['goals that are not a list', (d) => { d.tasks = {}; }],
    ['a goal without its steps', (d) => { delete d.tasks[0].milestones; }],
    ['a step that is not a step', (d) => { d.tasks.find((t: any) => t.milestones.length).milestones[0] = 'x'; }],
    ['a goal of an unknown kind', (d) => { d.tasks[0].progressType = 'magic'; }],
    ['a log without its time', (d) => { delete d.entries[0].at; }],
    ['a log whose XP is words', (d) => { d.entries[0].xp = 'ten'; }],
    ['an area without an id', (d) => { d.folders[0].id = ''; }],
    ['a habit whose days are not a list', (d) => { d.habits[0].days = 'every day'; }],
    ['a to-do on a day that is not a day', (d) => { d.plans[0].day = 'tomorrow'; }],
    ['check-offs that are not numbers', (d) => { d.checks[Object.keys(d.checks)[0]] = { a: 'yes' }; }],
    ['prayers that are a list', (d) => { d.worship = []; }],
    ['a page without its words', (d) => { delete d.pages[0].text; }],
    ['a feeling that is not one of the five', (d) => { d.pages[0].mood = 9; }],
    ['a profile that is a list', (d) => { d.profile = []; }],
    ['XP that is not a number', (d) => { d.profile.xp = '120'; }],
    ['XP no level could be worked out from', (d) => { d.profile.xp = 1e300; }],
    ['a streak that is a number', (d) => { d.profile.streak = 4; }],
    ['a language the app does not have', (d) => { d.settings.lang = 'fr'; }],
    ['a place that is a name', (d) => { d.settings.place = 'Tashkent'; }],
    ['a switch that is a word', (d) => { d.settings.reminders = 'yes'; }],
  ];
  for (const [what, change] of broken) assert.equal(problemOf(altered(change)), 'damaged', what);
});

test('backup: what an older backup lacks is filled as on a fresh start', () => {
  const fresh = emptyData();
  // From before prayers and the journal: no such lists, a short profile, the first settings.
  const older = JSON.stringify({
    app: BACKUP_APP,
    version: 1,
    exportedAt: '2026-10-01T08:00:00.000Z',
    data: {
      folders: full.folders, tasks: full.tasks, entries: full.entries, plans: full.plans, habits: full.habits, checks: full.checks,
      profile: { name: 'Amina', xp: 420, sparks: 12, streak: { current: 3, best: 9 }, freezes: 1 },
      settings: { lang: 'uz', theme: 'dark', onboarded: true },
    },
  });
  const r = read(older);
  assert.ok(r.ok);
  assert.deepEqual(r.data.worship, {});
  assert.deepEqual(r.data.pages, []);
  assert.equal(r.data.profile.name, 'Amina');
  assert.deepEqual(r.data.profile.nudge, fresh.profile.nudge);
  assert.deepEqual(r.data.profile.achievements, {});
  assert.equal(r.data.profile.dailyGoalXp, fresh.profile.dailyGoalXp);
  assert.equal(r.data.settings.lang, 'uz');
  assert.equal(r.data.settings.verse, fresh.settings.verse);
  assert.equal(r.data.settings.reminders, false);
  assert.deepEqual(r.summary, { madeAt: Date.parse('2026-10-01T08:00:00.000Z'), goals: full.tasks.length, habits: full.habits.length, logs: full.entries.length, pages: 0, notes: 0, level: levelInfo(420).level });

  // A backup of nothing is still a backup: everything is as on a fresh start.
  const none = read(JSON.stringify({ app: BACKUP_APP, version: 1, data: {} }));
  assert.ok(none.ok);
  assert.ok(sameData(none.data, fresh));
  assert.equal(none.summary.madeAt, undefined, 'and it does not say when it was made');
});

test('backup: a field that is null counts as not there', () => {
  const r = read(altered((d) => { d.tasks[0].deadline = null; d.pages[0].mood = null; d.settings.place = null; }));
  assert.ok(r.ok);
  assert.ok(!('deadline' in r.data.tasks[0]) && !('mood' in r.data.pages[0]) && !('place' in r.data.settings));
  // But a field that has to be there cannot be null.
  assert.equal(problemOf(altered((d) => { d.tasks[0].title = null; })), 'damaged');
});

test('backup: what a later version added is kept, and a record written twice is taken once', () => {
  const r = read(altered((d) => {
    d.settings.somethingNew = { a: 1 };
    d.habits[0].colourOfTheYear = 'teal';
    d.entries.push(d.entries[0]);
  }));
  assert.ok(r.ok);
  assert.deepEqual((r.data.settings as unknown as Record<string, unknown>).somethingNew, { a: 1 });
  assert.equal((r.data.habits[0] as unknown as Record<string, unknown>).colourOfTheYear, 'teal');
  assert.equal(r.data.entries.length, full.entries.length);
});

test('backup: restoring keeps what belongs to this phone', () => {
  const backup: Data = { ...full, settings: { ...full.settings, lang: 'ru', theme: 'light', reminders: true, onboarded: false, journalAt: '21:30' } };
  const here: Data = { ...emptyData(), settings: { ...emptyData().settings, lang: 'uz', theme: 'dark', reminders: false, onboarded: true } };
  const next = restored(backup, here);
  assert.equal(next.settings.lang, 'uz');
  assert.equal(next.settings.theme, 'dark');
  assert.equal(next.settings.reminders, false, 'Telegram decides whether the bot may write, not the backup');
  assert.equal(next.settings.onboarded, true, 'no welcome screens again');
  assert.equal(next.settings.journalAt, '21:30', 'the rest of the settings come from the backup');
  assert.equal(next.profile, backup.profile);
  assert.equal(next.pages, backup.pages);
  assert.equal(next.entries, backup.entries);
});

test('backup: invalid dates, calendar offsets and bit masks cannot reach the store', () => {
  const defaults = emptyData();
  for (const patch of [
    { pages: [{ id: 'bad', day: '2026-02-31', at: 1, text: 'x' }] },
    { worship: { '2026-99': { fajr: 1 } } },
    { checks: { '2026-01': { habit: -1 } } },
    { settings: { ...defaults.settings, hijriOffset: 9999999 } },
  ]) assert.equal(readBackup(writeBackup({ ...defaults, ...patch }), defaults).ok, false);
});

console.log(`\n${passed} tests passed`);
