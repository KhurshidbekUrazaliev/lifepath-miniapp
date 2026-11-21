// Calendar: a month of activity dots and, below it, the chosen day as a timeline with a "now" line.
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CaretLeft, CaretRight, Notebook, PencilSimpleLine, Plus } from '@phosphor-icons/react';
import { useData } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { dayKeyToMs, parseTime } from '../lib/calendar';
import { dayTally, activeHabits } from '../lib/habits';
import { dayStats } from '../lib/stats';
import { t } from '../i18n';
import { fmtAmount, fmtClock, fmtMonth, fmtTime, fmtWeekdayDate, weekdayShort } from '../i18n/format';
import { Bar, Bubble, Card, Header, IconBtn, Screen, Section, Tap, cx, spring, Glyph } from '../ui/kit';
import { PlanItem } from '../ui/parts';
import { Route } from '../store/nav';
import { diaryOf, headline, writtenDays } from '../lib/journal';
import { Face, feelName } from '../journal/Feel';
import { useLocked } from '../journal/lock';

interface Cell {
  key: string;
  date: number;
  inMonth: boolean;
}

/** Full weeks covering the month, Monday first (as on the design). */
function monthCells(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(year, month, 1 - lead + i);
    return { key: dayKey(d.getTime()), date: d.getDate(), inMonth: d.getMonth() === month };
  });
}

