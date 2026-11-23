// POST /tg/webhook: updates from Telegram (commands, payments, blocks).
import { baseUrl, DAY_MS, LANGS, OPEN_RE, type Env, type Lang } from './env';
import { describe, json, safeEqual } from './http';
import { formatDate, pickLang, TEXT } from './i18n';
import { payloadUser, PLUS_PERIOD_MS, type Entitlement } from './plus';
import {
  openButton,
  tg,
  type ChatMemberUpdated,
  type PreCheckoutQuery,
  type RefundedPayment,
  type SubscriptionUpdated,
  type SuccessfulPayment,
  type TgMessage,
  type TgUser,
  type Update,
} from './telegram';
import { canonicalTimeZone, localParts } from './time';
import { blockedStatement, chatUserStatement, rows } from './users';
import { appLogin } from './app';

/**
 * Someone whose subscription already renews by itself, with more than this left, is not charged
 * for a second one. Close to the end of a period a payment is always let through.
 */
const DOUBLE_PAY_GUARD_MS = 3 * DAY_MS;

// A payment is stored once. A repeated delivery changes nothing; a later delivery for the same
// charge with a later subscription end extends it.
const RECORD_PAYMENT = `
  INSERT INTO payments (charge_id, user_id, amount, currency, payload, recurring, sub_expires_at, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  ON CONFLICT (charge_id) DO UPDATE SET sub_expires_at = excluded.sub_expires_at
  WHERE payments.status = 'paid' AND excluded.sub_expires_at > COALESCE(payments.sub_expires_at, 0)`;

// Plus runs until the subscription end Telegram reports, or 30 days from a one-time payment.
// It only ever moves forward, so replaying an old payment cannot change it.
const GRANT_PLUS = `
  INSERT INTO entitlements (user_id, expires_at, renew, charge_id, updated_at)
  SELECT user_id, COALESCE(sub_expires_at, created_at + ?4), ?2, charge_id, ?3
  FROM payments WHERE charge_id = ?1 AND status = 'paid'
  ON CONFLICT (user_id) DO UPDATE SET
    expires_at = excluded.expires_at, renew = excluded.renew,
    charge_id = excluded.charge_id, updated_at = excluded.updated_at
  WHERE excluded.expires_at > entitlements.expires_at`;

const RECORD_REFUND = `
  INSERT INTO payments (charge_id, user_id, amount, currency, payload, status, created_at, refunded_at)
  VALUES (?1, ?2, ?3, ?4, ?5, 'refunded', ?6, ?6)
  ON CONFLICT (charge_id) DO UPDATE SET status = 'refunded', refunded_at = excluded.refunded_at
  WHERE payments.status = 'paid'`;

const END_PLUS = `
  UPDATE entitlements SET expires_at = MIN(expires_at, ?2), renew = 'refunded', updated_at = ?2
  WHERE user_id = (SELECT user_id FROM payments WHERE charge_id = ?1) AND (expires_at > ?2 OR renew = 'active')`;

/** Payments must not be lost to a database hiccup: try a few times before giving up. */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (attempt >= attempts) throw e;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

