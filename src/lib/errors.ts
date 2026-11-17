// What the app says when it breaks, and the rules for saying it: a short message, the top of the
// stack, nothing about the person, and only a few times. Pure and unit tested (errors.test.ts); the
// bot's server uses the same functions before it keeps a report (worker/src/errors.ts).

export type ErrorKind = 'render' | 'error' | 'promise';
export const ERROR_KINDS: readonly ErrorKind[] = ['render', 'error', 'promise'];

/** What one report carries. There is no field for who it happened to. */
export interface ErrorReport {
  /** render: a screen failed to draw; error: an uncaught error; promise: a rejection nobody handled. */
  kind: ErrorKind;
  message: string;
  stack: string;
  /** The screen it happened on: a route's name, a tab ("tab:home") or a sheet ("sheet:task"). */
  screen: string;
  /** Which build of the app (see vite.config.ts). */
  build: string;
  /** Telegram's name for the phone or computer ("ios", "android", "tdesktop"), or "browser". */
  platform: string;
  /** Telegram's version there. */
  tg: string;
  lang: string;
}

export const MESSAGE_MAX = 200;
export const STACK_LINES = 6;
export const STACK_LINE_MAX = 160;
export const STACK_MAX = 1200;
/** How many reports one start of the app may send. */
export const REPORTS_PER_START = 5;

export const BUILD_RE = /^[A-Za-z0-9._-]{1,32}$/;
export const SCREEN_RE = /^[A-Za-z0-9:_-]{0,32}$/;
export const PLATFORM_RE = /^[A-Za-z0-9._-]{0,24}$/;

