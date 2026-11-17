// Tests for what the app reports about its own errors. Run with: npx tsx src/lib/errors.test.ts
import assert from 'node:assert/strict';
import {
  reportMessage, reportStack, MESSAGE_MAX, REPORTS_PER_START, STACK_LINES, STACK_LINE_MAX, byBuild, errorKey, isLoadError, reportGate, tidyMessage, tidyStack, worthReporting,
  type ErrorRow,
} from './errors';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  ✓', name);
}

test('a message: on one line, and never longer than 200 characters', () => {
  assert.equal(tidyMessage('  Cannot read properties\n\tof undefined  '), 'Cannot read properties of undefined');
  const long = tidyMessage('x'.repeat(500));
  assert.equal(Array.from(long).length, MESSAGE_MAX);
  assert.ok(long.endsWith('…'));
  // Cut between characters, never through the middle of one.
  const faces = tidyMessage('🙂'.repeat(300));
  assert.equal(Array.from(faces).length, MESSAGE_MAX);
  assert.ok(!faces.includes('�'));
  assert.equal(tidyMessage('short'), 'short');
});

test('a message: something that is not text is still a message', () => {
  assert.equal(tidyMessage(undefined), '');
  assert.equal(tidyMessage(null), '');
  assert.equal(tidyMessage(42), '42');
  assert.equal(tidyMessage({ toString: () => 'odd thing' }), 'odd thing');
});

test('a message: a name from the code stays in its quotes, anything a person could have typed goes', () => {
  assert.equal(tidyMessage("Cannot read properties of undefined (reading 'length')"), "Cannot read properties of undefined (reading 'length')");
  assert.equal(tidyMessage("undefined is not an object (evaluating 'a.pages[0].text')"), "undefined is not an object (evaluating 'a.pages[0].text')");
  assert.equal(tidyMessage('Bad title “Мой день был хорошим”'), 'Bad title “…”');
  assert.equal(tidyMessage("no task 'Morning walk' in the plan"), "no task '…' in the plan");
  // One apostrophe is not a pair of quotes.
  assert.equal(tidyMessage("Can't find variable: foo"), "Can't find variable: foo");
});

test('a message: what could not be read as JSON is somebody\'s data, and none of it stays', () => {
  assert.equal(tidyMessage('Unexpected token \'M\', "Morning walk before work" is not valid JSON'), 'Unexpected token "…" is not valid JSON');
  // Not even one word, which elsewhere would pass for a name from the code.
  assert.equal(tidyMessage('JSON Parse error: Unexpected identifier "Alisher"'), 'JSON Parse error: Unexpected identifier "…"');
  assert.equal(tidyMessage('Unexpected token \'S\', "She said "no" to"... is not valid JSON'), 'Unexpected token "…"... is not valid JSON');
  assert.equal(tidyMessage('JSON.parse: unexpected character at line 1 column 1 of the JSON data'), 'JSON.parse: unexpected character at line 1 column 1 of the JSON data');
});

test('a message: addresses keep only their path, and mail addresses, ids and tokens are gone', () => {
  assert.equal(
    tidyMessage('Failed to load https://lifepath.example.workers.dev/assets/index-AbC.js?user=77#top now'),
    'Failed to load /assets/index-AbC.js now',
  );
  assert.equal(tidyMessage('fetch https://api.example.com failed'), 'fetch <address> failed');
  assert.equal(tidyMessage('write to someone@example.com failed'), 'write to <mail> failed');
  assert.equal(tidyMessage('user 123456789 has no row'), 'user # has no row');
  assert.equal(tidyMessage('level 12, 30 XP'), 'level 12, 30 XP');
  assert.equal(tidyMessage('bad hash 9f86d081884c7d659a2feaa0c55ad015'), 'bad hash #');
});

test('a stack: only the lines that name a place, the first few of them, without the message', () => {
  const chrome = [
    'TypeError: Cannot read properties of undefined (reading "secret words")',
    '    at Xe (https://lifepath.example.workers.dev/assets/index-CDkMd8jQ.js:12:1034567)',
    '    at Array.map (<anonymous>)',
    '    at https://lifepath.example.workers.dev/assets/index-CDkMd8jQ.js?v=3:40:22',
    '    at a (https://lifepath.example.workers.dev/assets/plan-9xY.js:1:5)',
  ].join('\n');
  assert.equal(
    tidyStack(chrome),
    ['at Xe (/assets/index-CDkMd8jQ.js:12:1034567)', 'at /assets/index-CDkMd8jQ.js:40:22', 'at a (/assets/plan-9xY.js:1:5)'].join('\n'),
  );
  const safari = 'render@https://lifepath.example.workers.dev/assets/index-CDkMd8jQ.js:12:1034567\n@https://lifepath.example.workers.dev/assets/index-CDkMd8jQ.js:40:22\n[native code]';
  assert.equal(tidyStack(safari), 'render@/assets/index-CDkMd8jQ.js:12:1034567\n@/assets/index-CDkMd8jQ.js:40:22');

  const deep = Array.from({ length: 30 }, (_, i) => `    at f${i} (https://h.example/assets/a.js:1:${i})`).join('\n');
  assert.equal(tidyStack(deep).split('\n').length, STACK_LINES);
  const wide = tidyStack(`    at ${'f'.repeat(400)} (https://h.example/assets/a.js:1:2)`);
  assert.equal(Array.from(wide).length, STACK_LINE_MAX);

  assert.equal(tidyStack(undefined), '');
  assert.equal(tidyStack('just words, no place'), '');
});

