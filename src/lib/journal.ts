// The journal's rules (pure): diary entries and notes, feelings, the streak of days written, the day's
// question, what a page shows in a list, lists inside a page, tags, search, looking back, a year in
// colours, and the whole journal as plain text.
import { Checks, Feeling, Page, Profile } from './types';
import type { Data } from './stats';
import { xpOnDay } from './stats';
import { dayKey, daysBetween } from './dates';
import { dayTally, shiftDay } from './habits';
import { prayedOn } from './prayer';

/** From great to hard, the order the faces are shown in. */
export const FEELINGS: readonly Feeling[] = [5, 4, 3, 2, 1];

/** Each feeling's name (for i18n keys "feel.<name>") and its colour, with a lighter one for the highlight. */
export const FEEL: Record<Feeling, { name: string; color: string; light: string }> = {
  5: { name: 'great', color: '#3ddc97', light: '#b4f6d7' },
  4: { name: 'good', color: '#45d4f7', light: '#bdf0fd' },
  3: { name: 'okay', color: '#a596ff', light: '#ddd7ff' },
  2: { name: 'low', color: '#ffb45e', light: '#ffe0b6' },
  1: { name: 'hard', color: '#ff86ae', light: '#ffcbdc' },
};

/** The colours a note can have; a page stores the index. */
export const NOTE_COLORS = ['#ffcf5c', '#5b93ff', '#9b8cff', '#3dd6f5', '#ff6fa8', '#34d399'] as const;
export const noteColor = (p: Pick<Page, 'color'>): string => NOTE_COLORS[(p.color ?? 0) % NOTE_COLORS.length];

/** XP for the first diary entry of a day (a feeling alone counts). */
export const JOURNAL_XP = 10;
/** The most characters one page takes. Long pages are cut into several cloud values (lib/cloudCodec.ts). */
export const TEXT_LIMIT = 12_000;
export const TITLE_LIMIT = 80;

export const isNote = (p: Pick<Page, 'kind'>): boolean => p.kind === 'note';
/** Diary entries, newest day first; on one day the later one first. */
export const diaryOf = (pages: Page[]): Page[] =>
  pages.filter((p) => !isNote(p)).sort((a, b) => b.day.localeCompare(a.day) || b.at - a.at);
/** Notes: pinned ones first, then the most recently changed. */
export const notesOf = (pages: Page[]): Page[] =>
  pages.filter(isNote).sort((a, b) => Number(!!b.pin) - Number(!!a.pin) || (b.edited ?? b.at) - (a.edited ?? a.at));

/** Nothing in it: no title, no words and no feeling. Such a page is not kept. */
export const isBlank = (p: Pick<Page, 'title' | 'text' | 'mood'>): boolean =>
  !(p.title ?? '').trim() && !p.text.trim() && p.mood === undefined;

/** Words in a text, in any script. A list's marks are not words. */
export const wordCount = (text: string): number => (text.replace(/^\s*(?:[-•]|✓)\s+/gm, '').match(/\S+/g) ?? []).length;

// ---------- days written ----------

export function writtenDays(pages: Page[]): Set<string> {
  const days = new Set<string>();
  for (const p of pages) if (!isNote(p)) days.add(p.day);
  return days;
}

export const wroteOn = (pages: Page[], day: string): boolean => pages.some((p) => !isNote(p) && p.day === day);

/** The diary entry that was paid XP for a day, if there is one. */
export const paidOn = (pages: Page[], day: string): Page | undefined => pages.find((p) => !isNote(p) && p.day === day && !!p.xp);

