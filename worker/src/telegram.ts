// The small part of the Telegram Bot API this Worker uses.
import type { Env } from './env';

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: string;
}

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  /** Unix seconds; present for subscription payments. */
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  telegram_payment_charge_id: string;
}

export interface RefundedPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

export interface TgMessage {
  from?: TgUser;
  chat: TgChat;
  text?: string;
  successful_payment?: SuccessfulPayment;
  refunded_payment?: RefundedPayment;
}

export interface PreCheckoutQuery {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface ChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  new_chat_member?: { status?: string };
}

/** Bot API 10.2: a user's payment subscription changed. */
export interface SubscriptionUpdated {
  user: TgUser;
  invoice_payload: string;
  /** "canceled", "active" (re-enabled) or "failed". */
  state: string;
}

export interface Update {
  update_id: number;
  message?: TgMessage;
  pre_checkout_query?: PreCheckoutQuery;
  my_chat_member?: ChatMemberUpdated;
  subscription?: SubscriptionUpdated;
}

/** The update types handled in webhook.ts; setWebhook asks Telegram for only these. */
export const ALLOWED_UPDATES = ['message', 'pre_checkout_query', 'my_chat_member', 'subscription'];

export interface TgResult<T> {
  ok: boolean;
  /** Telegram's error_code or the HTTP status; 0 when there was no answer at all. */
  status: number;
  result?: T;
  description?: string;
  /** Seconds to wait, sent with a 429. */
  retryAfter?: number;
}

interface TgEnvelope<T> {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Calls a Bot API method with JSON parameters, or with a multipart form when it uploads a file.
 * Never throws, and never logs: the URL holds the bot token.
 */
export async function tg<T = unknown>(
  env: Env,
  method: string,
  params: Record<string, unknown> | FormData = {},
  timeoutMs = 8000,
): Promise<TgResult<T>> {
  const base = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/+$/, '');
  const form = params instanceof FormData;
  try {
    const res = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      // A form sets its own multipart content type, boundary included.
      headers: form ? undefined : { 'content-type': 'application/json' },
      body: form ? params : JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json().catch(() => null)) as TgEnvelope<T> | null;
    const ok = res.ok && body?.ok === true;
    return {
      ok,
      status: ok ? 200 : (body?.error_code ?? (res.ok ? 502 : res.status)),
      result: body?.result,
      description: body?.description,
      retryAfter: body?.parameters?.retry_after,
    };
  } catch {
    return { ok: false, status: 0, description: 'no answer from Telegram' };
  }
}

/** An inline keyboard with one button that opens the Mini App, optionally at a deep link (?open=...). */
export function openButton(label: string, appUrl: string, open?: string | null): object | undefined {
  if (!appUrl) return undefined;
  let url = appUrl;
  if (open) {
    const u = new URL(appUrl);
    u.searchParams.set('open', open);
    url = u.toString();
  }
  return { inline_keyboard: [[{ text: label, web_app: { url } }]] };
}
