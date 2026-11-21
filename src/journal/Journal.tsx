// The journal: a diary of days and a place for notes. Here are the screen with both lists, the card
// on Home, and the pieces they share. The page itself (writing and reading) is PageScreen.tsx.
import { CSSProperties, useMemo, useState } from 'react';
import { ArrowsClockwise, BookOpen, Check, Fire, LockSimple, MagnifyingGlass, Note, PencilSimpleLine, Plus, PushPin, Sparkle, X } from '@phosphor-icons/react';
import { useData, useStore } from '../store/store';
import { Route, useNav } from '../store/nav';
import { Feeling, Page } from '../lib/types';
import { Data } from '../lib/stats';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import {
  EVENING_FROM, FEEL, Memory, WeekDay, allTags, askFor, dayFacts, diaryOf, excerpt, hasTag, headline, isNote, journalStreak, lastWritten, linesOf,
  memoryFor, noteColor, notesOf, paidOn, searchPages, tagsOf, wordCount,
} from '../lib/journal';
import { HIJRI_MONTHS, hijriDate } from '../lib/hijri';
import { Key, getLang, t, tn } from '../i18n';
import { dayLabel, fmtClock, fmtLongDate, fmtMonth, fmtWeekdayDate, weekdayMini, weekdayShort } from '../i18n/format';
import { Card, Empty, Header, IconBtn, Screen, Segmented, Tap, cx, Glyph } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { Face, FeelBar, feelName } from './Feel';
import { Private } from './Private';
import { useLocked } from './lock';

// ---------- shared ----------

export interface Ask {
  id: string;
  text: string;
  evening: boolean;
  another: () => void;
}

/** The question for this moment of the day; `another()` steps to the next one. */
export function useAsk(): Ask {
  const [skip, setSkip] = useState(0);
  const now = new Date();
  const id = askFor(dayKey(now.getTime()), now.getHours(), skip);
  return { id, text: t(`ask.${id}` as Key), evening: now.getHours() >= EVENING_FROM, another: () => setSkip((n) => n + 1) };
}

const askLabel = (ask: Ask): string => t(ask.evening ? 'j.ask.tonight' : 'j.ask.today');

/** One tap on a face: today's entry gets that feeling, and is started when there is none yet. */
function checkIn(feel: Feeling, ask: string): void {
  const s = useStore.getState();
  const today = dayKey();
  const page = diaryOf(s.pages).find((p) => p.day === today);
  s.savePage(page ? { id: page.id, title: page.title, text: page.text, mood: feel } : { text: '', mood: feel, ask }, true);
}

/** Rings spreading from the corner, like a thought settling, and a few stars beside them. */
function Rings() {
  const stars = [[312, 22, 1.3], [286, 46, 0.8], [326, 70, 0.9], [300, 92, 0.7], [270, 16, 0.6], [330, 118, 0.7]];
  return (
    <svg className="j-rings" viewBox="0 0 340 140" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
      {[52, 92, 134].map((r, i) => (
        <circle key={r} cx="340" cy="0" r={r} fill="none" stroke="#fff" strokeOpacity={0.13 - i * 0.03} strokeWidth="1.2" />
      ))}
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.8} />
      ))}
    </svg>
  );
}

function WriteButton({ onTap }: { onTap: () => void }) {
  return (
    <Tap className="j-write" onTap={onTap} scale={0.94}>
      <PencilSimpleLine size={18} weight="bold" />
      <span className="j-write-t">{t('j.write')}</span>
    </Tap>
  );
}

// ---------- Home ----------

/**
 * Home's card, and the door to the journal. Before today is written: the question, the five faces (one
 * tap is a whole check-in) and Write, with the journal itself behind the book in the corner. After: one
 * quiet line that opens the journal, and a pencil for adding to today's page. It never shows what was
 * written, and not the day's face either while the journal is locked.
 */
