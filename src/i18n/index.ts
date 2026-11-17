// Three languages, picked from Telegram's language (or the Settings choice), falling back to English.
// English comes with the first file the app fetches. Uzbek and Russian are each a file of their own,
// fetched when wanted (loadLang), so a phone downloads the language it shows and not all three.
import { en } from './en';
import { LangSetting } from '../lib/types';

export type Lang = 'en' | 'uz' | 'ru';
export type Key = keyof typeof en;
type Dict = Record<string, string>; // translations may add plural forms English does not have (_few, _many)

const LOCALES: Record<Lang, string> = { en: 'en-US', uz: 'uz-Latn-UZ', ru: 'ru-RU' };

const FILES: Record<Exclude<Lang, 'en'>, () => Promise<Dict>> = {
  uz: () => import('./uz').then((m) => m.uz),
  ru: () => import('./ru').then((m) => m.ru),
};

/** The texts that are here. */
const dicts: Partial<Record<Lang, Dict>> = { en };
const fetching: Partial<Record<Lang, Promise<void>>> = {};

let lang: Lang = 'en';
let dict: Dict = en;
let plurals = new Intl.PluralRules('en');

export function resolveLang(setting: LangSetting, telegramLang?: string): Lang {
  if (setting !== 'auto') return setting;
  const code = (telegramLang ?? '').toLowerCase().slice(0, 2);
  return code === 'uz' || code === 'ru' ? code : 'en';
}

/** Fetches a language's texts, once. It fails when they cannot be fetched, and asking again tries again. */
export function loadLang(next: Lang): Promise<void> {
  if (next === 'en' || dicts[next]) return Promise.resolve();
  const file = FILES[next];
  return (fetching[next] ??= file().then(
    (texts) => {
      dicts[next] = texts;
    },
    (e) => {
      delete fetching[next];
      throw e;
    },
  ));
}

/** True once a language's texts are here. */
export const hasLang = (which: Lang): boolean => !!dicts[which];

/**
 * Switches to a language whose texts are here (see loadLang). Asked for one that is not, it changes
 * nothing and says so, and the app goes on in the language it had.
 */
export function setLang(next: Lang): boolean {
  const texts = dicts[next];
  if (!texts) return false;
  lang = next;
  dict = texts;
  try {
    plurals = new Intl.PluralRules(next);
  } catch {
    plurals = new Intl.PluralRules('en');
  }
  document.documentElement.lang = next;
  return true;
}

export const getLang = (): Lang => lang;
export const locale = (): string => LOCALES[lang];

type Vars = Record<string, string | number>;

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;

/** Translates a key, filling {placeholders}. Missing translations fall back to English. */
export function t(key: Key, vars?: Vars): string {
  return fill(dict[key] ?? en[key] ?? key, vars);
}

/** Does this key exist (in English)? For keys built at run time, like "tpl.reading.name". */
export const has = (key: string): key is Key => key in en;

/** A translated string for a key built at run time, or the fallback when there is none. */
export function tk(key: string, fallback: string, vars?: Vars): string {
  return has(key) ? t(key, vars) : fill(fallback, vars);
}

/**
 * Plural form for a count: looks up "<key>_one", "<key>_few", "<key>_many" or "<key>_other"
 * following the language's rules, with {n} filled in.
 */
export function tn(key: string, n: number, vars?: Vars): string {
  const form = plurals.select(n);
  const all = { n, ...vars };
  const exact = `${key}_${form}`;
  const other = `${key}_other`;
  const english = en as Record<string, string>;
  return fill(dict[exact] ?? dict[other] ?? english[exact] ?? english[other] ?? key, all);
}
