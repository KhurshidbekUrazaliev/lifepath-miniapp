// One page of the journal: written here, and read here afterwards.
//
// The page saves itself. While it is being written it is saved a moment after the last change and
// whenever the app is put away; leaving it (Done, back, or the app's lock closing) finishes it, and
// that is when the first diary entry of a day earns its XP. A page with nothing in it is not kept.
import { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowsClockwise, CalendarBlank, CaretLeft, Hash, Lightbulb, ListBullets, Note, PencilSimple, PushPin, Smiley, Sparkle, Trash, X } from '@phosphor-icons/react';
import { useData, useStore } from '../store/store';
import { Route, useNav } from '../store/nav';
import { Feeling } from '../lib/types';
import { dayKey } from '../lib/dates';
import {
  EVENING_FROM, FEEL, NOTE_COLORS, TEXT_LIMIT, TITLE_LIMIT, askFor, continueList, dayFacts, hasFacts, isEveningAsk, linesOf, toggleItem,
  toggleListAt, wordCount,
} from '../lib/journal';
import { has, t, tn } from '../i18n';
import { dayLabel, fmtClock } from '../i18n/format';
import { Check, IconBtn, Tap, cx } from '../ui/kit';
import { useKeyboardInset } from '../ui/Sheet';
import { Emoji } from '../ui/Emoji';
import { confirmSheet } from '../sheets/confirm';
import { haptic, hideKeyboard } from '../tg/telegram';
import { Face, FeelBar, feelName } from './Feel';
import { Private } from './Private';

export function PageScreen({ route }: { route: Extract<Route, { name: 'page' }> }) {
  return (
    <Private title={t('j.title')}>
      <PageBody route={route} />
    </Private>
  );
}

/**
 * The page each open screen is writing, by the screen's key. A new page is saved under an id its screen
 * was not opened with. If the screen has to be drawn again (the journal's lock shuts when the app is put
 * away, and the page comes back once the check is passed), it goes on with that page, not a blank one.
 */
const writing = new Map<string, string>();

/** What is on the page while it is open. */
interface Draft {
  title: string;
  text: string;
  mood?: Feeling;
  pin: boolean;
  color?: number;
  ask?: string;
  day: string;
}

function askText(id?: string): string {
  const key = `ask.${id ?? ''}`;
  return id && has(key) ? t(key) : '';
}

