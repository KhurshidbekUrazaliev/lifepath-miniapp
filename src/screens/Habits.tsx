// Habits: streak and monthly trend, a week of day tiles, the day's check-offs, and a progress chart.
import { useMemo, useState } from 'react';
import { Fire, Plus, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { activeHabits, completionRate, dayTally, isDue, shiftDay, topHabitStreak } from '../lib/habits';
import { t } from '../i18n';
import { pct, weekdayMini } from '../i18n/format';
import { Card, DayStrip, Empty, Header, Num, Screen, Section, Stagger, Tap } from '../ui/kit';
import { BarChart } from '../ui/charts';
import { HabitRow } from '../ui/parts';

export function Habits() {
  const all = useStore((s) => s.habits);
  const checks = useStore((s) => s.checks);
  const open = useNav((s) => s.open);
  const today = dayKey();
  const [day, setDay] = useState(today);
  const habits = useMemo(() => activeHabits(all), [all]);

  // The current week, Monday to Sunday.
  const week = useMemo(() => {
    const dow = (new Date(dayKeyToMs(today, 12)).getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => shiftDay(today, i - dow));
  }, [today]);

  const stats = useMemo(() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevEnd = shiftDay(monthStart, -1);
    const prevStart = `${prevEnd.slice(0, 7)}-01`;
    const thisMonth = completionRate(habits, checks, monthStart, today);
    const lastMonth = completionRate(habits, checks, prevStart, prevEnd);
    const last7 = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
    const bars = last7.map((d) => {
      const tally = dayTally(habits, checks, d);
      return tally.due ? tally.done / tally.due : 0;
    });
    return {
      streak: topHabitStreak(habits, checks, today),
      thisMonth,
      delta: lastMonth > 0 ? Math.round((thisMonth - lastMonth) * 100) : null,
      bars,
      labels: last7.map((d) => weekdayMini(new Date(dayKeyToMs(d, 12)).getDay())),
      weekRate: completionRate(habits, checks, last7[0], today),
    };
  }, [habits, checks, today]);

  const dueList = habits.filter((h) => isDue(h, day));
  const restList = habits.filter((h) => !isDue(h, day));
  const tally = dayTally(habits, checks, day);
  const future = day > today;
  const full = useMemo(() => new Set(week.filter((d) => { const x = dayTally(habits, checks, d); return x.due > 0 && x.done === x.due; })), [week, habits, checks]);

  return (
    <Screen
      fab={
        <Tap className="btn primary" onTap={() => open({ name: 'habit' })}>
          <Plus size={19} weight="bold" />
          {t('habits.add')}
        </Tap>
      }
    >
      <Header title={t('habits.title')} />

      {habits.length === 0 ? (
        <Empty icon="🌱" title={t('habits.empty.title')} body={t('habits.empty.body')} />
      ) : (
        <>
          <Card className="row" style={{ gap: 0, padding: '14px 16px' }}>
            <div className="row grow" style={{ gap: 12 }}>
              <span className="flame-ic glyph">
                <Fire size={26} fill="currentColor" />
              </span>
              <div>
                <div className="t-display num" style={{ fontSize: 26 }}><Num value={stats.streak} /></div>
                <div className="t-tiny muted">{t('habits.streak')}</div>
              </div>
            </div>
            <i style={{ width: 1, alignSelf: 'stretch', background: 'var(--stroke)', margin: '0 14px' }} />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}>
                {stats.delta !== null && stats.delta < 0 ? (
                  <TrendDown size={18} style={{ color: 'var(--orange)' }} />
                ) : (
                  <TrendUp size={18} style={{ color: 'var(--green)' }} />
                )}
                <span className="t-title num">
                  {stats.delta === null ? pct(stats.thisMonth) : `${stats.delta > 0 ? '+' : ''}${stats.delta}%`}
                </span>
              </div>
              <div className="t-tiny muted" style={{ marginTop: 2 }}>{t('habits.month')}</div>
            </div>
          </Card>

          <DayStrip days={week} value={day} onChange={setDay} marks={full} dim={(d) => d > today} />

          <Section title={day === today ? t('habits.today') : t('habits.on')} action={`${tally.done} / ${tally.due}`} onAction={() => setDay(today)}>
            <Stagger className="col tight" key={day}>
              {dueList.map((h) => (
                <HabitRow key={h.id} habit={h} day={day} disabled={future} />
              ))}
            </Stagger>
            {future ? <div className="t-small faint center">{t('habits.future')}</div> : null}
            {restList.length && !future ? (
              <div className="col tight" style={{ opacity: 0.55 }}>
                <div className="t-tiny faint" style={{ padding: '4px 2px 0' }}>{t('habits.notDue')}</div>
                {restList.map((h) => (
                  <HabitRow key={h.id} habit={h} day={day} disabled />
                ))}
              </div>
            ) : null}
          </Section>

          <Card>
            <div className="row between" style={{ marginBottom: 14 }}>
              <span className="t-body">{t('habits.progress')}</span>
              <span className="t-title num">{pct(stats.weekRate)}</span>
            </div>
            <BarChart values={stats.bars} labels={stats.labels} highlight={6} max={1} height={78} />
          </Card>
        </>
      )}
    </Screen>
  );
}