export function Calendar({ route }: { route: Extract<Route, { name: 'calendar' }> }) {
  const d = useData();
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const locked = useLocked();
  const today = dayKey();
  const [day, setDay] = useState(route.day ?? today);
  const [cursor, setCursor] = useState(() => {
    const base = new Date(dayKeyToMs(route.day ?? today, 12));
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);

  // What happened on each day: planned to-dos, logs, and whether every habit was ticked.
  const marks = useMemo(() => {
    const m = new Map<string, { plans: number; logs: number; habits: boolean; written?: boolean }>();
    const get = (k: string) => m.get(k) ?? m.set(k, { plans: 0, logs: 0, habits: false }).get(k)!;
    for (const p of d.plans) get(p.day).plans++;
    for (const e of d.entries) get(dayKey(e.at)).logs++;
    for (const k of writtenDays(d.pages)) get(k).written = true;
    const habits = activeHabits(d.habits);
    for (const c of cells) {
      if (c.key > today) continue;
      const tally = dayTally(habits, d.checks, c.key);
      if (tally.due > 0 && tally.done === tally.due) get(c.key).habits = true;
    }
    return m;
  }, [d.plans, d.entries, d.habits, d.checks, d.pages, cells, today]);

  const written = useMemo(() => diaryOf(d.pages).filter((p) => p.day === day), [d.pages, day]);

  const move = (delta: number) =>
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const stats = useMemo(() => dayStats(d, day), [d, day]);
  const done = stats.tasks.done + stats.habits.done;
  const total = stats.tasks.total + stats.habits.total;

  // The day's agenda in time order: to-dos at their time, logs at the moment they were made.
  const agenda = useMemo(() => {
    const taskOf = (id?: string) => d.tasks.find((x) => x.id === id);
    const folderOf = (id?: string) => d.folders.find((f) => f.id === taskOf(id)?.folderId);
    const rows: { key: string; minutes: number; label: string; node: React.ReactNode }[] = [];
    for (const p of d.plans.filter((x) => x.day === day)) {
      const tm = parseTime(p.time);
      rows.push({
        key: p.id,
        minutes: tm ? tm.hour * 60 + tm.minute : 24 * 60 + 1,
        label: tm ? fmtTime(tm.hour, tm.minute) : '',
        node: <PlanItem plan={p} showDay={false} />,
      });
    }
    for (const e of d.entries.filter((x) => dayKey(x.at) === day)) {
      const task = taskOf(e.taskId);
      if (!task) continue;
      const folder = folderOf(e.taskId);
      const when = new Date(e.at);
      rows.push({
        key: e.id,
        minutes: when.getHours() * 60 + when.getMinutes(),
        label: fmtClock(e.at),
        node: (
          <Card pad={false} className="item" style={{ paddingTop: 11, paddingBottom: 11 }}>
            {folder ? <i className="item-bar" style={{ background: folder.color }} /> : null}
            <div className="grow">
              <div className="t-body clip">{task.title}</div>
              <div className="t-small muted clip">
                {t('cal.logged')} · {e.amount > 0 ? fmtAmount(e.amount, task.unit, task.progressType) : (e.note ?? '')}
              </div>
            </div>
            <span className="pillnote">+{e.xp} XP</span>
            <Bubble icon={folder?.icon ?? '📌'} color={folder?.color} size="sm" />
          </Card>
        ),
      });
    }
    return rows.sort((a, b) => a.minutes - b.minutes);
  }, [d.plans, d.entries, d.tasks, d.folders, day]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowIndex = day === today ? agenda.findIndex((r) => r.minutes > nowMinutes) : -1;
  const nowLine = (
    <div className="nowline" key="now">
      <span className="num">{fmtClock(now.getTime())}</span>
      <i />
    </div>
  );

  return (
    <Screen>
      <Header title={t('cal.title')} />

      <Card style={{ padding: '14px 12px 12px' }}>
        <div className="row between" style={{ padding: '0 2px 12px' }}>
          <IconBtn small onTap={() => move(-1)} label="‹">
            <CaretLeft size={18} weight="bold" />
          </IconBtn>
          <Tap
            className="t-body"
            style={{ width: 'auto', padding: '6px 10px' }}
            onTap={() => {
              const base = new Date();
              setCursor({ year: base.getFullYear(), month: base.getMonth() });
              setDay(today);
            }}
          >
            {fmtMonth(cursor.year, cursor.month)}
          </Tap>
          <IconBtn small onTap={() => move(1)} label="›">
            <CaretRight size={18} weight="bold" />
          </IconBtn>
        </div>
        <div className="cal-grid">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
            <span key={dow} className="t-tiny faint center" style={{ paddingBottom: 6 }}>{weekdayShort(dow)}</span>
          ))}
          {cells.map((c) => {
            const m = marks.get(c.key);
            const isToday = c.key === today;
            const selected = c.key === day;
            return (
              <button
                key={c.key}
                type="button"
                className={cx('cal-cell', !c.inMonth && 'out', isToday && 'today', selected && 'sel')}
                onClick={() => setDay(c.key)}
              >
                {selected ? <motion.i layoutId="cal-sel" className="cal-sel" transition={spring} /> : null}
                <span className="num">{c.date}</span>
                <span className="cal-dots">
                  {m?.plans ? <i style={{ background: 'var(--blue-hi)' }} /> : null}
                  {m?.logs ? <i style={{ background: 'var(--pink)' }} /> : null}
                  {m?.habits ? <i style={{ background: 'var(--green)' }} /> : null}
                  {m?.written ? <i style={{ background: 'var(--violet)' }} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="row between">
          <span className="t-body">{day === today ? t('cal.summary.today') : t('cal.summary')}</span>
          <span className="t-body num">{done} / {total}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <Bar value={total ? done / total : 0} />
        </div>
        <div className="row between t-small muted" style={{ marginTop: 10 }}>
          <span>{fmtWeekdayDate(dayKeyToMs(day, 12))}</span>
          <span className="num">{stats.xp.value} XP</span>
        </div>
      </Card>

      <Section title={t('tasks.title')} action={t('cal.plan')} onAction={() => open({ name: 'task', day })}>
        {agenda.length === 0 ? (
          <Tap onTap={() => open({ name: 'task', day })} scale={0.98}>
            <Card className="row" style={{ gap: 12 }}>
              <Glyph className="bubble sm" color="var(--blue-hi)" icon={<Plus size={18} />} />
              <span className="t-small muted">{t('cal.empty')}</span>
            </Card>
          </Tap>
        ) : (
          <div className="agenda">
            {agenda.map((r, i) => (
              <div key={r.key}>
                {i === nowIndex ? nowLine : null}
                <div className="agenda-row">
                  <span className="agenda-time t-tiny faint num">{r.label}</span>
                  <div className="grow">{r.node}</div>
                </div>
              </div>
            ))}
            {day === today && nowIndex === -1 ? nowLine : null}
          </div>
        )}
      </Section>

      {written.length > 0 || day <= today ? (
        <Section title={t('cal.journal')}>
          {written.map((p) => (
            <Tap key={p.id} onTap={() => push({ name: 'page', id: p.id })} scale={0.98}>
              <Card pad={false} className="item" style={{ paddingTop: 11, paddingBottom: 11 }}>
                {p.mood ? <Face feel={p.mood} size={34} /> : <Glyph className="bubble sm" color="var(--violet)" icon={<Notebook size={18} />} />}
                {/* A locked journal shows that the day was written, not what. */}
                <span className="grow t-body clip">{locked ? t('cal.journal.entry') : headline(p) || (p.mood ? feelName(p.mood) : t('cal.journal.entry'))}</span>
                <CaretRight size={18} weight="bold" className="chev" />
              </Card>
            </Tap>
          ))}
          {written.length === 0 ? (
            <Tap onTap={() => push({ name: 'page', day })} scale={0.98}>
              <Card className="row" style={{ gap: 12 }}>
                <Glyph className="bubble sm" color="var(--blue-hi)" icon={<PencilSimpleLine size={18} />} />
                <span className="t-small muted">{t('cal.journal.write')}</span>
              </Card>
            </Tap>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}