export function JournalCard() {
  const show = useStore((s) => s.settings.journalCard !== false);
  const pages = useStore((s) => s.pages);
  const push = useNav((s) => s.push);
  const ask = useAsk();
  const today = dayKey();
  const page = useMemo(() => diaryOf(pages).find((p) => p.day === today), [pages, today]);
  const streak = useMemo(() => journalStreak(pages, today), [pages, today]);
  const locked = useLocked();
  if (!show) return null;
  const openJournal = () => push({ name: 'journal' });

  if (page) {
    return (
      <div className="j-dusk j-done">
        <Rings />
        <Tap className="j-done-main" onTap={openJournal} scale={0.98}>
          <span className="j-done-ic">
            <Check size={22} weight="bold" />
          </span>
          <span className="grow">
            <b>{t('j.done.title')}</b>
            <small>{tn('j.row', streak)}</small>
          </span>
          {page.mood && !locked ? <Face feel={page.mood} size={30} /> : null}
        </Tap>
        <Tap className="j-more" onTap={() => push({ name: 'page', id: page.id })} label={t('j.done.addWords')} scale={0.88}>
          <PencilSimpleLine size={18} weight="bold" />
        </Tap>
      </div>
    );
  }
  const write = () => push({ name: 'page', ask: ask.id });
  return (
    <div className="j-dusk j-home">
      <Rings />
      <Tap className="j-home-main" onTap={write} scale={0.99}>
        <span className="j-eyebrow">
          <Emoji e="✍️" /> {t('j.title')} · {askLabel(ask)}
        </span>
        <span className="j-home-q">{ask.text}</span>
      </Tap>
      <div className="j-row">
        <FeelBar onPick={(feel) => checkIn(feel, ask.id)} />
        <WriteButton onTap={write} />
      </div>
      <Tap className="j-open" onTap={openJournal} label={t('j.open')} scale={0.88}>
        <BookOpen size={16} weight="bold" />
      </Tap>
    </div>
  );
}

// ---------- the screen ----------

export function Journal({ route }: { route: Extract<Route, { name: 'journal' }> }) {
  return (
    <Private title={t('j.title')}>
      <JournalBody first={route.tab ?? 'diary'} />
    </Private>
  );
}

const PAGE_STEP = 40;

function JournalBody({ first }: { first: 'diary' | 'notes' }) {
  const d = useData();
  const push = useNav((s) => s.push);
  const [tab, setTab] = useState(first);
  const [query, setQuery] = useState<string | null>(null); // null while the search is closed
  const [tag, setTag] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_STEP);
  const ask = useAsk();
  const today = dayKey();

  const diary = useMemo(() => diaryOf(d.pages), [d.pages]);
  const notes = useMemo(() => notesOf(d.pages), [d.pages]);
  const todays = diary.find((p) => p.day === today);
  const streak = useMemo(() => journalStreak(d.pages, today), [d.pages, today]);
  const week = useMemo(() => lastWritten(d.pages, today), [d.pages, today]);
  const memory = useMemo(() => memoryFor(d.pages, today), [d.pages, today]);
  const tags = useMemo(() => allTags(notes), [notes]);
  const found = useMemo(() => (query ? searchPages([...diary, ...notes], query) : []), [query, diary, notes]);
  const searching = query !== null;

  const fab =
    tab === 'notes' && !searching && notes.length > 0 ? (
      <Tap className="btn primary" onTap={() => push({ name: 'page', kind: 'note' })}>
        <PencilSimpleLine size={19} weight="bold" />
        {t('j.new.note')}
      </Tap>
    ) : undefined;

  return (
    <Screen fab={fab}>
      <Header
        title={t('j.title')}
        right={
          <IconBtn onTap={() => setQuery(searching ? null : '')} label={t(searching ? 'common.close' : 'j.search')}>
            {searching ? <X size={19} weight="bold" /> : <MagnifyingGlass size={20} />}
          </IconBtn>
        }
      />

      {searching ? (
        <>
          <label className="j-search">
            <MagnifyingGlass size={18} />
            <input
              className="bare grow"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('j.search')}
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          {query && found.length === 0 ? <div className="t-small muted center" style={{ padding: 24 }}>{t('j.search.none')}</div> : null}
          {found.map((p) => (isNote(p) ? <NoteRow key={p.id} page={p} /> : <EntryCard key={p.id} page={p} d={d} />))}
        </>
      ) : (
        <>
          {todays ? <HeroDone page={todays} xp={paidOn(d.pages, today)?.xp} /> : <Hero ask={ask} />}
          <Week streak={streak} days={week} onTap={() => push({ name: 'lookback' })} />
          <Segmented
            options={[{ id: 'diary', label: t('j.tab.diary') }, { id: 'notes', label: t('j.tab.notes') }]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'diary' ? (
            <DiaryList diary={diary} d={d} memory={memory} shown={shown} more={() => setShown((n) => n + PAGE_STEP)} />
          ) : (
            <NotesList notes={notes} tags={tags} tag={tag} setTag={setTag} />
          )}
        </>
      )}
    </Screen>
  );
}

