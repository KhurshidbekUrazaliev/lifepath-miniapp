// The ayah of the day: short ayat that stand on their own (the IlmulHaq bot's list plus a few on
// effort), one passage a day in turn. Ayat that only make sense together are shown as one passage.
import quran from '../content/quran.json';
import type { Lang } from '../i18n';

export interface Ayah {
  k: string; // "2:255"
  ar: string; // Uthmani script, from quran.com
  en: string;
  ru: string;
  uz: string;
  page: number; // in the standard 604-page mushaf
}

export interface Passage {
  key: string; // "94:5-6", or "2:255" for a single ayah
  surah: number;
  from: number;
  to: number;
  ayat: Ayah[];
}

/** Ayat shown together: a duʼa in two halves, a pair, a whole short surah. */
const JOINED = ['20:25-26', '94:5-6', '94:7-8', '103:1-3'];

/** The translation shown for each language (the same ones the IlmulHaq bot quotes). */
export const TRANSLATOR: Record<Lang, string> = {
  en: 'Sahih International',
  ru: 'Абу Адель',
  uz: 'Muhammad Sodiq Muhammad Yusuf',
};

function build(list: Ayah[]): Passage[] {
  const byKey = new Map(list.map((a) => [a.k, a]));
  const ranges = JOINED.map((g) => {
    const [surah, span] = g.split(':');
    const [from, to] = span.split('-').map(Number);
    return { surah: Number(surah), from, to };
  });
  const out: Passage[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    const [surah, n] = a.k.split(':').map(Number);
    const r = ranges.find((x) => x.surah === surah && n >= x.from && n <= x.to);
    const from = r?.from ?? n;
    const to = r?.to ?? n;
    const key = to > from ? `${surah}:${from}-${to}` : `${surah}:${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ayat: Ayah[] = [];
    for (let i = from; i <= to; i++) {
      const x = byKey.get(`${surah}:${i}`);
      if (x) ayat.push(x);
    }
    out.push({ key, surah, from, to, ayat });
  }
  return out;
}

export const PASSAGES: Passage[] = build(quran.ayat as Ayah[]);

/** Days since 1970 for a "YYYY-MM-DD" day (the same count as the advisor's rotation). */
export function dayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Every passage once before any repeats, in a mixed order so neighbours in the list are not neighbours in time. */
export function passageOfDay(day: string): Passage {
  const n = PASSAGES.length;
  const step = [7, 11, 13, 17, 19].find((s) => n % s !== 0) ?? 1;
  return PASSAGES[(((dayIndex(day) * step) % n) + n) % n];
}

export const passageByKey = (key: string): Passage | undefined => PASSAGES.find((p) => p.key === key);

export const surahName = (n: number): string => quran.surahs[n - 1]?.name ?? String(n);

/** "Ash-Sharh 94:5–6", as the bot writes it in every language. */
export function passageRef(p: Passage): string {
  return `${surahName(p.surah)} ${p.surah}:${p.from}${p.to > p.from ? `–${p.to}` : ''}`;
}

export function passageLink(p: Passage): string {
  return `https://quran.com/${p.surah}/${p.from}${p.to > p.from ? `-${p.to}` : ''}`;
}

// The translators' explanatory notes: Sahih International's "[i.e., …]", Abu Adel's "[…]" commentary
// (sometimes nested) and the story he sometimes adds in round brackets after the ayah's own words.
// Other brackets hold words the sentence needs, so they stay.
const NOTES: Record<Lang, ((s: string) => string) | null> = {
  en: (s) => s.replace(/\s*\[i\.e\.,[^\]]*\]/g, ''),
  ru: (s) => {
    let out = s;
    for (let prev = ''; prev !== out; ) {
      prev = out;
      out = out.replace(/\s*\[[^[\]]*\]/g, '');
    }
    return out.replace(/([.!?»])\s+\([^()]*\)$/, '$1');
  },
  uz: null,
};

/**
 * The translation of each ayah of a passage, tidied for showing on its own: the passage ends a
 * sentence (an ayah that runs on into the next one ends with a comma) and its quotation marks
 * are paired. `brief` also leaves out the translators' explanatory notes.
 */
export function translationParts(p: Passage, lang: Lang, brief = false): { n: number; text: string }[] {
  const notes = NOTES[lang];
  const parts = p.ayat.map((a) => {
    let text = a[lang].trim();
    if (brief && notes) text = notes(text).replace(/\s+([,.;:!?])/g, '$1');
    return { n: Number(a.k.split(':')[1]), text };
  });
  // An ayah that continues the previous one starts in lower case.
  parts[0].text = parts[0].text.replace(/^([("«[]*)(\p{Ll})/u, (_, pre: string, ch: string) => pre + ch.toUpperCase());
  const last = parts[parts.length - 1];
  last.text = last.text.replace(/[\s,;:–—-]+$/, '');
  if (!/[.!?…»"”'’]\)?$/.test(last.text)) last.text += '.';

  const all = parts.map((x) => x.text).join(' ');
  const count = (re: RegExp) => (all.match(re) ?? []).length;
  if (lang === 'en') {
    if (count(/"/g) % 2) {
      if (parts[0].text.startsWith('"')) parts[0].text = parts[0].text.slice(1);
      else if (last.text.endsWith('"')) last.text = last.text.slice(0, -1);
      else last.text += '"';
    }
  } else if (count(/«/g) > count(/»/g)) {
    last.text = last.text.endsWith('.') ? `${last.text.slice(0, -1)}».` : `${last.text}»`;
  } else if (count(/»/g) > count(/«/g)) {
    // The speech began in an earlier ayah: open it where this passage starts.
    parts[0].text = `«${parts[0].text}`;
  }
  return parts;
}

/** The end-of-ayah sign with its number in Arabic-Indic digits; Quran fonts draw the number inside the sign. */
export function ayahEnd(n: number): string {
  return `۝${String(n).replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)))}`;
}
