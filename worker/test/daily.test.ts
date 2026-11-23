// The tidying of the day's ayah (worker/src/daily.ts): apostrophes and tags.
// Run: npx tsx worker/test/daily.test.ts
import assert from 'node:assert/strict';
import { daysNow, stripTags, uzMarks } from '../src/daily';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ daily: ${name}`);
}

test("Quran.com's footnote marks and tags go", () => {
  assert.equal(stripTags('the Ever-Living,<sup foot_note=196031>1</sup> the Self-Sustaining.<sup foot_note=2>2</sup>'), 'the Ever-Living, the Self-Sustaining.');
  assert.equal(stripTags('<i>a</i>  b'), 'a b');
});

test('Uzbek apostrophes become ʻ and ʼ', () => {
  assert.equal(uzMarks('Undan o`zga iloh yo`q'), 'Undan oʻzga iloh yoʻq');
  assert.equal(uzMarks("g'alaba, ma'no, Qur'on"), 'gʻalaba, maʼno, Qurʼon');
  assert.equal(uzMarks('O‘zing'), 'Oʻzing');
});

test('the days that exist somewhere right now', () => {
  const noon = Date.UTC(2026, 10, 22, 12);
  assert.deepEqual(daysNow(noon), ['2026-11-21', '2026-11-22', '2026-11-23']);
});

console.log(`${passed} tests passed`);