function Hero({ ask }: { ask: Ask }) {
  const push = useNav((s) => s.push);
  const offset = useStore((s) => s.settings.hijriOffset ?? 0);
  const h = hijriDate(new Date(), offset);
  const hijri = h ? `${h.day} ${HIJRI_MONTHS[getLang()][h.month - 1]} ${h.year}` : '';
  const write = () => push({ name: 'page', ask: ask.id });
  return (
    <div className="j-dusk j-hero">
      <Rings />
      <div className="j-row">
        <span className="j-eyebrow">
          <Emoji e="✍️" /> {askLabel(ask)}
        </span>
        <Tap className="j-again" onTap={ask.another} label={t('j.another')} hap="select" scale={0.85}>
          <ArrowsClockwise size={16} weight="bold" />
        </Tap>
      </div>
      <div className="j-hero-date">
        {fmtWeekdayDate(Date.now())}
        {hijri ? ` · ${hijri}` : ''}
      </div>
      <Tap className="j-hero-q" onTap={write} scale={0.99}>
        {ask.text}
      </Tap>
      <div className="j-row">
        <FeelBar onPick={(feel) => checkIn(feel, ask.id)} />
        <WriteButton onTap={write} />
      </div>
    </div>
  );
}

function HeroDone({ page, xp }: { page: Page; xp?: number }) {
  const push = useNav((s) => s.push);
  const words = wordCount(page.text);
  const sub = [page.mood ? feelName(page.mood) : '', words ? tn('p.words', words) : ''].filter(Boolean).join(' · ');
  return (
    <div className="j-dusk j-done">
      <Rings />
      <Tap className="j-done-main" onTap={() => push({ name: 'page', id: page.id })} scale={0.98}>
        <span className="j-done-ic">
          <Check size={22} weight="bold" />
        </span>
        <span className="grow">
          <b>{t('j.done.title')}</b>
          <small>{words ? sub : t('j.done.addWords')}</small>
        </span>
      </Tap>
      {xp ? <span className="j-xp">{t('cel.xp', { n: xp })}</span> : null}
      <Tap className="j-more" onTap={() => push({ name: 'page' })} label={t('j.new.entry')} scale={0.88}>
        <Plus size={18} weight="bold" />
      </Tap>
    </div>
  );
}

/** The last seven days: a face for each day written, and how many days in a row. Opens Looking back. */
function Week({ streak, days, onTap }: { streak: number; days: WeekDay[]; onTap: () => void }) {
  return (
    <Tap onTap={onTap} scale={0.98} label={t('lb.title')}>
      <Card pad={false} className="j-week">
        <div className="j-streak">
          <Fire size={24} weight="fill" style={{ color: streak > 0 ? 'var(--orange)' : 'var(--text-3)' }} />
          <div>
            <b className="num">{streak}</b>
            <small>{t('j.inRow')}</small>
          </div>
        </div>
        <div className="j-wdays">
          {days.map((x, i) => (
            <div key={x.day} className={cx('j-wday', i === days.length - 1 && 'today')}>
              {x.mood ? <Face feel={x.mood} size={23} /> : <i className={cx('j-dot', x.written && 'on')} />}
              {weekdayMini(new Date(dayKeyToMs(x.day, 12)).getDay())}
            </div>
          ))}
        </div>
      </Card>
    </Tap>
  );
}

// ---------- the diary ----------

