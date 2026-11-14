// Three languages, picked from Telegram's language (or the Settings choice), falling back to English.
import { en } from './en';
import { uz } from './uz';
import { ru } from './ru';
import { LangSetting } from '../lib/types';

export type Lang = 'en' | 'uz' | 'ru';
export type Key = keyof typeof en;
type Dict = Record<string, string>; // translations may add plural forms English does not have (_few, _many)

const dicts: Record<Lang, Dict> = { en, uz, ru };
const LOCALES: Record<Lang, string> = { en: 'en-US', uz: 'uz-Latn-UZ', ru: 'ru-RU' };

let lang: Lang = 'en';
let plurals = new Intl.PluralRules('en');

export function resolveLang(setting: LangSetting, telegramLang?: string): Lang {
  if (setting !== 'auto') return setting;
  const code = (telegramLang ?? '').toLowerCase().slice(0, 2);
  return code === 'uz' || code === 'ru' ? code : 'en';
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    plurals = new Intl.PluralRules(next);
  } catch {
    plurals = new Intl.PluralRules('en');
  }
  document.documentElement.lang = next;
}

export const getLang = (): Lang => lang;
export const locale = (): string => LOCALES[lang];

type Vars = Record<string, string | number>;

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;

/** Translates a key, filling {placeholders}. Missing translations fall back to English. */
export function t(key: Key, vars?: Vars): string {
  return fill(dicts[lang][key] ?? en[key] ?? key, vars);
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
  return fill(dicts[lang][exact] ?? dicts[lang][other] ?? english[exact] ?? english[other] ?? key, all);
}
