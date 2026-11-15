// Fetches the Qur'an and hadith texts LifePath quotes and writes them to src/content/*.json.
// Run by hand when the lists change: node scripts/fetch-content.mjs
//
// Sources are the ones the IlmulHaq bot uses, so both quote the same words:
//   Qur'an: api.quran.com (Uthmani script; Sahih International = 20, Abu Adel = 79 (ru), Muhammad Sodiq = 55 (uz))
//   Hadith: the hadith-api collection on jsDelivr (Sahih al-Bukhari, sunnah.com numbering; eng, rus, ara)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'content');
const QURAN_API = 'https://api.quran.com/api/v4';
const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const TRANSLATIONS = { en: 20, ru: 79, uz: 55 };

// Daily ayat: short verses that stand on their own (the IlmulHaq list plus a few on effort).
export const AYAHS = [
  '2:152', '2:153', '2:186', '2:201', '2:286', '3:8', '3:139', '3:159', '3:173', '3:190', '3:200', '6:162',
  '7:23', '7:56', '9:51', '10:62', '12:87', '13:28', '14:7', '16:97', '16:128', '17:80', '18:10', '20:114',
  '21:87', '23:118', '25:63', '25:74', '28:24', '29:69', '33:41', '39:53', '40:60', '49:10', '49:13', '50:16',
  '51:56', '55:13', '57:4', '65:3', '94:5', '94:6', '2:255', '59:18', '64:11', '93:5',
  '29:6', '53:39', '99:7', '11:115', '2:45', '20:25', '20:26', '94:7', '94:8', '103:1', '103:2', '103:3',
];

// Hadith the companion quotes (Sahih al-Bukhari, sunnah.com numbers). The short forms shown in the
// speech bubble live in src/content/hadith.ts; this file keeps the full texts for the "read in full" view.
export const HADITHS = [
  1, 8, 13, 15, 16, 38, 39, 69, 71, 528, 645, 1145, 1417, 1901, 1903, 2072, 4937, 5009, 5027, 5641,
  6011, 6014, 6018, 6021, 6035, 6064, 6094, 6114, 6116, 6125, 6307, 6405, 6407, 6412, 6416, 6464, 6465,
  6474, 6490, 6514, 7376, 7405, 7563,
];

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  return null;
}

const strip = (s) => (s || '').replace(/<sup[^>]*>.*?<\/sup>/gs, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function quran() {
  const chapters = (await getJson(`${QURAN_API}/chapters?language=en`)).chapters;
  const ru = (await getJson(`${QURAN_API}/chapters?language=ru`)).chapters;
  const ruName = new Map(ru.map((c) => [c.id, c.translated_name?.name ?? '']));
  const surahs = chapters.map((c) => ({
    n: c.id,
    ar: c.name_arabic,
    name: c.name_simple,
    en: c.translated_name?.name ?? '',
    ru: ruName.get(c.id) ?? '',
    ayahs: c.verses_count,
    pages: c.pages,
  }));

  // First page of each juz, from the page of its first verse.
  const juzs = (await getJson(`${QURAN_API}/juzs`)).juzs;
  const firstKeys = new Map();
  for (const j of juzs) {
    if (firstKeys.has(j.juz_number)) continue;
    const [surah, range] = Object.entries(j.verse_mapping)[0];
    firstKeys.set(j.juz_number, `${surah}:${range.split('-')[0]}`);
  }
  const juzStart = [];
  for (let n = 1; n <= 30; n++) {
    const v = (await getJson(`${QURAN_API}/verses/by_key/${firstKeys.get(n)}?fields=page_number`)).verse;
    juzStart.push(v.page_number);
  }

  const ids = Object.values(TRANSLATIONS).join(',');
  const ayat = [];
  for (const key of AYAHS) {
    const v = (await getJson(`${QURAN_API}/verses/by_key/${key}?translations=${ids}&fields=text_uthmani`)).verse;
    const byId = new Map(v.translations.map((t) => [t.resource_id, strip(t.text).replace(/[\s\-–—]+$/, '')]));
    ayat.push({
      k: key,
      ar: v.text_uthmani,
      en: byId.get(TRANSLATIONS.en) ?? '',
      ru: byId.get(TRANSLATIONS.ru) ?? '',
      uz: (byId.get(TRANSLATIONS.uz) ?? '').replace(/`/g, 'ʻ'), // this translation writes oʻ as o`
      page: v.page_number,
    });
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return { surahs, juzStart, ayat };
}

const tidy = (t) => (t || '').replace(/`/g, "'").replace(/(?<=[a-z)]):(?=[A-Z"“'])/g, ': ').trim();

async function hadith() {
  const out = {};
  for (const n of HADITHS) {
    const [en, ru, ar] = await Promise.all(
      ['eng', 'rus', 'ara'].map((ed) => getJson(`${HADITH_API}/${ed}-bukhari/${n}.min.json`).then((j) => j?.hadiths?.[0]?.text ?? '')),
    );
    out[n] = { en: tidy(en), ru: tidy(ru), ar: (ar || '').trim() };
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return out;
}

mkdirSync(OUT, { recursive: true });
const q = await quran();
writeFileSync(join(OUT, 'quran.json'), JSON.stringify(q));
console.log(`quran.json: ${q.surahs.length} surahs, ${q.ayat.length} ayat, juz pages ${q.juzStart.join(',')}`);
const h = await hadith();
writeFileSync(join(OUT, 'hadith-full.json'), JSON.stringify(h));
console.log(`hadith-full.json: ${Object.keys(h).length} hadith`);