function DiaryList({ diary, d, memory, shown, more }: { diary: Page[]; d: Data; memory: Memory | null; shown: number; more: () => void }) {
  const perMonth = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of diary) count.set(p.day.slice(0, 7), (count.get(p.day.slice(0, 7)) ?? 0) + 1);
    return count;
  }, [diary]);

  if (diary.length === 0) {
    return (
      <>
        <Empty icon="📝" title={t('j.empty.diary.title')} body={t('j.empty.diary.body')} />
        <PrivateNote />
      </>
    );
  }
  let month = '';
  return (
    <>
      {memory ? <MemoryCard memory={memory} /> : null}
      {diary.slice(0, shown).map((p) => {
        const key = p.day.slice(0, 7);
        const head = key !== month;
        month = key;
        const [y, m] = key.split('-').map(Number);
        return (
          <div key={p.id} className="col tight">
            {head ? (
              <div className="j-month">
                <h2 className="t-h">{fmtMonth(y, m - 1)}</h2>
                <span>{tn('j.entries', perMonth.get(key) ?? 0)}</span>
              </div>
            ) : null}
            <EntryCard page={p} d={d} />
          </div>
        );
      })}
      {diary.length > shown ? (
        <Tap className="btn soft" onTap={more}>
          {t('j.older')}
        </Tap>
      ) : null}
      <PrivateNote />
    </>
  );
}

/** Where the journal is kept, said once at the foot of the diary. */
function PrivateNote() {
  return (
    <div className="j-private">
      <LockSimple size={14} weight="fill" />
      <span>{t('j.private')}</span>
    </div>
  );
}

/** What the app knows about a day, as a few small chips. */
function factChips(d: Data, page: Page): [string, string][] {
  const f = dayFacts(d, page.day, page);
  const chips: [string, string][] = [];
  if (f.prayers > 0) chips.push(['🕌', `${f.prayers}/5`]);
  if (f.tasks.total > 0) chips.push(['✅', `${f.tasks.done}/${f.tasks.total}`]);
  if (f.habits.due > 0) chips.push(['🔁', `${f.habits.done}/${f.habits.due}`]);
  if (f.quran > 0) chips.push(['📖', String(f.quran)]);
  if (f.focus > 0) chips.push(['⏱', t('p.min', { n: f.focus })]);
  return chips.slice(0, 3);
}

function EntryCard({ page, d }: { page: Page; d: Data }) {
  const push = useNav((s) => s.push);
  const date = new Date(dayKeyToMs(page.day, 12));
  const mood = page.mood;
  const head = headline(page) || (mood ? feelName(mood) : '');
  const body = excerpt(page);
  return (
    <Tap onTap={() => push({ name: 'page', id: page.id })} scale={0.98}>
      <Card pad={false} className="j-entry">
        {mood ? <i className="item-bar" style={{ background: FEEL[mood].color, boxShadow: `0 0 12px ${FEEL[mood].color}` }} /> : null}
        <div className="j-entry-date">
          <b className="num">{date.getDate()}</b>
          <small>{weekdayShort(date.getDay()).replace('.', '')}</small>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="j-entry-top">
            <span className="grow clip">{head}</span>
            {mood ? <Face feel={mood} size={22} /> : null}
          </div>
          {body ? <div className="j-entry-text clip-2">{body}</div> : null}
          <div className="j-meta">
            {factChips(d, page).map(([icon, value]) => (
              <span key={icon} className="j-chip">
                <Emoji e={icon} /> {value}
              </span>
            ))}
            <span className="j-time num">{fmtClock(page.at)}</span>
          </div>
        </div>
      </Card>
    </Tap>
  );
}

function MemoryCard({ memory }: { memory: Memory }) {
  const push = useNav((s) => s.push);
  const { page } = memory;
  return (
    <Tap onTap={() => push({ name: 'page', id: page.id })} scale={0.98}>
      <Card pad={false} className="j-memory">
        <span className="j-eyebrow">
          <Sparkle size={13} weight="fill" /> {tn(memory.unit === 'year' ? 'j.memory.year' : 'j.memory.month', memory.n)}
        </span>
        <p className="clip-2">“{[headline(page), excerpt(page, 120)].filter(Boolean).join('. ')}”</p>
        <small>
          {page.mood ? <Face feel={page.mood} size={16} /> : null}
          {fmtLongDate(dayKeyToMs(page.day, 12))}
        </small>
      </Card>
    </Tap>
  );
}

