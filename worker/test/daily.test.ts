// The tidying of the day's ayah and hadith (worker/src/daily.ts): apostrophes, scripts, tags and the
// choice of a hadith that suits a card. Run: npx tsx worker/test/daily.test.ts
import assert from 'node:assert/strict';
import { daysNow, pickDay, pickDeadline, stripTags, suitsTheDay, tidyEnglishHadith, uzLatin, uzMarks } from '../src/daily';

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

test('Cyrillic Uzbek is written in Latin letters', () => {
  assert.equal(uzLatin('Аллоҳ ҳеч бир жонни'), 'Alloh hech bir jonni');
  assert.equal(uzLatin('Ўзбекистон ғалаба қилди'), 'Oʻzbekiston gʻalaba qildi');
  assert.equal(uzLatin('ер, Европа, шеър'), 'yer, Yevropa, sheʼr');
  assert.equal(uzLatin('Latin stays'), 'Latin stays');
});

test("the English narrator line is tidied", () => {
  assert.equal(tidyEnglishHadith("Narrated `Aisha:Allah's Messenger (ﷺ) said"), "Narrated ʿAisha: Allah's Messenger (ﷺ) said");
});

test("a hadith suits the day only as the Prophet's words, and short", () => {
  const en = 'Narrated Abu Huraira: The Prophet (ﷺ) said, "Religion is very easy."';
  assert.equal(suitsTheDay('Сообщается со слов Абу Хурайры, что Пророк ﷺ сказал: «Поистине, эта религия легка, и никто не будет состязаться с ней»', en), true);
  assert.equal(suitsTheDay('Сообщается, что он совершил молитву, а потом ушёл домой и лёг спать до утра.', en), false); // no quotation
  assert.equal(suitsTheDay(`Сказал: «${'очень длинный рассказ '.repeat(40)}»`, en), false); // too long
});

test('the days that exist somewhere right now', () => {
  const noon = Date.UTC(2026, 10, 22, 12);
  assert.deepEqual(daysNow(noon), ['2026-11-21', '2026-11-22', '2026-11-23']);
});

test('the owner chooses the hadith of the day until 12:00 in Busan, then for the next day', () => {
  assert.equal(pickDeadline('2026-11-23'), Date.UTC(2026, 10, 23, 3));
  assert.equal(pickDay(Date.UTC(2026, 10, 22, 16)), '2026-11-23'); // 01:00 in Busan
  assert.equal(pickDay(Date.UTC(2026, 10, 23, 2, 59)), '2026-11-23'); // 11:59
  assert.equal(pickDay(Date.UTC(2026, 10, 23, 3)), '2026-11-24'); // 12:00
  assert.equal(pickDay(Date.UTC(2026, 10, 23, 14, 59)), '2026-11-24'); // 23:59
});

console.log(`${passed} tests passed`);
