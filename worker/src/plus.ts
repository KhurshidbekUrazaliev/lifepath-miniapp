// LifePath Plus: the price, the invoice payload and who has it.
import type { Env } from './env';

/** The only subscription period Telegram accepts for Stars invoices: 30 days, in seconds. */
export const PLUS_PERIOD_S = 2_592_000;
export const PLUS_PERIOD_MS = PLUS_PERIOD_S * 1000;

/**
 * While a subscription renews by itself, Plus stays on for this long after the paid period ends,
 * so that it does not flicker off while the renewal payment is on its way.
 */
const RENEW_GRACE_MS = 60 * 60 * 1000;

export interface Entitlement {
  expires_at: number;
  /** active (renews by itself), canceled, failed, refunded or none (a one-time payment). */
  renew: string;
}

export interface PlusView {
  active: boolean;
  expiresAt: number | null;
  priceStars: number;
}

/** Price in Stars from PLUS_STARS. Telegram allows 1 to 10000 for a subscription. */
export function priceStars(env: Env): number {
  const n = Number(env.PLUS_STARS);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 150;
}

export function isPlusActive(ent: Entitlement | null | undefined, now: number): boolean {
  if (!ent) return false;
  return ent.expires_at + (ent.renew === 'active' ? RENEW_GRACE_MS : 0) > now;
}

export function plusView(ent: Entitlement | null | undefined, env: Env, now: number): PlusView {
  return { active: isPlusActive(ent, now), expiresAt: ent?.expires_at ?? null, priceStars: priceStars(env) };
}

/** The invoice payload names the user the subscription is for. */
export const payloadFor = (userId: number): string => `plus:${userId}`;

/** The user id inside one of our payloads, or null when the payload is not ours. */
export function payloadUser(payload: unknown): number | null {
  const m = typeof payload === 'string' ? /^plus:(\d{1,16})$/.exec(payload) : null;
  return m ? Number(m[1]) : null;
}