async function send(env: Env, chatId: number, text: string, replyMarkup?: object): Promise<void> {
  const res = await tg(env, 'sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
  if (!res.ok) console.error(`webhook: sendMessage failed (${res.status}): ${res.description ?? ''}`);
}

/** Telegram asks for the final go-ahead before charging. It must be answered within 10 seconds. */
async function preCheckout(query: PreCheckoutQuery, env: Env, now: number): Promise<void> {
  const t = TEXT[pickLang(query.from?.language_code)];
  let refusal: string | null = null;
  if (query.currency !== 'XTR' || payloadUser(query.invoice_payload) !== query.from?.id) {
    refusal = t.invoiceInvalid; // not our invoice, or one made for someone else
  } else {
    try {
      const ent = await env.DB.prepare('SELECT expires_at, renew FROM entitlements WHERE user_id = ?1')
        .bind(query.from.id)
        .first<Entitlement>();
      if (ent?.renew === 'active' && ent.expires_at - now > DOUBLE_PAY_GUARD_MS) refusal = t.alreadyPlus;
    } catch (e) {
      console.error('webhook: entitlement check failed, payment allowed:', describe(e));
    }
  }
  const res = await tg(
    env,
    'answerPreCheckoutQuery',
    refusal
      ? { pre_checkout_query_id: query.id, ok: false, error_message: refusal }
      : { pre_checkout_query_id: query.id, ok: true },
  );
  if (!res.ok) console.error(`webhook: answerPreCheckoutQuery failed (${res.status}): ${res.description ?? ''}`);
}

async function paid(message: TgMessage, payment: SuccessfulPayment, env: Env, now: number): Promise<void> {
  const charge = payment.telegram_payment_charge_id;
  if (payment.currency !== 'XTR' || payloadUser(payment.invoice_payload) === null || typeof charge !== 'string' || !charge) {
    console.error('webhook: payment with an unknown payload ignored');
    return;
  }
  const payer = message.from && !message.from.is_bot ? message.from : null;
  const userId = payer?.id ?? message.chat.id;
  const subscriptionEnds =
    typeof payment.subscription_expiration_date === 'number' ? payment.subscription_expiration_date * 1000 : null;

  const db = env.DB;
  let results: D1Result[];
  try {
    // One atomic batch, safe to repeat.
    results = await withRetry(() =>
      db.batch([
        db
          .prepare(RECORD_PAYMENT)
          .bind(charge, userId, payment.total_amount, payment.currency, payment.invoice_payload, payment.is_recurring ? 1 : 0, subscriptionEnds, now),
        db.prepare(GRANT_PLUS).bind(charge, subscriptionEnds === null ? 'none' : 'active', now, PLUS_PERIOD_MS),
        db
          .prepare('SELECT e.expires_at, u.lang, u.tz FROM entitlements e LEFT JOIN users u ON u.id = e.user_id WHERE e.user_id = ?1')
          .bind(userId),
      ]),
    );
  } catch (e) {
    console.error(`webhook: PAYMENT NOT RECORDED (user ${userId}, charge ${charge}):`, describe(e));
    return;
  }
  if (results[0]?.meta.changes !== 1) return; // this payment was already recorded

  const row = rows<{ expires_at: number; lang: string | null; tz: string | null }>(results[2])[0];
  if (!row) return;
  const lang: Lang = LANGS.find((l) => l === row.lang) ?? pickLang(payer?.language_code);
  const date = formatDate(lang, localParts(canonicalTimeZone(row.tz) ?? 'UTC', row.expires_at));
  await send(env, message.chat.id, TEXT[lang].thanks(date));
}

/** A refund (issued with refundStarPayment) ends Plus at once. */
async function refunded(message: TgMessage, refund: RefundedPayment, env: Env, now: number): Promise<void> {
  if (payloadUser(refund.invoice_payload) === null || !refund.telegram_payment_charge_id) return;
  const db = env.DB;
  await withRetry(() =>
    db.batch([
      db
        .prepare(RECORD_REFUND)
        .bind(refund.telegram_payment_charge_id, message.chat.id, refund.total_amount, refund.currency, refund.invoice_payload, now),
      db.prepare(END_PLUS).bind(refund.telegram_payment_charge_id, now),
    ]),
  );
}

/** Bot API 10.2: the user canceled or re-enabled the subscription, or a renewal payment failed. */
async function subscriptionChanged(change: SubscriptionUpdated, env: Env, now: number): Promise<void> {
  if (payloadUser(change.invoice_payload) === null || !change.user) return;
  if (!['active', 'canceled', 'failed'].includes(change.state)) return;
  // The paid period itself does not change; only whether Plus is expected to renew.
  await env.DB.prepare(
    "UPDATE entitlements SET renew = ?2, updated_at = ?3 WHERE user_id = ?1 AND renew IN ('active', 'canceled', 'failed')",
  )
    .bind(change.user.id, change.state, now)
    .run();
}

/** In a private chat this update means the user blocked ("kicked") or unblocked ("member") the bot. */
async function chatMemberChanged(change: ChatMemberUpdated, env: Env, now: number): Promise<void> {
  if (change.chat?.type !== 'private' || !change.from) return;
  const status = change.new_chat_member?.status;
  if (status === 'kicked') await blockedStatement(env.DB, change.chat.id, now).run();
  else if (status === 'member') await chatUserStatement(env.DB, change.from, now).run();
}

async function textMessage(message: TgMessage, from: TgUser, env: Env, appUrl: string, now: number): Promise<void> {
  const t = TEXT[pickLang(from.language_code)];
  const [word = '', argument = ''] = (message.text ?? '').trim().split(/\s+/);
  const command = word.toLowerCase().replace(/@.*$/, ''); // "/start@SomeBot" is the same command

  // Anything that is not a known command gets the help text.
  let text = t.help;
  let button = openButton(t.open, appUrl);
  if (command === '/start' && argument.startsWith('login_')) {
    // Signing in to the Android app (app.ts). The user must be saved first: the session points at them.
    await chatUserStatement(env.DB, from, now).run();
    const ok = await appLogin(env, argument.slice(6), from, now);
    await send(env, message.chat.id, ok ? t.appSignedIn : t.appLoginExpired);
    return;
  }
  if (command === '/start') {
    text = t.start((from.first_name ?? '').slice(0, 64));
    button = openButton(t.open, appUrl, OPEN_RE.test(argument) ? argument : null);
  } else if (command === '/paysupport') {
    text = t.paysupport((env.SUPPORT_CONTACT ?? '').trim().slice(0, 200));
    button = undefined;
  } else if (command === '/terms') {
    text = t.terms;
    button = undefined;
  }

  // Remember the user while the reply is on its way. A database error must not cost them the answer.
  const saved = chatUserStatement(env.DB, from, now)
    .run()
    .catch((e: unknown) => console.error('webhook: user not saved:', describe(e)));
  await send(env, message.chat.id, text, button);
  await saved;
}

async function handleUpdate(update: Update, env: Env, appUrl: string, now: number): Promise<void> {
  if (update.pre_checkout_query) return preCheckout(update.pre_checkout_query, env, now);
  if (update.subscription) return subscriptionChanged(update.subscription, env, now);
  if (update.my_chat_member) return chatMemberChanged(update.my_chat_member, env, now);

  const message = update.message;
  if (!message || message.chat?.type !== 'private') return;
  if (message.successful_payment) return paid(message, message.successful_payment, env, now);
  if (message.refunded_payment) return refunded(message, message.refunded_payment, env, now);

  const from = message.from;
  if (!from || from.is_bot) return;
  if (typeof message.text === 'string') return textMessage(message, from, env, appUrl, now);
  // Any other message in the private chat still shows that the bot may write to this user.
  await chatUserStatement(env.DB, from, now).run();
}

export async function handleWebhook(request: Request, env: Env, url: URL): Promise<Response> {
  const secret = env.WEBHOOK_SECRET ?? '';
  const given = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!secret || !safeEqual(given, secret)) return json({ error: 'forbidden' }, 403);

  // Telegram repeats an update until it gets a 2xx, so a failing update is logged and still acknowledged.
  try {
    const update = (await request.json()) as Update;
    await handleUpdate(update, env, baseUrl(env.APP_URL) || url.origin, Date.now());
  } catch (e) {
    console.error('webhook: update failed:', describe(e));
  }
  return json({ ok: true });
}