/** Days in a row with a diary entry, counted back from today. A today not written yet does not break it. */
export function journalStreak(pages: Page[], today: string = dayKey()): number {
  const days = writtenDays(pages);
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

/** The longest run of days in a row there has been. */
export function bestJournalStreak(pages: Page[]): number {
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of [...writtenDays(pages)].sort()) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** How a day felt: the feeling of the latest diary entry of that day that has one. */
export function feelingOn(pages: Page[], day: string): Feeling | undefined {
  let found: Page | undefined;
  for (const p of pages) {
    if (isNote(p) || p.day !== day || p.mood === undefined) continue;
    if (!found || p.at > found.at) found = p;
  }
  return found?.mood;
}

export interface WeekDay {
  day: string;
  written: boolean;
  mood?: Feeling;
}

/** The last `n` days, oldest first, ending today. */
export function lastWritten(pages: Page[], today: string = dayKey(), n = 7): WeekDay[] {
  const days = writtenDays(pages);
  const out: WeekDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    out.push({ day, written: days.has(day), mood: feelingOn(pages, day) });
  }
  return out;
}

// ---------- the day's question ----------

/** Morning questions look ahead, evening ones look back. Their words are "ask.<id>" in the i18n files. */
export const MORNING_ASKS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'] as const;
export const EVENING_ASKS = [
  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e13', 'e14', 'e15', 'e16',
  'e17', 'e18', 'e19', 'e20', 'e21', 'e22', 'e23', 'e24', 'e25', 'e26', 'e27', 'e28', 'e29', 'e30', 'e31', 'e32',
] as const;
/** From this hour the question looks back on the day. */
export const EVENING_FROM = 16;

const dayNumber = (day: string): number => daysBetween('2026-01-01', day);

/**
 * The question for a day and hour. The same all morning and all evening; `skip` steps to other ones
 * (the "another question" button). The step is a number that shares no factor with the list's length,
 * so the questions come in a mixed order and none repeats until all were asked.
 */
export function askFor(day: string, hour: number, skip = 0): string {
  const evening = hour >= EVENING_FROM;
  const list: readonly string[] = evening ? EVENING_ASKS : MORNING_ASKS;
  const step = evening ? 11 : 3;
  const i = (((dayNumber(day) + skip) * step) % list.length + list.length) % list.length;
  return list[i];
}

export const isEveningAsk = (id: string): boolean => id.startsWith('e');

// ---------- a page in a list ----------

const MARK = /^\s*(?:[-•]|✓)\s+/;

/** What a page is called in a list: its title, or else its first line. */
export function headline(p: Pick<Page, 'title' | 'text'>): string {
  const title = (p.title ?? '').trim();
  if (title) return title;
  const first = p.text.split('\n').find((line) => line.trim());
  return (first ?? '').replace(MARK, '').trim();
}