/** The words of a line, with its #tags tinted. */
function tinted(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/(^|[\s(])(#[\p{L}\p{N}_]{1,24})/gu)) {
    const at = (m.index ?? 0) + m[1].length;
    if (at > last) out.push(text.slice(last, at));
    out.push(<span key={at} className="j-hash">{m[2]}</span>);
    last = at + m[2].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function PageBody({ route }: { route: Extract<Route, { name: 'page' }> }) {
  const pop = useNav((s) => s.pop);
  const d = useData();
  const today = dayKey();

  // The page as it was when it was opened (none for a new one), or the one this screen was writing.
  const [resumed] = useState(() => (route.id ? undefined : writing.get(route.key)));
  const [first] = useState(() => {
    const known = route.id ?? resumed;
    return known ? useStore.getState().pages.find((p) => p.id === known) : undefined;
  });
  const note = first ? first.kind === 'note' : route.kind === 'note';
  const [id, setId] = useState(first?.id);
  const stored = useStore((s) => (id ? s.pages.find((p) => p.id === id) : undefined));

  const [draft, setDraft] = useState<Draft>(() => {
    if (first) {
      return { title: first.title ?? '', text: first.text, mood: first.mood, pin: !!first.pin, color: first.color, ask: first.ask, day: first.day };
    }
    const day = route.day ?? today;
    // A new entry about today starts from the day's question, so the page is never quite blank.
    const ask = note ? undefined : route.ask ?? (day === today ? askFor(today, new Date().getHours()) : undefined);
    return { title: '', text: '', mood: route.mood, pin: false, color: note ? 0 : undefined, ask, day };
  });
  const [editing, setEditing] = useState(!first || !!resumed);
  const [picking, setPicking] = useState(false);

  const idRef = useRef(id);
  const latest = useRef(draft);
  latest.current = draft;
  const gone = useRef(false); // deleted: nothing more is saved
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null); // where the caret goes after the next draw
  const skip = useRef(0);

  useKeyboardInset();

  // ---------- saving ----------

  const commit = useCallback(
    (finish: boolean): string | null => {
      if (gone.current) return null;
      const now = latest.current;
      const saved = useStore.getState().savePage(
        { id: idRef.current, kind: note ? 'note' : undefined, day: now.day, title: now.title, text: now.text, mood: now.mood, pin: now.pin, color: now.color, ask: now.ask ?? '' },
        finish,
      );
      idRef.current = saved ?? undefined;
      setId(saved ?? undefined);
      if (!route.id) {
        if (saved) writing.set(route.key, saved);
        else writing.delete(route.key);
      }
      return saved;
    },
    [note, route.id, route.key],
  );

  // While writing: a moment after the last change. While reading, a change (a tick, a pin, a face) is final.
  const firstDraw = useRef(true);
  useEffect(() => {
    if (firstDraw.current) {
      firstDraw.current = false;
      return;
    }
    if (!editing) {
      commit(true);
      return;
    }
    const timer = setTimeout(() => commit(false), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) commit(false);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      commit(true); // leaving the page finishes it
    };
  }, [commit]);

  // A page that was opened by its id and is no longer there (deleted on another device): nothing to show.
  useEffect(() => {
    if (route.id && !first) pop();
  }, [route.id, first, pop]);

  const change = (patch: Partial<Draft>) => setDraft((now) => ({ ...now, ...patch }));

  // ---------- writing ----------

  /** Makes the textarea as tall as its text, and keeps the caret's line in sight above the keyboard. */
  const settle = useCallback(() => {
    const el = area.current;
    const box = scroller.current;
    const copy = mirror.current;
    if (!el || !box) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (!copy || document.activeElement !== el) return;
    copy.style.width = `${el.clientWidth}px`;
    copy.textContent = `${el.value.slice(0, el.selectionEnd)}​`;
    const bottom = el.offsetTop + copy.offsetHeight + 14;
    const top = bottom - 56;
    if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    else if (top < box.scrollTop) box.scrollTop = Math.max(0, top);
  }, []);

  useLayoutEffect(() => {
    const el = area.current;
    if (el && caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
    settle();
  }, [draft.text, editing, settle]);

  // The keyboard coming up or going away changes how much of the page shows.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !editing) return;
    const later = () => setTimeout(settle, 60);
    vv.addEventListener('resize', later);
    return () => vv.removeEventListener('resize', later);
  }, [editing, settle]);

  // A new page, or one just opened for editing, takes the keyboard at the end of its text.
  useEffect(() => {
    if (!editing) return;
    const el = area.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    const timer = setTimeout(settle, 320);
    return () => clearTimeout(timer);
  }, [editing, settle]);

  /** Puts new text in the textarea with the caret at `at`. */
  const put = (text: string, at: number) => {
    caret.current = Math.min(at, TEXT_LIMIT);
    change({ text: text.slice(0, TEXT_LIMIT) });
  };

  // Enter at the end of a list item goes on with the list; on an empty item it ends the list.
  useEffect(() => {
    const el = area.current;
    if (!el || !editing) return;
    const onBefore = (e: InputEvent) => {
      if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
      if (!e.cancelable || el.selectionStart !== el.selectionEnd) return;
      const next = continueList(el.value, el.selectionStart);
      if (!next) return;
      e.preventDefault();
      put(next.text, next.caret);
    };
    el.addEventListener('beforeinput', onBefore as EventListener);
    return () => el.removeEventListener('beforeinput', onBefore as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const makeList = () => {
    const el = area.current;
    if (!el) return;
    const next = toggleListAt(el.value, el.selectionStart);
    put(next.text, next.caret);
  };

  const addTag = () => {
    const el = area.current;
    if (!el) return;
    const at = el.selectionStart;
    const before = el.value.slice(0, at);
    const gap = before && !/\s$/.test(before) ? ' ' : '';
    put(`${before}${gap}#${el.value.slice(el.selectionEnd)}`, at + gap.length + 1);
  };

  // ---------- actions ----------

  const edit = () => {
    setPicking(false);
    setEditing(true);
  };

  const done = () => {
    hideKeyboard();
    setPicking(false);
    const saved = commit(true);
    if (saved) setEditing(false);
    else pop(); // nothing was written: there is no page to read
  };

  const remove = () => {
    confirmSheet({ title: t('p.delete.title'), body: t('p.delete.body'), confirm: t('common.delete') }, () => {
      gone.current = true;
      writing.delete(route.key);
      if (idRef.current) useStore.getState().deletePage(idRef.current);
      pop();
    });
  };

  const anotherAsk = () => {
    const hour = draft.ask && !isEveningAsk(draft.ask) ? 0 : EVENING_FROM;
    let next = draft.ask;
    for (let i = 0; i < 4 && next === draft.ask; i++) next = askFor(draft.day, hour, ++skip.current);
    haptic('select');
    change({ ask: next });
  };

  const tick = (line: number) => change({ text: toggleItem(draft.text, line) });

  // ---------- what shows ----------

  const mood = draft.mood;
  const tone = note ? NOTE_COLORS[(draft.color ?? 0) % NOTE_COLORS.length] : mood ? FEEL[mood].color : undefined;
  const question = note ? '' : askText(draft.ask);
  const words = wordCount(draft.text);
  const facts = note ? null : dayFacts(d, draft.day, stored);
  const canMove = editing && !note && !stored?.xp; // an entry that earned its XP keeps its day
  const when = stored ? fmtClock(stored.at) : fmtClock(Date.now());

  return (
    <div className={cx('j-page', note && 'note')} style={tone ? ({ '--mc': tone } as CSSProperties) : undefined}>
      <div className="j-bar">
        <IconBtn
          onTap={() => {
            commit(true); // now, not when the screen has finished sliding away
            pop();
          }}
          label={t('common.back')}
        >
          <CaretLeft size={22} weight="bold" />
        </IconBtn>
        <span className="j-datepill">
          {note ? <Note size={16} weight="bold" /> : <CalendarBlank size={16} weight="bold" />}
          {note ? t('p.note') : dayLabel(draft.day)}
          <i className="num">{note ? dayLabel(dayKey(stored?.edited ?? stored?.at ?? Date.now())) : draft.day === today || stored ? when : ''}</i>
          {canMove ? (
            <input
              className="j-dateinput"
              type="date"
              value={draft.day}
              max={today}
              aria-label={t('p.day.pick')}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= today) change({ day: e.target.value });
              }}
            />
          ) : null}
        </span>
        {editing ? (
          <Tap className="btn primary sm pill j-donebtn" onTap={done} hap="medium">
            {t('common.done')}
          </Tap>
        ) : (
          <IconBtn onTap={edit} label={t('common.edit')}>
            <PencilSimple size={19} />
          </IconBtn>
        )}
      </div>

      <div className="j-sheet" ref={scroller}>
        {question ? (
          <div className="j-ask">
            <Lightbulb size={19} weight="fill" style={{ color: 'var(--gold)', flex: 'none' }} />
            <span>{question}</span>
            {editing ? (
              <>
                <Tap className="j-askbtn" onTap={anotherAsk} hap={false} label={t('j.another')} scale={0.85}>
                  <ArrowsClockwise size={17} weight="bold" />
                </Tap>
                <Tap className="j-askbtn" onTap={() => change({ ask: undefined })} label={t('p.ask.drop')} scale={0.85}>
                  <X size={16} weight="bold" />
                </Tap>
              </>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <>
            <input
              className="bare j-title"
              value={draft.title}
              maxLength={TITLE_LIMIT}
              placeholder={t('p.title')}
              enterKeyHint="next"
              onChange={(e) => change({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  area.current?.focus();
                }
              }}
            />
            <textarea
              ref={area}
              className="bare j-text"
              value={draft.text}
              maxLength={TEXT_LIMIT}
              rows={4}
              placeholder={t(note ? 'p.hint.note' : 'p.hint.diary')}
              onChange={(e) => change({ text: e.target.value })}
              onSelect={settle}
              onFocus={() => setTimeout(settle, 320)}
            />
            <div ref={mirror} className="j-text j-mirror" aria-hidden="true" />
          </>
        ) : (
          <div className="j-read" onClick={edit}>
            {draft.title.trim() ? <h2 className="j-title">{draft.title}</h2> : null}
            {draft.text.trim() ? (
              linesOf(draft.text.trimEnd()).map((line) =>
                line.kind === 'gap' ? (
                  <div key={line.n} className="j-gap" />
                ) : line.kind === 'p' ? (
                  <p key={line.n} className="j-text">{tinted(line.text)}</p>
                ) : (
                  <div key={line.n} className={cx('j-item', line.kind === 'done' && 'done')}>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Tap className="j-tick" onTap={() => tick(line.n)} hap={line.kind === 'done' ? 'light' : 'medium'} label={line.text} scale={0.84}>
                        <Check on={line.kind === 'done'} size={22} />
                      </Tap>
                    </span>
                    <span className="j-text">{tinted(line.text)}</span>
                  </div>
                ),
              )
            ) : (
              <p className="j-text j-nothing">{t(note ? 'p.hint.note' : 'p.hint.diary')}</p>
            )}
          </div>
        )}

        {facts && hasFacts(facts) ? (
          <div className="j-day">
            <span className="j-eyebrow">
              <Sparkle size={13} weight="fill" /> {t('p.day')}
            </span>
            <div className="j-day-chips">
              {facts.prayers > 0 ? <Fact icon="🕌" text={t('p.fact.prayers', { n: facts.prayers })} /> : null}
              {facts.tasks.total > 0 ? <Fact icon="✅" text={t('p.fact.tasks', { done: facts.tasks.done, total: facts.tasks.total })} /> : null}
              {facts.habits.due > 0 ? <Fact icon="🔁" text={t('p.fact.habits', { done: facts.habits.done, total: facts.habits.due })} /> : null}
              {facts.quran > 0 ? <Fact icon="📖" text={tn('p.fact.quran', facts.quran)} /> : null}
              {facts.focus > 0 ? <Fact icon="⏱" text={t('p.fact.focus', { n: facts.focus })} /> : null}
              {facts.xp > 0 ? <Fact icon="⚡" text={t('common.xp', { n: facts.xp })} /> : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Touching a tool must not take the keyboard away from the page. */}
      <div className="j-tools" onMouseDown={(e) => e.preventDefault()}>
        {picking ? (
          <div className="j-pop">
            <FeelBar
              value={mood}
              size={34}
              onPick={(feel) => {
                change({ mood: feel === mood ? undefined : feel });
                setPicking(false);
              }}
            />
          </div>
        ) : null}
        {note ? (
          <>
            <Tap
              className="j-tool"
              onTap={() => change({ color: ((draft.color ?? 0) + 1) % NOTE_COLORS.length })}
              hap="select"
              label={t('p.tool.color')}
              scale={0.88}
            >
              <i className="j-colordot" />
            </Tap>
            <Tap className={cx('j-tool', draft.pin && 'on')} onTap={() => change({ pin: !draft.pin })} hap="select" label={t(draft.pin ? 'p.tool.unpin' : 'p.tool.pin')} scale={0.88}>
              <PushPin size={21} weight={draft.pin ? 'fill' : 'duotone'} />
            </Tap>
          </>
        ) : (
          <Tap className={cx('j-tool mood', !mood && 'none')} onTap={() => setPicking((on) => !on)} hap="select" label={t('p.tool.feel')} scale={0.94}>
            {mood ? <Face feel={mood} size={28} /> : <Smiley size={24} />}
            {mood ? feelName(mood) : t('p.tool.feel')}
          </Tap>
        )}
        {editing ? (
          <>
            <Tap className="j-tool" onTap={makeList} hap="select" label={t('p.tool.list')} scale={0.88}>
              <ListBullets size={22} weight="bold" />
            </Tap>
            <Tap className="j-tool" onTap={addTag} hap="select" label={t('p.tool.tag')} scale={0.88}>
              <Hash size={21} weight="bold" />
            </Tap>
          </>
        ) : null}
        {stored || !editing ? (
          <Tap className="j-tool" onTap={remove} hap={false} label={t('common.delete')} scale={0.88}>
            <Trash size={21} />
          </Tap>
        ) : null}
        <span className="j-count num">{tn('p.words', words)}</span>
      </div>
    </div>
  );
}

/** One thing the app knows about the day: the number stands out, the words follow. */
function Fact({ icon, text }: { icon: string; text: string }) {
  const cut = text.indexOf(' ');
  return (
    <span className="j-daychip">
      <Emoji e={icon} /> {cut < 0 ? text : text.slice(0, cut)} {cut < 0 ? null : <span>{text.slice(cut + 1)}</span>}
    </span>
  );
}
