// The companion's Hadis button (worker/src/hadith.ts): the pool of six books and which hadith suit the
// speech bubble. Run: npx tsx worker/test/hadith.test.ts
import assert from 'node:assert/strict';
import { prophetsWords, randomPick, russianWords, tidyEnglish } from '../src/hadith';
import { POOL_RANGES } from '../src/hadithPool';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ hadith: ${name}`);
}

test('the pool has all six books, and picks from each', () => {
  assert.deepEqual(Object.keys(POOL_RANGES).sort(), ['abudawud', 'bukhari', 'ibnmajah', 'muslim', 'nasai', 'tirmidhi']);
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(randomPick((() => { const x = (i * 0.618034) % 1; return () => x; })()).book);
  assert.equal(seen.size, 6);
  assert.equal(randomPick(() => 0).book, 'bukhari');
  assert.ok(randomPick(() => 0.999999).n > 0);
});

test("the four Sunan hold only al-Albani's Sahih", () => {
  // Abu Dawud 1 is "Hasan Sahih" by al-Albani; Abu Dawud 12 is "Sahih".
  const has = (book: keyof typeof POOL_RANGES, n: number) =>
    POOL_RANGES[book].split(',').some((p) => {
      const [a, b] = p.split('-').map(Number);
      return n >= a! && n <= (b ?? a!);
    });
  assert.equal(has('abudawud', 1), false);
  assert.equal(has('abudawud', 12), true);
});

test("only the Prophet's own words are kept, short, told straight, and alone", () => {
  assert.equal(
    prophetsWords(tidyEnglish('Narrated Anas: The Prophet (ﷺ) said "None of you will have faith till he loves me more than his father, his children and all mankind')),
    'None of you will have faith till he loves me more than his father, his children and all mankind.',
  );
  assert.equal(
    prophetsWords("It was narrated from Ibn ‘Umar that the Messenger of Allah (ﷺ) said: “The believer who mixes with people and bears their annoyance with patience will have a greater reward.”"),
    'The believer who mixes with people and bears their annoyance with patience will have a greater reward.',
  );
  // a story before his words
  assert.equal(prophetsWords('Narrated AbuBakrah: One day the Prophet (ﷺ) said: Which of you had a dream? I saw as though a scale descended from the sky.'), null);
  // the Companions speak, not he
  assert.equal(prophetsWords('It was narrated from Bashir bin yasar that the Companions of the Messenger of Allah said: "The Messenger of Allah granted a concession allowing sales by estimate'), null);
  // somebody else speaks after him
  assert.equal(prophetsWords('Abu Huraira reported: The Messenger of Allah (ﷺ) said: Should I not suggest to you that by which Allah obliterates the sins. They said: Yes, Messenger of Allah.'), null);
  // not his words at all
  assert.equal(prophetsWords('Narrated Anas bin Malik: "On the day in which the Messenger of Allah (ﷺ) entered Al-Madinah, everything in it was illuminated."'), null);
  // too long
  assert.equal(prophetsWords(`Narrated Anas: The Prophet (ﷺ) said, "${'Be kind and patient with people. '.repeat(20)}"`), null);
});

test('the Russian quotation is found, nested quotes included', () => {
  assert.equal(russianWords('Передают со слов Джабира, что Пророк ﷺ сказал: «Какая хорошая приправа — уксус»'), 'Какая хорошая приправа — уксус');
  assert.equal(russianWords('Он сказал: «Аллах сказал: «Я с рабом Моим, когда он поминает Меня»»'), 'Аллах сказал: «Я с рабом Моим, когда он поминает Меня»');
  assert.equal(russianWords('Без цитаты.'), null);
});

test('the other books’ English is tidied', () => {
  assert.equal(tidyEnglish("Abu Hurairah narrated that :Allah's Messenger said"), "Abu Hurairah narrated that: Allah's Messenger said");
  assert.equal(tidyEnglish('the Apostle of Allaah ( sal Allaahu alayhi wa sallam) said'), 'the Apostle of Allaah (ﷺ) said');
});

console.log(`${passed} tests passed`);
