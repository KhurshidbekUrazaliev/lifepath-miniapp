// Writes worker/src/hadithPool.ts: the hadith the companion's Hadis button picks from at random.
// Sahih al-Bukhari and Sahih Muslim whole; from Abu Dawud, at-Tirmidhi, an-Nasaʼi and Ibn Majah those
// that al-Albani graded "Sahih". Numbers as in the open hadith-api collection (fawazahmed0, jsDelivr).
//   node scripts/hadith-pool.mjs
import { writeFileSync } from 'node:fs';

const INFO = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/info.min.json';
const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];
const WHOLE = new Set(['bukhari', 'muslim']);

const info = await (await fetch(INFO)).json();
const ranges = (nums) => {
  const out = [];
  for (const n of nums) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
};
const lines = [];
for (const book of BOOKS) {
  const nums = [...new Set(
    info[book].hadiths
      .filter((h) => Number.isInteger(h.hadithnumber) && h.hadithnumber > 0)
      .filter((h) => WHOLE.has(book) || h.grades.some((g) => g.name === 'Al-Albani' && /^\s*sahih\s*$/i.test(g.grade)))
      .map((h) => h.hadithnumber),
  )].sort((a, b) => a - b);
  console.log(book, nums.length);
  lines.push(`  ${book}: '${ranges(nums)}',`);
}
writeFileSync(
  'worker/src/hadithPool.ts',
  `// Written by scripts/hadith-pool.mjs: do not edit by hand. Hadith numbers (ranges "a-b") per book.\nexport const POOL_RANGES = {\n${lines.join('\n')}\n} as const;\n`,
);
