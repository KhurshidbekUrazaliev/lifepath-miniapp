// Looking back: how much was written, a month in the colours of its days, and what the good days share.
import { CSSProperties, useMemo, useState } from 'react';
import { CaretLeft, CaretRight, Sparkle } from '@phosphor-icons/react';
import { useData } from '../store/store';
import { useNav } from '../store/nav';
import { useEcho } from '../store/echo';
import { dayKey } from '../lib/dates';
import { FEEL, FEELINGS, diaryOf, feelingOn, feelingsIn, insight, journalStreak, journalTotals, writtenDays } from '../lib/journal';
import { locale, t, tn } from '../i18n';
import { fmtMonth, weekdayMini } from '../i18n/format';
import { Card, Header, Screen, Tap, cx } from '../ui/kit';
import { CompanionThumb } from '../companion/CompanionThumb';
import { Face } from './Feel';
import { Private } from './Private';

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
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

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
    </Screen>
  );
}