// ---------- notes ----------

function NotesList({ notes, tags, tag, setTag }: { notes: Page[]; tags: string[]; tag: string | null; setTag: (tag: string | null) => void }) {
  const push = useNav((s) => s.push);
  if (notes.length === 0) {
    return (
      <Empty icon="📌" title={t('j.empty.notes.title')} body={t('j.empty.notes.body')}>
        <Tap className="btn primary sm pill" onTap={() => push({ name: 'page', kind: 'note' })}>
          {t('j.new.note')}
        </Tap>
      </Empty>
    );
  }
  const active = tag && tags.includes(tag) ? tag : null;
  const list = active ? notes.filter((p) => hasTag(p, active)) : notes;
  const pinned = list.filter((p) => p.pin);
  const rest = list.filter((p) => !p.pin);
  return (
    <>
      {tags.length ? (
        <div className="j-tags">
          <Tap className={cx('j-tag', !active && 'on')} onTap={() => setTag(null)} hap="select" scale={0.95}>
            {t('common.all')}
          </Tap>
          {tags.map((x) => (
            <Tap key={x} className={cx('j-tag', active === x && 'on')} onTap={() => setTag(x)} hap="select" scale={0.95}>
              #{x}
            </Tap>
          ))}
        </div>
      ) : null}
      {pinned.length ? (
        <>
          <div className="j-label">
            <PushPin size={13} weight="fill" /> {t('j.pinned')}
          </div>
          <div className="j-notes">
            {pinned.map((p) => (
              <NoteCard key={p.id} page={p} />
            ))}
          </div>
        </>
      ) : null}
      {rest.length ? (
        <>
          {pinned.length ? <div className="j-label">{t('j.allNotes')}</div> : null}
          <div className="j-notes">
            {rest.map((p) => (
              <NoteCard key={p.id} page={p} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

const noteDate = (p: Page): string => dayLabel(dayKey(p.edited ?? p.at));

function NoteCard({ page }: { page: Page }) {
  const push = useNav((s) => s.push);
  // A line of nothing but tags is not shown twice: the card's foot names the tag.
  const rows = linesOf(page.text).filter((l) => l.kind !== 'gap' && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(l.text.trim()));
  const body = (page.title ?? '').trim() ? rows : rows.slice(1); // untitled: the first line is the headline
  const tag = tagsOf(`${page.title ?? ''} ${page.text}`)[0];
  return (
    <Tap className="j-note" style={{ '--c': noteColor(page) } as CSSProperties} onTap={() => push({ name: 'page', id: page.id })} scale={0.97}>
      <h3>
        <span>{headline(page) || t('p.note')}</span>
        {page.pin ? <PushPin size={15} weight="fill" /> : null}
      </h3>
      {body.slice(0, 6).map((l) =>
        l.kind === 'p' ? (
          <p key={l.n}>{l.text}</p>
        ) : (
          <span key={l.n} className={cx('j-li', l.kind === 'done' && 'done')}>{l.text}</span>
        ),
      )}
      <span className="j-note-foot">
        <span>{noteDate(page)}</span>
        {tag ? <b>#{tag}</b> : null}
      </span>
    </Tap>
  );
}

/** A note among search results: one row, in the note's colour. */
function NoteRow({ page }: { page: Page }) {
  const push = useNav((s) => s.push);
  const color = noteColor(page);
  return (
    <Tap onTap={() => push({ name: 'page', id: page.id })} scale={0.98}>
      <Card pad={false} className="item">
        <Glyph className="bubble" color={color} icon={<Note size={22} />} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body clip" style={{ display: 'block' }}>{headline(page) || t('p.note')}</span>
          <span className="t-small muted clip" style={{ display: 'block' }}>{excerpt(page, 90) || noteDate(page)}</span>
        </span>
      </Card>
    </Tap>
  );
}
