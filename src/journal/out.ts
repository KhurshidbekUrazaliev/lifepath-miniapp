// What the person takes out of the journal with their own hands: all of it as plain text, a year of it
// as a picture, and the backup of everything, which has the journal in it. All of it is made here on the
// phone and leaves only through the phone's own clipboard and share sheet. Nothing in this file talks to
// LifePath's server, and nothing in it may: the journal never goes there (the app says so in "j.private").
import { useState } from 'react';
import { useStore } from '../store/store';
import { exportJson } from '../store/sync';
import { FEEL, JournalWords, YearView, journalText } from '../lib/journal';
import { Feeling } from '../lib/types';
import { dayKeyToMs } from '../lib/calendar';
import { Key, locale, t } from '../i18n';
import { fmtLongDate } from '../i18n/format';
import { haptic } from '../tg/telegram';
import { useLock } from './lock';

// ---------- the journal as text ----------

/** A day written out, weekday and year included: "Saturday, November 14, 2026". */
function wholeDate(day: string): string {
  const ms = dayKeyToMs(day, 12);
  try {
    const text = new Intl.DateTimeFormat(locale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(ms);
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return fmtLongDate(ms);
  }
}

function journalWords(): JournalWords {
  const feeling = (feel: Feeling): string => t(`feel.${FEEL[feel].name}` as Key);
  return {
    title: t('jtext.title'),
    diary: t('j.tab.diary'),
    notes: t('j.tab.notes'),
    note: t('p.note'),
    feelings: { 1: feeling(1), 2: feeling(2), 3: feeling(3), 4: feeling(4), 5: feeling(5) },
    date: wholeDate,
  };
}

/**
 * With the journal's lock on, its check comes before anything that holds the journal's words is handed
 * out. 'unlocked' says the check was just run and passed: the phone may then want a fresh tap before
 * it lets a page touch the clipboard or the share sheet.
 */
export async function journalOpen(): Promise<'open' | 'unlocked' | 'refused'> {
  const lock = useLock.getState();
  if (!lock.on || lock.passed) return 'open';
  return (await lock.unlock(t('lock.reason'))) ? 'unlocked' : 'refused';
}

/** True where the phone has a share sheet the page can call. */
export const canShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const cancelled = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'AbortError';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Through the share sheet: as a text file where the phone shares files, as text where it does not. */
async function share(text: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const file = typeof File === 'function' ? new File([text], 'lifepath-journal.txt', { type: 'text/plain' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t('jtext.title') });
    else await navigator.share({ text, title: t('jtext.title') });
    return 'shared';
  } catch (e) {
    return cancelled(e) ? 'cancelled' : 'failed';
  }
}

/**
 * Copying the journal as text, or sharing it, for the row in Settings and the line in Looking back.
 * `say` is told how it went, in words, and whether that is good news.
 */
export function useJournalOut(say: (text: string, ok: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (how: 'copy' | 'share') => {
    if (busy) return;
    setBusy(true);
    try {
      const door = await journalOpen();
      if (door === 'refused') return say(t('lock.failed'), false);
      const text = journalText(useStore.getState().pages, journalWords());
      if (!text) return say(t('jtext.none'), false);
      const shared = how === 'share' ? await share(text) : 'failed';
      if (shared === 'shared' || shared === 'cancelled') return say('', true);
      // Copying is what always works: it is also what is left when the share sheet would not open.
      const copied = await copy(text);
      if (copied) haptic('success');
      say(t(copied ? 'jtext.done' : door === 'unlocked' ? 'lock.again' : 'jtext.failed'), copied || door === 'unlocked');
    } finally {
      setBusy(false);
    }
  };
  return { canShare: canShare(), copy: () => void run('copy'), share: () => void run('share') };
}

/**
 * Copies a backup of everything, for Settings and for the moment before a restore. The journal is in
 * it, so the journal's lock is asked first. Gives back what to say, and whether that is good news.
 */
export async function copyBackup(): Promise<{ text: string; ok: boolean }> {
  const door = await journalOpen();
  if (door === 'refused') return { text: t('lock.failed'), ok: false };
  const copied = await copy(exportJson());
  if (copied) haptic('success');
  return { text: t(copied ? 'data.export.done' : door === 'unlocked' ? 'lock.again' : 'data.export.failed'), ok: copied || door === 'unlocked' };
}

// ---------- a year as a picture ----------

const FONT = '"Manrope Variable", Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const W = 1080;
const H = 1880;
/** Where the grid sits: its left edge, the top of its first row, a column's width and a row's height. */
const GRID = { left: 120, top: 330, col: 70, row: 44, dot: 17 };

/** The first letter of each month in the app's language. */
export function monthInitials(): string[] {
  return Array.from({ length: 12 }, (_, m) => {
    const date = new Date(2026, m, 1);
    try {
      return new Intl.DateTimeFormat(locale(), { month: 'narrow' }).format(date).toUpperCase();
    } catch {
      return String(m + 1);
    }
  });
}

/**
 * Draws a year's grid as a PNG: the title, the months' initials, a dot for each day in the colour of its
 * feeling, and the app's name small. Nothing else is on it, and it is not sent anywhere.
 */
export async function drawYear(view: YearView, title: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  await Promise.all([document.fonts?.load(`800 72px ${FONT}`), document.fonts?.load(`700 30px ${FONT}`)]).catch(() => undefined);

  // The same night blue as the app's logo, so the picture looks one way in both themes.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#232E73');
  bg.addColorStop(0.55, '#141B4A');
  bg.addColorStop(1, '#0B1026');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText(title, W / 2, 176, W - 160);

  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  monthInitials().forEach((letter, m) => ctx.fillText(letter, GRID.left + GRID.col * (m + 0.5), GRID.top - 24));

  view.months.forEach((month, m) => {
    month.forEach((dot, i) => {
      if (dot === null || dot === 'later') return;
      ctx.beginPath();
      ctx.arc(GRID.left + GRID.col * (m + 0.5), GRID.top + GRID.row * (i + 0.5), dot === 'blank' ? GRID.dot - 1.5 : GRID.dot, 0, Math.PI * 2);
      if (dot === 'blank') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.fillStyle = dot === 'plain' ? 'rgba(255, 255, 255, 0.42)' : FEEL[dot].color;
        ctx.fill();
      }
    });
  });

  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('LifePath', W / 2, H - 84);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png'));
}

/**
 * Hands a picture to the phone's own share sheet. 'unavailable' where the phone has none that takes a
 * file: the picture is then shown full-screen instead, to be pressed and held.
 */
export async function sharePicture(blob: Blob, name: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (!canShare() || !navigator.canShare?.({ files: [file] })) return 'unavailable';
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (e) {
    return cancelled(e) ? 'cancelled' : 'unavailable';
  }
}
