// Analytics: overall trend, the four stat tiles, weekly activity, and a closer look at habits, tasks and goals.
import { useMemo, useState } from 'react';
import { CalendarCheck, CaretRight, CheckCircle, Clock, Fire, TrendDown, TrendUp, Trophy } from '@phosphor-icons/react';
import { useData } from '../store/store';
import { useNav } from '../store/nav';
import { useWeek, weekRange, weekWords } from '../store/week';
import { LETTER_PARTS, Week, partText, weekParts } from '../lib/week';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { activeHabits, bestHabitStreak, completionRate, habitStreak, shiftDay } from '../lib/habits';
import { folderProgress } from '../lib/progress';
import { goalsRatio, lastDays, overallSeries, totals, xpSeries } from '../lib/stats';
import { t } from '../i18n';
import { fmtHours, pct, weekdayMini } from '../i18n/format';
import { Bar, Card, Chips, Empty, Header, Num, Ring, Screen, Section, Tap, cx } from '../ui/kit';
import { BarChart, LineChart } from '../ui/charts';
import { StatTile } from '../ui/parts';
import { Emoji } from '../ui/Emoji';

type View = 'overview' | 'habits' | 'tasks' | 'goals';
const DAY = 86400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function Trend({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span className={cx('pillnote', up ? 'green' : 'orange')}>
      {up ? <TrendUp size={13} /> : <TrendDown size={13} />}
      {up ? '+' : ''}{delta}%
    </span>
  );
}

/** The week so far in a line, in the words of the bot's Sunday letter. It opens the recap ("Your week"). */
function WeekCard({ week }: { week: Week }) {
  const open = useNav((s) => s.open);
  const words = weekWords();
  const line = week.empty
    ? t('week.empty.title')
    : weekParts(week).slice(0, LETTER_PARTS).map((part) => partText(week, part, words)).join(' · ');
  return (
    <Tap onTap={() => open({ name: 'week' })} scale={0.98}>
      <Card pad={false} className="row week-card">
        <span className="bubble" style={{ color: 'var(--blue-hi)', background: 'var(--accent-soft)' }}>
          <CalendarCheck size={22} />
        </span>
        <div className="grow">
          <div className="week-card-top">
            <b className="t-body clip">{t('week.title')}</b>
            <span>{weekRange(week)}</span>
          </div>
          <div className="week-card-line">{line}</div>
        </div>
        <CaretRight size={18} className="chev" weight="bold" />
      </Card>
    </Tap>
  );
}