test('worth a report: not an empty error, not cancelled work, not the network', () => {
  assert.equal(worthReporting('TypeError', "Cannot read properties of undefined (reading 'x')"), true);
  assert.equal(worthReporting('Error', 'Minified React error #310'), true);
  assert.equal(worthReporting(undefined, 'Script error.'), false);
  assert.equal(worthReporting('Error', ''), false);
  assert.equal(worthReporting('Error', 'ResizeObserver loop completed with undelivered notifications.'), false);
  assert.equal(worthReporting('AbortError', 'The operation was aborted'), false);
  assert.equal(worthReporting('TypeError', 'Failed to fetch dynamically imported module: /assets/plan-1.js'), false);
  assert.equal(worthReporting('TypeError', 'Load failed'), false);
});

test('could not be fetched: every browser has its own words for it', () => {
  assert.equal(isLoadError('Failed to fetch dynamically imported module: https://x/assets/a.js'), true);
  assert.equal(isLoadError('Importing a module script failed.'), true);
  assert.equal(isLoadError('error loading dynamically imported module'), true);
  assert.equal(isLoadError('NetworkError when attempting to fetch resource.'), true);
  assert.equal(isLoadError("Cannot read properties of undefined (reading 'x')"), false);
  assert.equal(isLoadError(undefined), false);
});

test('the gate: the same message once, and five reports from one start at most', () => {
  const gate = reportGate();
  assert.equal(gate('a'), true);
  assert.equal(gate('a'), false);
  assert.equal(gate('b'), true);
  for (let i = 0; i < REPORTS_PER_START - 2; i++) assert.equal(gate(`more ${i}`), true);
  assert.equal(gate('one too many'), false);
  // A message the gate refused is not sent later either.
  assert.equal(gate('one too many'), false);
  assert.equal(reportGate(1)('x'), true);
  const one = reportGate(1);
  one('x');
  assert.equal(one('y'), false);
});

test('the row: one key for a build and a message, another for anything else', () => {
  const key = errorKey('261117.0423-edab962', 'Cannot read properties of undefined');
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.equal(errorKey('261117.0423-edab962', 'Cannot read properties of undefined'), key);
  assert.notEqual(errorKey('261118.0101-edab962', 'Cannot read properties of undefined'), key);
  assert.notEqual(errorKey('261117.0423-edab962', 'Cannot read properties of null'), key);
  // Where the build ends and the message begins matters.
  assert.notEqual(errorKey('a', 'bc'), errorKey('ab', 'c'));
  const many = new Set(Array.from({ length: 5000 }, (_, i) => errorKey('build', `message ${i}`)));
  assert.equal(many.size, 5000);
});

test('the list: rows gathered by build, in the order they came, with each build counted', () => {
  const row = (key: string, count: number, lastAt: number): ErrorRow => ({
    key, kind: 'error', message: key, stack: '', screen: '', platform: '', tg: '', lang: 'en', count, firstAt: 1, lastAt,
  });
  const builds = byBuild([
    { build: 'b2', ...row('x', 3, 50) },
    { build: 'b2', ...row('y', 1, 40) },
    { build: 'b1', ...row('z', 7, 90) },
  ]);
  assert.deepEqual(builds.map((b) => [b.build, b.count, b.lastAt, b.errors.map((e) => e.key)]), [
    ['b2', 4, 50, ['x', 'y']],
    ['b1', 7, 90, ['z']],
  ]);
  assert.ok(!('build' in builds[0].errors[0]));
  assert.deepEqual(byBuild([]), []);
});

test('reports cannot carry arbitrary journal text, short names, counts or private URL paths', () => {
  for (const message of ['My diary: I feel worried', 'Alisher', 'mood 3, journal 7', 'Error: wrote 12 days', 'Could not read "A page"', 'https://example.com/journal/private-page']) {
    assert.equal(reportMessage(message), 'Unexpected application error');
  }
  assert.equal(reportMessage("TypeError: Cannot read properties of undefined (reading 'title')"), "TypeError: Cannot read properties of undefined (reading 'title')");
  assert.equal(reportMessage("Cannot read properties of null (reading 'Alisher')"), 'Cannot read properties of null');
  assert.equal(reportMessage('Minified React error #310; visit a link with private args'), 'Minified React error #310');
  assert.equal(reportStack('at PrivateName (https://example.com/assets/index-AbC.js:1:10)'), 'at /assets/index-AbC.js:1:10');
  assert.equal(reportStack('at A (https://example.com/journal/MyPrivateNote:1:10)'), '');
});

console.log(`\n${passed} tests passed`);
