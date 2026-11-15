// What the companion says when asked for advice. Pure: the day and the moment decide the order,
// so every day opens with a different quote and each tap moves on to the next one.
import { HADITHS, Hadith, HadithTag, HADITH_BOOK, hadithLink } from '../content/hadith';
import { HIKMAH, MOTIVATION } from '../content/wisdom';

export type AdviceKind = 'hadith' | 'hikmah' | 'motivation';
export type AdviceLang = 'en' | 'uz' | 'ru';

export interface Advice {
  kind: AdviceKind;
  key: string; // stable id, e.g. "hadith:6464"
  text: string;
  ar?: string; // Arabic original (proverbs)
  source?: string; // "Sahih al-Bukhari 6464"
  from?: 'ar' | 'uz' | 'common'; // where a proverb comes from
  link?: string;
  ai?: boolean; // the text is an AI translation
}

export interface AdviceContext {
  lang: AdviceLang;
  hour: number; // 0-23, local
  weekday: number; // 0 = Sunday ... 5 = Friday
  ramadan: boolean;
}

/** Topics that suit the moment: fasting in Ramadan, the night prayer before dawn, dhikr on Friday... */
export function momentTags(ctx: Pick<AdviceContext, 'hour' | 'weekday' | 'ramadan'>): HadithTag[] {
  if (ctx.ramadan) return ['ramadan'];
  if (ctx.hour < 5) return ['night'];
  if (ctx.weekday === 5) return ['dhikr', 'quran'];
  if (ctx.hour < 11) return ['habit', 'work', 'time', 'intention'];
  if (ctx.hour >= 21) return ['dhikr', 'night'];
  return [];
}

/** Rotates a list so that `day` decides where it starts. */
function rotate<T>(list: T[], day: number): T[] {
  if (list.length === 0) return list;
  const k = ((day % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

export function hadithOrder(ctx: AdviceContext, day: number): Hadith[] {
  const tags = momentTags(ctx);
  const fits = (h: Hadith) => h.tags.some((t) => tags.includes(t));
  return [...rotate(HADITHS.filter(fits), day), ...rotate(HADITHS.filter((h) => !fits(h)), day * 7)];
}

export function hadithAdvice(h: Hadith, lang: AdviceLang): Advice {
  return {
    kind: 'hadith',
    key: `hadith:${h.n}`,
    text: h[lang],
    source: `${HADITH_BOOK[lang]} ${h.n}`,
    link: hadithLink(h.n),
    ai: lang === 'uz',
  };
}

/** The n-th piece of advice of a kind for this day (n counts the taps). */
export function pickAdvice(kind: AdviceKind, ctx: AdviceContext, day: number, n: number): Advice {
  if (kind === 'hadith') {
    const order = hadithOrder(ctx, day);
    return hadithAdvice(order[n % order.length], ctx.lang);
  }
  if (kind === 'hikmah') {
    const order = rotate(HIKMAH, day * 3);
    const h = order[n % order.length];
    return { kind, key: `hikmah:${h.id}`, text: h[ctx.lang], ar: h.ar, from: h.from };
  }
  const order = rotate(MOTIVATION, day * 5);
  const i = n % order.length;
  return { kind, key: `motivation:${(day * 5 + i) % MOTIVATION.length}`, text: order[i][ctx.lang] };
}

/** Days since 1970 in local time, the seed for the daily rotation. */
export function dayNumber(d: Date = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}
