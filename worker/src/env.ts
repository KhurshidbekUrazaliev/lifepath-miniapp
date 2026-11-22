/** Bindings, secrets and variables of the Worker (see wrangler.jsonc and .dev.vars.example). */
export interface Env {
  DB: D1Database;
  /** The built front end. */
  ASSETS?: Fetcher;
  /** Per-user limit for every /api call. */
  API_LIMIT?: RateLimit;
  /** Tighter per-user limit for invoice links. */
  INVOICE_LIMIT?: RateLimit;

  // Secrets
  BOT_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  SETUP_KEY?: string;

  /** Who owns the bot and may open the panel: Telegram ids and @usernames, separated by commas (see panel.ts). */
  ADMINS?: string;

  // Vars
  PLUS_STARS?: string;
  SUPPORT_CONTACT?: string;
  APP_URL?: string;
  TELEGRAM_API?: string;

  /** Cloudflare Workers AI: writes the Uzbek of the hadith of the day (daily.ts). */
  AI?: Ai;
  /** "0" leaves the AI out (the tests); the hadith of the day then has no Uzbek. */
  DAILY_AI?: string;
  /** Where the ayah and the hadith of the day come from; the tests point these at a stand-in. */
  QURAN_API?: string;
  HADITH_API?: string;

  /** "1" only in .dev.vars: turns on the `dev` auth scheme, and only on local hosts. */
  DEV_AUTH?: string;
}

export type Lang = 'en' | 'uz' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'uz', 'ru'];

export const DAY_MS = 86_400_000;

/** Deep-link parameter that a button may carry to the Mini App. */
export const OPEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A base URL without trailing slashes, or '' when the value is not an http(s) URL. */
export function baseUrl(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(trimmed)) return '';
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return '';
  }
}
