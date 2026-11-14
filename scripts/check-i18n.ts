// Checks that uz.ts and ru.ts cover en.ts: npx tsx scripts/check-i18n.ts
import { en } from '../src/i18n/en';
import { uz } from '../src/i18n/uz';
import { ru } from '../src/i18n/ru';

const base = (k: string) => k.replace(/_(one|few|many|other|two|zero)$/, '');
const english = en as Record<string, string>;
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
let problems = 0;

for (const [name, dict, forms] of [['uz', uz, ['other']], ['ru', ru, ['one', 'few', 'many', 'other']]] as const) {
  const pluralBases = new Set(Object.keys(english).filter((k) => /_(one|other)$/.test(k)).map(base));
  for (const key of Object.keys(english)) {
    if (/_(one|other)$/.test(key)) continue;
    if (!(key in dict)) { console.log(`${name}: missing ${key}`); problems++; }
    else if (placeholders(dict[key]) !== placeholders(english[key])) { console.log(`${name}: placeholders differ in ${key}`); problems++; }
  }
  for (const b of pluralBases) {
    for (const f of forms) if (!(`${b}_${f}` in dict)) { console.log(`${name}: missing ${b}_${f}`); problems++; }
  }
  for (const key of Object.keys(dict)) {
    if (!(key in english) && !pluralBases.has(base(key))) { console.log(`${name}: unknown key ${key}`); problems++; }
    if (dict[key].trim() === '') { console.log(`${name}: empty ${key}`); problems++; }
  }
  console.log(`${name}: ${Object.keys(dict).length} strings`);
}
console.log(problems ? `${problems} problems` : 'i18n ok');
process.exit(problems ? 1 : 0);
