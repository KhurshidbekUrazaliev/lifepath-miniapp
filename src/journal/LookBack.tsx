// Looking back: how much was written, a month or a whole year in the colours of its days, and what the
// good days share. From here the journal can also be taken out: as text, and a year as a picture (out.ts).
import { CSSProperties, Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, CopySimple, ImageSquare, Sparkle, X } from '@phosphor-icons/react';
import { useData } from '../store/store';
import { useNav } from '../store/nav';
import { useEcho } from '../store/echo';
import { Page } from '../lib/types';
import { dayKey } from '../lib/dates';
import {
  FEEL, FEELINGS, YearDot, diaryOf, feelingOn, feelingsIn, insight, journalStreak, journalTotals, journalYears, writtenDays, yearOf,
} from '../lib/journal';
import { locale, t, tn } from '../i18n';
import { fmtMonth, weekdayMini } from '../i18n/format';
import { Card, Header, Screen, Segmented, Tap, cx } from '../ui/kit';
import { CompanionThumb } from '../companion/CompanionThumb';
import { haptic } from '../tg/telegram';
import { Face } from './Feel';
import { Private } from './Private';
import { drawYear, monthInitials, sharePicture, useJournalOut } from './out';

export function LookBack() {
  return (
    <Private title={t('lb.title')}>
      <LookBackBody />
    </Private>
  );
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 6400 -> "6.4K": the words written are a number to glance at, not to read. */
function short(n: number): string {
  try {
    return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

function LookBackBody() {
  const d = useData();
  const push = useNav((s) => s.push);
  const echo = useEcho();
  const today = dayKey();
  const [view, setView] = useState<'month' | 'year'>('month');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null);
  const out = useJournalOut((text, ok) => setSaid(text ? { text, ok } : null));

  const totals = useMemo(() => journalTotals(d.pages), [d.pages]);
  const streak = useMemo(() => journalStreak(d.pages, today), [d.pages, today]);
  const written = useMemo(() => writtenDays(d.pages), [d.pages]);
  const diary = useMemo(() => diaryOf(d.pages), [d.pages]);
  const note = useMemo(() => insight(d.pages, d.worship ?? {}), [d.pages, d.worship]);

  const month = `${cursor.year}-${pad(cursor.month + 1)}`;
  const counts = useMemo(() => feelingsIn(d.pages, month), [d.pages, month]);
  // The month's days, Monday first, with empty cells before the 1st.
  const cells = useMemo(() => {
    const lead = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return [...new Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [cursor]);
  const isNow = month === today.slice(0, 7);

  const step = (by: number) =>
    setCursor((c) => {
      const next = new Date(c.year, c.month + by, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const openDay = (day: string) => {
    const page = diary.find((p) => p.day === day);
    if (page) push({ name: 'page', id: page.id });
    else if (day <= today) push({ name: 'page', day });
  };

  const stats: [string, string][] = [
    [String(totals.entries), t('lb.entries')],
    [String(streak), t('lb.row')],
    [short(totals.words), t('lb.words')],
  ];

  const noteText =
    note?.kind === 'prayers'
      ? t('lb.insight.prayers', { good: note.good, days: note.days })
      : note?.kind === 'run'
        ? tn('lb.insight.run', note.days)
        : t('lb.insight.none');

  return (
    <Screen>
      <Header title={t('lb.title')} noGear />

      <Card pad={false} className="j-stats">
        {stats.map(([value, label]) => (
          <div key={label}>
            <b className="num">{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </Card>

      <Segmented
        options={[{ id: 'month', label: t('lb.month') }, { id: 'year', label: t('lb.year') }]}
        value={view}
        onChange={setView}
      />

      {view === 'month' ? (
        <Card pad={false} className="j-cal">
          <div className="j-cal-head">
            <Tap className="j-cal-step" onTap={() => step(-1)} hap="select" label={fmtMonth(cursor.year, cursor.month - 1)} scale={0.85}>
              <CaretLeft size={18} weight="bold" />
            </Tap>
            <h2 className="t-h">{fmtMonth(cursor.year, cursor.month)}</h2>
            <Tap className="j-cal-step" onTap={() => step(1)} hap="select" disabled={isNow} label={fmtMonth(cursor.year, cursor.month + 1)} scale={0.85}>
              <CaretRight size={18} weight="bold" />
            </Tap>
          </div>
          <div className="j-cal-grid">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
              <div key={dow} className="j-cal-w">{weekdayMini(dow)}</div>
            ))}
            {cells.map((n, i) => {
              if (n === null) return <div key={`blank-${i}`} className="j-cal-d" />;
              const day = `${month}-${pad(n)}`;
              const has = written.has(day);
              const mood = has ? feelingOn(d.pages, day) : undefined;
              const tone = mood ? FEEL[mood].color : 'var(--violet)';
              return (
                <Tap
                  key={day}
                  className={cx('j-cal-d', has && 'has', day === today && 'today', day > today && 'later')}
                  style={has ? ({ '--mc': tone } as CSSProperties) : undefined}
                  onTap={() => openDay(day)}
                  disabled={day > today}
                  hap="select"
                  scale={0.86}
                >
                  <span className="num">{n}</span>
                </Tap>
              );
            })}
          </div>
          <div className="j-key">
            {FEELINGS.map((feel) => (
              <div key={feel}>
                <Face feel={feel} size={22} />
                <b className="num">{counts[feel]}</b>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <YearCard
          pages={d.pages}
          today={today}
          year={year}
          onYear={setYear}
          onMonth={(m) => {
            setCursor({ year, month: m });
            setView('month');
          }}
        />
      )}

      <Card pad={false} className="j-insight">
        {echo.echo ? (
          <div className="advisor-thumb">
            <CompanionThumb size={64} />
          </div>
        ) : (
          <span className="bubble" style={{ color: 'var(--violet)', background: 'var(--accent-soft)' }}>
            <Sparkle size={22} weight="fill" />
          </span>
        )}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t-tiny advisor-kind">{echo.echo ? t('lb.noticed', { name: echo.echo.name }) : t('lb.noticed.plain')}</div>
          <p>{noteText}</p>
        </div>
      </Card>

      <div className="j-out">
        <Tap className="j-out-btn" onTap={out.copy} scale={0.96}>
          <CopySimple size={14} weight="bold" />
          {t('data.jtext')}
        </Tap>
        {out.canShare ? (
          <Tap className="j-out-btn" onTap={out.share} scale={0.96}>
            {t('jtext.share')}
          </Tap>
        ) : null}
      </div>
      {said ? <div className="t-tiny center" style={{ color: said.ok ? 'var(--green)' : 'var(--orange)' }}>{said.text}</div> : null}
    </Screen>
  );
}

const DOT_CLASS: Record<Exclude<YearDot, number | null>, string> = { plain: 'plain', blank: 'blank', later: '' };

/**
 * A year at a glance: twelve months across, thirty-one days down, each day a dot in the colour of how
 * it felt. A month's initial opens that month. The year can be saved as a picture, which goes to the
 * phone's own share sheet and nowhere else.
 */
function YearCard({ pages, today, year, onYear, onMonth }: { pages: Page[]; today: string; year: number; onYear: (year: number) => void; onMonth: (month: number) => void }) {
  const years = useMemo(() => journalYears(pages, today), [pages, today]);
  const y = useMemo(() => yearOf(pages, year, today), [pages, year, today]);
  const initials = useMemo(monthInitials, []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const at = years.indexOf(year);
  const [nowYear, nowMonth, nowDate] = today.split('-').map(Number);
  const title = t('lb.year.title', { year });

  // The picture shown full-screen is held in memory until it is put away.
  useEffect(() => (picture ? () => URL.revokeObjectURL(picture) : undefined), [picture]);

  // A year that has just lost its last entry is no longer one to choose: back to this year.
  useEffect(() => {
    if (at < 0) onYear(nowYear);
  }, [at, nowYear, onYear]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await drawYear(y, title);
      // Where the phone has no share sheet for a file, the picture is shown to be pressed and held.
      if ((await sharePicture(blob, `lifepath-${year}.png`)) === 'unavailable') setPicture(URL.createObjectURL(blob));
    } catch {
      haptic('error');
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <>
      <Card pad={false} className="j-cal">
        <div className="j-cal-head">
          <Tap className="j-cal-step" onTap={() => onYear(years[at - 1])} hap="select" disabled={at <= 0} label={String(years[at - 1] ?? '')} scale={0.85}>
            <CaretLeft size={18} weight="bold" />
          </Tap>
          <h2 className="t-h num">{year}</h2>
          <Tap className="j-cal-step" onTap={() => onYear(years[at + 1])} hap="select" disabled={at < 0 || at >= years.length - 1} label={String(years[at + 1] ?? '')} scale={0.85}>
            <CaretRight size={18} weight="bold" />
          </Tap>
        </div>
        <div className="j-year">
          <i />
          {initials.map((letter, m) => (
            <Tap key={m} className="j-year-m" onTap={() => onMonth(m)} hap="select" disabled={year === nowYear && m + 1 > nowMonth} label={fmtMonth(year, m)} scale={0.85}>
              {letter}
            </Tap>
          ))}
          {Array.from({ length: 31 }, (_, i) => (
            <Fragment key={i}>
              <i className="j-year-n num">{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</i>
              {y.months.map((days, m) => {
                const dot = days[i];
                const isToday = year === nowYear && m + 1 === nowMonth && i + 1 === nowDate;
                return (
                  <i
                    key={m}
                    className={cx('j-year-d', typeof dot === 'number' ? 'felt' : dot ? DOT_CLASS[dot] : '', isToday && 'today')}
                    style={typeof dot === 'number' ? ({ '--mc': FEEL[dot].color } as CSSProperties) : undefined}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        {y.days > 0 ? (
          <>
            <div className="j-key">
              {FEELINGS.map((feel) => (
                <div key={feel}>
                  <Face feel={feel} size={22} />
                  <b className="num">{y.counts[feel]}</b>
                </div>
              ))}
            </div>
            <div className="j-year-sum">
              <div>
                <b className="num">{y.days}</b>
                <span>{t('lb.year.days')}</span>
              </div>
              <div>
                <b className="num">{y.run}</b>
                <span>{t('lb.year.run')}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="j-year-none">{t('lb.year.none', { year })}</p>
        )}
        <div className="j-year-legend">
          <span>
            <i className="j-year-d plain" />
            {t('lb.year.plain')}
          </span>
          <span>
            <i className="j-year-d blank" />
            {t('lb.year.blank')}
          </span>
        </div>
      </Card>

      {y.days > 0 ? (
        <Tap className="btn soft" onTap={() => void save()} disabled={busy}>
          <ImageSquare size={18} weight="bold" /> {busy ? t('story.busy') : t('lb.year.save')}
        </Tap>
      ) : null}
      {failed ? <div className="t-tiny center" style={{ color: 'var(--red)' }}>{t('lb.year.failed')}</div> : null}

      {picture
        ? createPortal(
            <div className="j-pic" role="dialog" aria-label={title} onClick={() => setPicture(null)}>
              <img src={picture} alt={title} onClick={(e) => e.stopPropagation()} />
              <p>{t('lb.year.hold')}</p>
              <Tap className="j-pic-x" onTap={() => setPicture(null)} label={t('common.close')} scale={0.9}>
                <X size={18} weight="bold" />
              </Tap>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