export function Stats() {
  const d = useData();
  const push = useNav((s) => s.push);
  const [view, setView] = useState<View>('overview');
  const today = dayKey();
  const week = useWeek();

  const m = useMemo(() => {
    const days14 = lastDays(14, today);
    const series = overallSeries(d, days14);
    const thisWeek = avg(series.slice(7));
    const lastWeek = avg(series.slice(0, 7));
    // This week's XP, Monday to Sunday.
    const dow = (new Date(dayKeyToMs(today, 12)).getDay() + 6) % 7;
    const week = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - dow));
    const weekXp = xpSeries(d, week).map((x, i) => (i > dow ? 0 : x));
    const habits = activeHabits(d.habits);
    const from30 = shiftDay(today, -29);
    const last7 = lastDays(7, today);
    const since30 = Date.now() - 30 * DAY;
    const plans30 = d.plans.filter((p) => p.day >= from30 && p.day <= today);
    const doneOnDay = plans30.filter((p) => p.doneAt && dayKey(p.doneAt) === p.day).length;
    return {
      series,
      overall: thisWeek,
      delta: lastWeek > 0 ? Math.round((thisWeek - lastWeek) * 100) : null,
      all: totals(d, 0, today),
      week,
      weekXp,
      dow,
      habits,
      habitRate: completionRate(habits, d.checks, from30, today),
      ticks30: totals(d, since30, today).habitTicks,
      bestStreak: habits.reduce((b, h) => Math.max(b, bestHabitStreak(h, d.checks, today)), 0),
      perHabit: habits.map((h) => ({ h, rate: completionRate([h], d.checks, from30, today), streak: habitStreak(h, d.checks, today) })),
      planned30: plans30.length,
      finished30: plans30.filter((p) => p.doneAt).length,
      onDay: plans30.length ? doneOnDay / plans30.length : 0,
      tasksByDay: last7.map((day) => d.plans.filter((p) => p.doneAt && dayKey(p.doneAt) === day).length),
      last7Labels: last7.map((day) => weekdayMini(new Date(dayKeyToMs(day, 12)).getDay())),
      goalsAvg: goalsRatio(d),
      areas: d.folders.map((f) => ({ f, ratio: folderProgress(d.tasks.filter((x) => x.folderId === f.id), d.entries) })),
    };
  }, [d, today]);

  const nothing = d.entries.length === 0 && d.plans.length === 0 && d.habits.length === 0;

  return (
    <Screen>
      <Header title={t('stats.title')} />
      <Chips<View>
        value={view}
        onChange={setView}
        options={[
          { id: 'overview', label: t('stats.overview') },
          { id: 'habits', label: t('stats.habits') },
          { id: 'tasks', label: t('stats.tasks') },
          { id: 'goals', label: t('stats.goals') },
        ]}
      />

      {nothing ? <Empty icon="📊" title={t('stats.title')} body={t('stats.empty')} /> : null}
      {/* Prayers, Qurʼan and focus make a week too, with no goal, task or habit to chart. */}
      {nothing && !week.empty ? <WeekCard week={week} /> : null}

      {view === 'overview' && !nothing ? (
        <>
          <Card style={{ overflow: 'hidden', paddingBottom: 0 }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="t-display num" style={{ fontSize: 38 }}><Num value={m.overall * 100} format={(n) => `${Math.round(n)}%`} /></div>
                <div className="t-small muted" style={{ marginTop: 2 }}>{t('stats.overall')}</div>
              </div>
              <Trend delta={m.delta} />
            </div>
            <div style={{ margin: '6px -16px 0' }}>
              <LineChart values={m.series} />
            </div>
          </Card>

          <Section title={t('stats.yourStats')}>
            <div className="tiles">
              <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.all.tasksDone} />} label={t('stats.tasksDone')} onTap={() => setView('tasks')} />
              <StatTile icon={<Fire size={26} style={{ color: 'var(--orange)' }} fill="currentColor" />} value={<Num value={m.all.habitStreak} />} label={t('stats.habitStreak')} onTap={() => setView('habits')} />
              <StatTile icon={<Clock size={26} style={{ color: 'var(--blue-hi)' }} />} value={fmtHours(m.all.focusMinutes + (d.profile.focus?.free ?? 0))} label={t('stats.focus')} />
              <StatTile icon={<Trophy size={26} style={{ color: 'var(--gold)' }} />} value={<Num value={m.all.goalsActive} />} label={t('stats.goalsActive')} onTap={() => setView('goals')} />
            </div>
          </Section>

          <Section title={t('stats.weekly')} action={t('common.seeAll')} onAction={() => push({ name: 'progress' })}>
            <Card>
              <div className="t-small muted" style={{ marginBottom: 14 }}>{t('stats.weekXp', { n: m.weekXp.reduce((s, x) => s + x, 0) })}</div>
              <BarChart values={m.weekXp} labels={m.week.map((day) => weekdayMini(new Date(dayKeyToMs(day, 12)).getDay()))} highlight={m.dow} />
            </Card>
            <WeekCard week={week} />
          </Section>
        </>
      ) : null}

      {view === 'habits' && !nothing ? (
        <>
          <Card className="row" style={{ gap: 18 }}>
            <Ring value={m.habitRate} size={104} stroke={11} color="#34d399">
              <div className="t-title num">{pct(m.habitRate)}</div>
            </Ring>
            <div className="grow">
              <div className="t-body">{t('stats.rate')}</div>
              <div className="t-small muted" style={{ marginTop: 2 }}>{t('stats.rate.hint')}</div>
            </div>
          </Card>
          <div className="tiles">
            <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.ticks30} />} label={t('stats.ticks')} />
            <StatTile icon={<Fire size={26} style={{ color: 'var(--orange)' }} fill="currentColor" />} value={<Num value={m.bestStreak} />} label={t('stats.bestStreak')} />
          </div>
          {m.perHabit.length ? (
            <Section title={t('stats.perHabit')} action={t('common.seeAll')} onAction={() => push({ name: 'habits' })}>
              <Card className="col" style={{ gap: 16 }}>
                {m.perHabit.map(({ h, rate, streak }) => (
                  <div key={h.id}>
                    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}><Emoji e={h.icon} /></span>
                      <span className="t-small grow clip" style={{ fontWeight: 600 }}>{h.title}</span>
                      {streak > 1 ? <span className="pillnote orange"><Fire size={12} weight="bold" />{streak}</span> : null}
                      <span className="t-small num" style={{ fontWeight: 700, minWidth: 38, textAlign: 'right' }}>{pct(rate)}</span>
                    </div>
                    <Bar value={rate} color={h.color} height={6} />
                  </div>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}

      {view === 'tasks' && !nothing ? (
        <>
          <div className="tiles">
            <StatTile icon={<span style={{ fontSize: 24 }}><Emoji e="🗓️" /></span>} value={<Num value={m.planned30} />} label={t('stats.planned')} />
            <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.finished30} />} label={t('stats.finished')} />
          </div>
          <Card>
            <div className="row between">
              <span className="t-body">{t('stats.onTime')}</span>
              <span className="t-title num">{pct(m.onDay)}</span>
            </div>
            <div style={{ marginTop: 12 }}><Bar value={m.onDay} /></div>
            <div className="t-small muted" style={{ marginTop: 10 }}>{t('stats.rate.hint')}</div>
          </Card>
          <Section title={t('stats.byDay')}>
            <Card>
              <BarChart values={m.tasksByDay} labels={m.last7Labels} highlight={6} />
            </Card>
          </Section>
        </>
      ) : null}

      {view === 'goals' && !nothing ? (
        <>
          <Card className="row" style={{ gap: 18 }}>
            <Ring value={m.goalsAvg} size={104} stroke={11}>
              <div className="t-title num">{pct(m.goalsAvg)}</div>
            </Ring>
            <div className="grow">
              <div className="t-body">{t('stats.avg')}</div>
              <div className="t-small muted" style={{ marginTop: 2 }}>{t('stats.goalsActive')}: {m.all.goalsActive}</div>
            </div>
          </Card>
          <div className="tiles">
            <StatTile icon={<Trophy size={26} style={{ color: 'var(--gold)' }} />} value={<Num value={m.all.goalsDone} />} label={t('stats.goalsDone')} />
            <StatTile icon={<span style={{ fontSize: 24 }}><Emoji e="📝" /></span>} value={<Num value={m.all.logs} />} label={t('stats.logs')} />
          </div>
          {m.areas.length ? (
            <Section title={t('stats.byArea')} action={t('common.seeAll')} onAction={() => push({ name: 'goals' })}>
              <Card className="col" style={{ gap: 16 }}>
                {m.areas.map(({ f, ratio }) => (
                  <div key={f.id}>
                    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}><Emoji e={f.icon} /></span>
                      <span className="t-small grow clip" style={{ fontWeight: 600 }}>{f.name}</span>
                      <span className="t-small num" style={{ fontWeight: 700 }}>{pct(ratio)}</span>
                    </div>
                    <Bar value={ratio} color={f.color} height={6} />
                  </div>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
