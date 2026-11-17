// Tells the bot's server when the app breaks, so that a release which fails on some phones is noticed.
// A report says what failed and where in the code, on which screen, in which build and on what kind
// of phone. It says nothing about the person: no name, no id, nothing they typed (lib/errors.ts cuts
// the message down before it leaves). Nothing here may ever throw: an error about an error helps nobody.
import { BUILD } from '../lib/build';
import { STACK_LINES, reportGate, reportMessage, reportStack, worthReporting, type ErrorKind, type ErrorReport } from '../lib/errors';
import { getLang } from '../i18n';
import { platform } from '../tg/telegram';
import { useNav } from './nav';
import { ApiError, api } from './server';

const gate = reportGate();

/** ?demo=1 shows made-up data to whoever opens the link: what breaks there is not a user's trouble. */
const demo = ((): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
})();

/** Telegram's own version, as the phone reports it ("8.0"). */
function telegramVersion(): string {
  try {
    const version = window.Telegram?.WebApp?.version;
    return typeof version === 'string' ? version.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24) : '';
  } catch {
    return '';
  }
}

/** Where the user is: the sheet that is open, else the screen on top, else the tab. */
export function whereNow(): string {
  try {
    const nav = useNav.getState();
    if (nav.sheet) return `sheet:${nav.sheet.name}`;
    const top = nav.stack[nav.stack.length - 1];
    return top ? top.name : `tab:${nav.tab}`;
  } catch {
    return '';
  }
}

const lines = (stack: string, most: number): string[] => (stack ? stack.split('\n').slice(0, most) : []);

/**
 * Reports one error. `where` is the screen it belongs to (the place the user is, when left out) and
 * `drawn` the stack of components React gives for a screen that failed to draw.
 */
export function reportError(kind: ErrorKind, error: unknown, where?: string, drawn?: string | null): void {
  try {
    if (demo) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // What the server answered, or that it could not be reached, is not a fault in the app.
    if (error instanceof ApiError) return;

    const thrown = (typeof error === 'object' && error !== null ? error : {}) as { name?: unknown; message?: unknown; stack?: unknown };
    const said = typeof error === 'object' && error !== null ? thrown.message : error;
    if (!worthReporting(thrown.name, said)) return;
    const name = typeof thrown.name === 'string' && thrown.name && thrown.name !== 'Error' ? `${thrown.name}: ` : '';
    const message = reportMessage(`${name}${typeof said === 'string' ? said : String(said)}`);
    if (!message || !gate(message)) return;

    // Where it was thrown, then (for a screen that failed to draw) which components were being drawn.
    const thrownAt = reportStack(thrown.stack);
    const drawnAt = reportStack(drawn);
    const stack = drawnAt ? [...lines(thrownAt, STACK_LINES / 2), ...lines(drawnAt, STACK_LINES / 2)].join('\n') : thrownAt;

    const report: ErrorReport = {
      kind,
      message,
      stack,
      screen: (where ?? whereNow()).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 32),
      build: BUILD,
      platform: platform.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24),
      tg: telegramVersion(),
      lang: getLang(),
    };
    // Sent even if the app is closed or reloaded the next moment, which is what a broken app invites.
    void api<{ ok: boolean }>('POST', '/errors', report, true).catch(() => {
      // not sent: outside Telegram, or the server cannot be reached
    });
  } catch {
    // never the thing that breaks
  }
}

let installed = false;

/** Call once at start: from then on, errors nothing caught and promises nobody handled are reported. */
export function watchForErrors(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    // Without the error itself there is still what the browser says about it: the message and the place.
    const place = event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : '';
    reportError('error', event.error ?? { name: '', message: event.message, stack: place });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError('promise', event.reason);
  });
}