const WHOLE = /\s+/g;
// An address: everything up to the path is dropped, and so is what follows a ? or a #, except the
// line and column a stack puts at the very end ("a.js?v=3:40:22" is "a.js:40:22").
const ADDRESS = /\b(?:blob:)?(?:https?|wss?|file):\/\/[^\s/'"`()<>]*([^\s'"`()<>?#]*)(?:[?#][^\s'"`()<>]*?)?((?::\d+){1,2})?(?=[\s'"`()<>]|$)/g;
const MAIL = /[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Text in quotes. A name from the code ('length', "assets/index-x.js") says what broke and stays;
// anything else could be something a person typed, and goes.
const QUOTED = /(["'`“«])([^"'`”»\n]{0,400})(["'`”»])/g;
const CODE_NAME = /^[A-Za-z_$#@/.][\w$#@/.:[\]-]{0,59}$/;
// A message about JSON quotes the text that could not be read, and that text is somebody's data:
// there nothing between the first quote and the last stays, not even a single word.
const ABOUT_JSON = /json/i;
const FIRST_TO_LAST_QUOTE = /["'`“«].*["'`”»]/;
// Long runs of digits (ids, times) and long hexadecimal strings (tokens, hashes).
const LONG_NUMBER = /\d{6,}/g;
const LONG_HEX = /\b[0-9a-f]{16,}\b/gi;

function shorten(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** Addresses become their paths: "https://host/assets/a.js?x=1" is "/assets/a.js". */
const unaddressed = (text: string): string => text.replace(ADDRESS, (_all, path: string, place?: string) => `${path || '<address>'}${place ?? ''}`);

/** A message also loses mail addresses, long numbers and long strings of hexadecimal. */
const plain = (text: string): string => unaddressed(text).replace(MAIL, '<mail>').replace(LONG_HEX, '#').replace(LONG_NUMBER, '#');

/**
 * An error's message as it is reported: on one line, without addresses' hosts and queries, without
 * quoted text that is not a name from the code, without long numbers, and at most 200 characters.
 */
export function tidyMessage(message: unknown): string {
  const text = plain((typeof message === 'string' ? message : String(message ?? '')).replace(WHOLE, ' ').trim());
  const quiet = ABOUT_JSON.test(text)
    ? text.replace(FIRST_TO_LAST_QUOTE, '"…"')
    : text.replace(QUOTED, (_all, open: string, inner: string, close: string) => `${open}${CODE_NAME.test(inner) ? inner : '…'}${close}`);
  return shorten(quiet, MESSAGE_MAX);
}

// A line of a stack names a place in the code: "at f (file.js:1:234)", "f@file.js:1:234", "file.js:1:234".
const PLACE = /:\d+:\d+\)?$/;

/**
 * The top of a stack: its first few lines that name a place in the code, each shortened. The line
 * some browsers put first (the message again) is left out, so the stack says where and never what.
 * The numbers stay as they are: a line and a column are what finds the place.
 */
export function tidyStack(stack: unknown): string {
  if (typeof stack !== 'string') return '';
  const lines: string[] = [];
  for (const raw of stack.split('\n')) {
    const line = unaddressed(raw.replace(WHOLE, ' ').trim());
    if (!line || !PLACE.test(line)) continue;
    lines.push(shorten(line, STACK_LINE_MAX));
    if (lines.length === STACK_LINES) break;
  }
  return shorten(lines.join('\n'), STACK_MAX);
}

// A piece of the app that could not be fetched: the connection, or a new version that replaced the files.
const NOT_FETCHED = /dynamically imported module|importing a module script failed|error loading dynamically imported|unable to preload|failed to fetch|load failed|networkerror|network error/i;

/** True for an error that means "could not be fetched", which is the network's doing and not a fault in the app. */
export const isLoadError = (message: unknown): boolean => NOT_FETCHED.test(String(message ?? ''));

/**
 * Whether an error is worth a report. Left out: errors with nothing in them ("Script error." is all a
 * browser tells about another site's script), a browser's own harmless complaint about resize
 * observers, cancelled work, and anything that is the network's doing.
 */
export function worthReporting(name: unknown, message: unknown): boolean {
  const what = String(message ?? '').trim();
  if (!what || /^script error\.?$/i.test(what)) return false;
  if (/resizeobserver loop/i.test(what)) return false;
  if (name === 'AbortError') return false;
  return !isLoadError(what);
}

/**
 * Decides which reports are sent during one start of the app: each different message once, and no
 * more than `max` in all. Call it with what makes a report the same as another (its message).
 */
export function reportGate(max: number = REPORTS_PER_START): (same: string) => boolean {
  const seen = new Set<string>();
  let sent = 0;
  return (same) => {
    if (seen.has(same)) return false;
    seen.add(same);
    if (sent >= max) return false;
    sent++;
    return true;
  };
}

/**
 * The key of the one row the server keeps for a build and a message: 16 hexadecimal characters that
 * are the same for the same pair and, for all practical purposes, different for different ones.
 */
export function errorKey(build: string, message: string): string {
  const text = `${build}\n${message}`;
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(b) + hex(a);
}

/** One error as the owner's panel lists it. */
export interface ErrorRow {
  key: string;
  kind: ErrorKind;
  message: string;
  stack: string;
  screen: string;
  platform: string;
  tg: string;
  lang: string;
  count: number;
  firstAt: number;
  lastAt: number;
}

/** The errors of one build. */
export interface ErrorBuild {
  build: string;
  /** How many times anything went wrong in it. */
  count: number;
  lastAt: number;
  errors: ErrorRow[];
}

export interface ErrorList {
  builds: ErrorBuild[];
  now: number;
}

/**
 * Rows as the database gives them (newest build first, then the latest seen first) gathered by
 * build, in the same order.
 */
export function byBuild(rows: (ErrorRow & { build: string })[]): ErrorBuild[] {
  const builds: ErrorBuild[] = [];
  for (const { build, ...row } of rows) {
    let group = builds[builds.length - 1];
    if (!group || group.build !== build) {
      group = { build, count: 0, lastAt: 0, errors: [] };
      builds.push(group);
    }
    group.errors.push(row);
    group.count += row.count;
    group.lastAt = Math.max(group.lastAt, row.lastAt);
  }
  return builds;
}


/** A report never carries arbitrary error text: an exception can contain a journal page or an input. */
export function reportMessage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.replace(/\s+/g, ' ').trim();
  const type = /^(TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError): /.exec(text)?.[1];
  const raw = type ? text.slice(type.length + 2) : text;
  const prefix = type ? `${type}: ` : '';
  const fixed = [
    'Invalid time value', 'Invalid array length', 'Maximum call stack size exceeded',
    'Rendered more hooks than during the previous render.', 'Rendered fewer hooks than expected.',
    'Unexpected end of JSON input', 'Cannot convert undefined or null to object',
    'Unexpected application error',
  ];
  if (fixed.includes(raw)) return prefix + raw;
  const read = /^Cannot read properties of (undefined|null)(?: \(reading ['"]([A-Za-z]+)['"]\))?$/.exec(raw);
  if (read) {
    const known = ['length', 'map', 'filter', 'reduce', 'find', 'some', 'includes', 'title', 'text', 'name', 'id', 'day', 'profile', 'settings'];
    return `${prefix}Cannot read properties of ${read[1]}${read[2] && known.includes(read[2]) ? ` (reading '${read[2]}')` : ''}`;
  }
  const react = /^Minified React error #(\d{1,4})(?:;|$)/.exec(raw);
  if (react) return `${prefix}Minified React error #${react[1]}`;
  if (/json/i.test(raw)) return `${prefix}Could not parse JSON`;
  return `${prefix}Unexpected application error`;
}

/** Keep only source locations from app files, without arbitrary function names or URL paths. */
export function reportStack(value: unknown): string {
  if (typeof value !== 'string') return '';
  const out: string[] = [];
  for (const line of value.split('\n')) {
    const loc = unaddressed(line).match(/(\/(?:assets\/[A-Za-z0-9_-]+\.js|src\/[A-Za-z0-9_./-]+\.[jt]sx?):\d+:\d+)\)?$/);
    if (loc) out.push(`at ${loc[1]}`);
    if (out.length === STACK_LINES) break;
  }
  return out.map(line => shorten(line, STACK_LINE_MAX)).join('\n');
}
