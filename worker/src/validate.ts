// Input validators. Each one returns the clean value or throws a 400 that names the field.
import { LANGS, type Lang } from './env';
import { badRequest } from './http';
import { canonicalTimeZone, parseDay } from './time';

/** A trimmed string of `min` to `max` characters. */
export function str(v: unknown, name: string, max: number, min = 1): string {
  if (typeof v !== 'string') throw badRequest(`${name}: string expected`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw badRequest(`${name}: ${min}-${max} characters expected`);
  return s;
}

export function match(v: unknown, name: string, pattern: RegExp): string {
  if (typeof v !== 'string' || !pattern.test(v)) throw badRequest(`${name}: must match ${pattern.source}`);
  return v;
}

export function int(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw badRequest(`${name}: integer ${min}-${max} expected`);
  }
  return v;
}

export function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw badRequest(`${name}: boolean expected`);
  return v;
}

export function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw badRequest(`${name}: object expected`);
  return v as Record<string, unknown>;
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw badRequest(`${name}: one of ${allowed.join(', ')} expected`);
  return v as T;
}

export const lang = (v: unknown): Lang => oneOf(v, 'lang', LANGS);

/** An IANA time zone, returned in its canonical spelling. */
export function timeZone(v: unknown): string {
  const tz = canonicalTimeZone(v);
  if (!tz) throw badRequest('tz: IANA time zone expected');
  return tz;
}

/** A real calendar day written as YYYY-MM-DD. */
export function day(v: unknown, name: string): string {
  if (!parseDay(v)) throw badRequest(`${name}: YYYY-MM-DD expected`);
  return v as string;
}