/** The words under the headline: the rest of the text on one line, list marks as dots. */
export function excerpt(p: Pick<Page, 'title' | 'text'>, max = 220): string {
  const rows = p.text.split('\n').filter((line) => line.trim());
  if (!(p.title ?? '').trim()) rows.shift(); // the first line is the headline
  const flat = rows.map((line) => line.replace(/^\s*(?:[-•]|✓)\s+/, '• ').trim()).join(' ');
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

// ---------- lists inside a page ----------

export interface Line {
  /** p = words, item = a list item to do, done = one ticked off, gap = an empty line */
  kind: 'p' | 'item' | 'done' | 'gap';
  text: string;
  /** which line of the page's text this is */
  n: number;
}

export function linesOf(text: string): Line[] {
  return text.split('\n').map((raw, n) => {
    if (!raw.trim()) return { kind: 'gap', text: '', n };
    const done = /^\s*✓\s+/.test(raw);
    if (done || /^\s*[-•]\s+/.test(raw)) return { kind: done ? 'done' : 'item', text: raw.replace(MARK, ''), n };
    return { kind: 'p', text: raw, n };
  });
}

/** Ticks the list item on line `n`, or unticks it. Other lines are left as they are. */
export function toggleItem(text: string, n: number): string {
  const rows = text.split('\n');
  const row = rows[n];
  if (row === undefined) return text;
  if (/^\s*✓\s+/.test(row)) rows[n] = row.replace(/^(\s*)✓(\s+)/, '$1-$2');
  else if (/^\s*[-•]\s+/.test(row)) rows[n] = row.replace(/^(\s*)[-•](\s+)/, '$1✓$2');
  else return text;
  return rows.join('\n');
}

/**
 * What a new line does when the line before the caret is a list item: the list goes on ("- "), and
 * an empty item ends it. Returns the new text and caret, or null when the line is not a list item.
 * Call it with the text as it would be without the new line, and where the caret is.
 */
export function continueList(text: string, caret: number): { text: string; caret: number } | null {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const line = text.slice(start, caret);
  const m = /^(\s*)(?:[-•]|✓)(\s+)(.*)$/.exec(line);
  if (!m) return null;
  if (!m[3].trim()) {
    // an empty item: the list is over, and its mark goes
    return { text: text.slice(0, start) + text.slice(caret), caret: start };
  }
  const next = `\n${m[1]}- `;
  return { text: text.slice(0, caret) + next + text.slice(caret), caret: caret + next.length };
}

/** Puts a list mark at the start of the caret's line, or takes it away. */
export function toggleListAt(text: string, caret: number): { text: string; caret: number } {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const endAt = text.indexOf('\n', caret);
  const end = endAt < 0 ? text.length : endAt;
  const line = text.slice(start, end);
  const m = /^(\s*)(?:[-•]|✓)\s+/.exec(line);
  if (m) {
    const cut = m[0].length - m[1].length;
    return { text: text.slice(0, start) + m[1] + line.slice(m[0].length) + text.slice(end), caret: Math.max(start, caret - cut) };
  }
  return { text: `${text.slice(0, start)}- ${text.slice(start)}`, caret: caret + 2 };
}

// ---------- tags and search ----------

const TAG = /(^|[\s(])#([\p{L}\p{N}_]{1,24})/gu;

/** The #tags of a text in the order they first appear, lower case. */
export function tagsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG)) {
    const tag = m[2].toLowerCase();
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Every tag used in these pages, the most used first. */
export function allTags(pages: Page[]): string[] {
  const count = new Map<string, number>();
  for (const p of pages) for (const tag of tagsOf(`${p.title ?? ''} ${p.text}`)) count.set(tag, (count.get(tag) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

export const hasTag = (p: Page, tag: string): boolean => tagsOf(`${p.title ?? ''} ${p.text}`).includes(tag);

/** Pages whose title or text has every word of what was typed, whatever the capitals. */
export function searchPages(pages: Page[], query: string): Page[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pages;
  return pages.filter((p) => {
    const hay = `${p.title ?? ''}\n${p.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ---------- what the app knows about a day ----------

export interface DayFacts {
  prayers: number; // of the five
  tasks: { done: number; total: number };
  habits: { done: number; due: number };
  logs: number; // times progress was logged on a goal
  xp: number;
  quran: number; // pages
  focus: number; // minutes
}

/** What the app knows today that it will have forgotten later: Qurʼan pages and focus minutes. */
export function liveFacts(profile: Profile, day: string): { quran: number; focus: number } {
  return {
    quran: profile.khatm?.xpDay === day ? profile.khatm.xpPages ?? 0 : 0,
    focus: profile.focus?.day === day ? profile.focus.min : 0,
  };
}

/** A day as the app saw it. A diary entry of that day carries what the app has since forgotten. */
export function dayFacts(d: Data, day: string, page?: Pick<Page, 'quran' | 'focus'>): DayFacts {
  const plans = d.plans.filter((p) => p.day === day);
  const live = liveFacts(d.profile, day);
  return {
    prayers: prayedOn(d.worship ?? {}, day),
    tasks: { done: plans.filter((p) => p.doneAt).length, total: plans.length },
    habits: dayTally(d.habits, d.checks, day),
    logs: d.entries.filter((e) => dayKey(e.at) === day).length,
    xp: xpOnDay(d, day),
    quran: Math.max(page?.quran ?? 0, live.quran),
    focus: Math.max(page?.focus ?? 0, live.focus),
  };
}

export const hasFacts = (f: DayFacts): boolean =>
  f.prayers > 0 || f.tasks.total > 0 || f.habits.due > 0 || f.logs > 0 || f.xp > 0 || f.quran > 0 || f.focus > 0;

// ---------- looking back ----------

export interface Memory {
  page: Page;
  unit: 'year' | 'month';
  n: number;
}

/** A diary entry written on this date in an earlier year, or one, three or six months ago to the day. */
export function memoryFor(pages: Page[], today: string = dayKey()): Memory | null {
  const [y, m, d] = today.split('-').map(Number);
  const key = (year: number, month: number): string => {
    const date = new Date(year, month - 1, d);
    // A month without this day (the 31st) has no such date.
    return date.getDate() === d ? dayKey(date.getTime()) : '';
  };
  const diary = diaryOf(pages).filter((p) => p.text.trim());
  for (let n = 9; n >= 1; n--) {
    const page = diary.find((p) => p.day === key(y - n, m));
    if (page) return { page, unit: 'year', n };
  }
  for (const n of [6, 3, 1]) {
    const page = diary.find((p) => p.day === key(y, m - n));
    if (page) return { page, unit: 'month', n };
  }
  return null;
}

export interface JournalTotals {
  entries: number;
  days: number;
  notes: number;
  words: number;
}

export function journalTotals(pages: Page[]): JournalTotals {
  let entries = 0;
  let notes = 0;
  let words = 0;
  for (const p of pages) {
    if (isNote(p)) notes++;
    else entries++;
    words += wordCount(p.text);
  }
  return { entries, days: writtenDays(pages).size, notes, words };
}

/** How many days of a month ("YYYY-MM") felt each way. */
export function feelingsIn(pages: Page[], month: string): Record<Feeling, number> {
  const out: Record<Feeling, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const day of writtenDays(pages)) {
    if (!day.startsWith(month)) continue;
    const mood = feelingOn(pages, day);
    if (mood) out[mood]++;
  }
  return out;
}

export type Insight = { kind: 'prayers'; good: number; days: number } | { kind: 'run'; days: number } | null;

/**
 * Something worth telling about the days written. First: do the days with all five prayers feel
 * better? That is said only when there are enough such days and they really are the better ones.
 * Otherwise: the longest run of days in a row, when there is one worth naming.
 */
export function insight(pages: Page[], worship: Checks): Insight {
  let full = 0;
  let fullGood = 0;
  let other = 0;
  let otherGood = 0;
  for (const day of writtenDays(pages)) {
    const mood = feelingOn(pages, day);
    if (!mood) continue;
    const good = mood >= 4 ? 1 : 0;
    if (prayedOn(worship, day) === 5) {
      full++;
      fullGood += good;
    } else {
      other++;
      otherGood += good;
    }
  }
  if (full >= 5 && fullGood / full >= 0.6 && (other < 3 || fullGood / full > otherGood / other)) {
    return { kind: 'prayers', good: fullGood, days: full };
  }
  const best = bestJournalStreak(pages);
  return best >= 3 ? { kind: 'run', days: best } : null;
}

// ---------- a year in colours ----------

/**
 * One day in a year's grid: its feeling; 'plain' when it was written without one; 'blank' when it was
 * not written; 'later' when it has not come; null where the month has no such day.
 */
export type YearDot = Feeling | 'plain' | 'blank' | 'later' | null;

export interface YearView {
  year: number;
  /** Twelve months of thirty-one places each. */
  months: YearDot[][];
  /** How many days of the year felt each way. */
  counts: Record<Feeling, number>;
  /** Days written. */
  days: number;
  /** The longest run of days in a row inside the year. */
  run: number;
}

export function yearOf(pages: Page[], year: number, today: string = dayKey()): YearView {
  // Each written day of the year, with the feeling of its latest entry that has one (as feelingOn says).
  const felt = new Map<string, { at: number; mood?: Feeling }>();
  for (const p of pages) {
    if (isNote(p) || Number(p.day.slice(0, 4)) !== year) continue;
    const known = felt.get(p.day);
    if (!known) felt.set(p.day, { at: p.at, mood: p.mood });
    else if (p.mood !== undefined && (known.mood === undefined || p.at > known.at)) felt.set(p.day, { at: p.at, mood: p.mood });
  }
  const counts: Record<Feeling, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { mood } of felt.values()) if (mood) counts[mood]++;

  const months = Array.from({ length: 12 }, (_, m) => {
    const last = new Date(year, m + 1, 0).getDate();
    return Array.from({ length: 31 }, (_, i): YearDot => {
      if (i >= last) return null;
      const day = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const known = felt.get(day);
      if (known) return known.mood ?? 'plain';
      return day > today ? 'later' : 'blank';
    });
  });

  let run = 0;
  let now = 0;
  let prev = '';
  for (const day of [...felt.keys()].sort()) {
    now = prev && daysBetween(prev, day) === 1 ? now + 1 : 1;
    run = Math.max(run, now);
    prev = day;
  }
  return { year, months, counts, days: felt.size, run };
}

/** The years Looking back can show: the ones with diary entries, and this year. Oldest first. */
export function journalYears(pages: Page[], today: string = dayKey()): number[] {
  const years = new Set<number>([Number(today.slice(0, 4))]);
  for (const day of writtenDays(pages)) years.add(Number(day.slice(0, 4)));
  return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
}

// ---------- the journal as text ----------

/** The labels the text needs, in the reader's language (the app's own texts stay out of this file). */
export interface JournalWords {
  /** The heading of the whole text. */
  title: string;
  diary: string;
  notes: string;
  /** What a note without a title is called. */
  note: string;
  feelings: Record<Feeling, string>;
  /** A day written out: "Saturday, November 14, 2026". */
  date: (day: string) => string;
}

const ruled = (heading: string, mark: string): string => `${heading}\n${mark.repeat([...heading].length)}`;

/** A page's words as plain text: list items as "- ", ticked ones as "[x] ". */
function plainText(text: string): string {
  return linesOf(text.trimEnd())
    .map((line) => (line.kind === 'item' ? `- ${line.text}` : line.kind === 'done' ? `[x] ${line.text}` : line.kind === 'gap' ? '' : line.text))
    .join('\n');
}

/** One page: the line above it, its title, and its words after an empty line. */
function pageText(head: string, title: string, text: string): string {
  const top = [head, title].filter(Boolean).join('\n');
  const body = plainText(text);
  return body ? `${top}\n\n${body}` : top;
}

/**
 * The whole journal as one readable text: the diary from its first day to its last (each entry under its
 * date and how the day felt), then the notes with their titles and tags. An empty journal gives ''.
 */
export function journalText(pages: Page[], words: JournalWords): string {
  const diary = diaryOf(pages).reverse();
  const notes = notesOf(pages);
  if (diary.length === 0 && notes.length === 0) return '';
  const parts = [ruled(words.title, '=')];
  if (diary.length) {
    const entries = diary.map((p) =>
      pageText([words.date(p.day), p.mood ? words.feelings[p.mood] : ''].filter(Boolean).join(' · '), (p.title ?? '').trim(), p.text),
    );
    parts.push(`${ruled(words.diary, '-')}\n\n${entries.join('\n\n\n')}`);
  }
  if (notes.length) {
    const texts = notes.map((p) => {
      const tags = tagsOf(`${p.title ?? ''} ${p.text}`).map((tag) => `#${tag}`).join(' ');
      return pageText((p.title ?? '').trim() || words.note, [words.date(dayKey(p.edited ?? p.at)), tags].filter(Boolean).join(' · '), p.text);
    });
    parts.push(`${ruled(words.notes, '-')}\n\n${texts.join('\n\n\n')}`);
  }
  return `${parts.join('\n\n\n')}\n`;
}
