// Analytics: overall trend, the four stat tiles, weekly activity, and a closer look at habits, tasks and goals.
import { useMemo, useState } from 'react';
import { CalendarCheck, CaretLeft, CaretRight, CheckCircle, Clock, Fire, TrendDown, TrendUp, Trophy } from '@phosphor-icons/react';
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
import { dayLabel, fmtHours, fmtShortDate, pct, weekdayMini } from '../i18n/format';
import { Bar, Card, Chips, Empty, Header, Num, Ring, Screen, Section, Segmented, Tap, cx } from '../ui/kit';
import { BarChart, LineChart } from '../ui/charts';
import { StatTile } from '../ui/parts';
import { Emoji } from '../ui/Emoji';

type View = 'overview' | 'habits' | 'tasks' | 'goals';
type Period = 'week' | 'month' | 'year';
/** How many days each period looks back over; the year is read a week at a time. */
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 364 };
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
  const [period, setPeriod] = useState<Period>('week');
  const [weeksBack, setWeeksBack] = useState(0);
  const today = dayKey();
  const week = useWeek();

  const m = useMemo(() => {
    // This week's XP, Monday to Sunday.
    const dow = (new Date(dayKeyToMs(today, 12)).getDay() + 6) % 7;
    const habits = activeHabits(d.habits);
    const from30 = shiftDay(today, -29);
    const last7 = lastDays(7, today);
    const since30 = Date.now() - 30 * DAY;
    const plans30 = d.plans.filter((p) => p.day >= from30 && p.day <= today);
    const doneOnDay = plans30.filter((p) => p.doneAt && dayKey(p.doneAt) === p.day).length;
    return {
      all: totals(d, 0, today),
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

  // The trend over the chosen period, against the period before it. A year is drawn a week at a time.
  const trendOf = useMemo(() => {
    const n = PERIOD_DAYS[period];
    const days = lastDays(n * 2, today);
    const all = overallSeries(d, days);
    const now = all.slice(n);
    const before = all.slice(0, n);
    const current = avg(now);
    const previous = avg(before);
    const byWeek = period === 'year';
    const points = byWeek ? Array.from({ length: n / 7 }, (_, i) => avg(now.slice(i * 7, i * 7 + 7))) : now;
    const starts = byWeek ? Array.from({ length: n / 7 }, (_, i) => days[n + i * 7]) : days.slice(n);
    return {
      points,
      label: (i: number) => `${byWeek ? fmtShortDate(dayKeyToMs(starts[i], 12)) : dayLabel(starts[i], today)} · ${pct(points[i])}`,
      overall: current,
      delta: previous > 0 ? Math.round((current - previous) * 100) : null,
    };
  }, [d, today, period]);

  // XP a week, Monday to Sunday: this one, or one before it.
  const xpWeek = useMemo(() => {
    const monday = shiftDay(today, -m.dow - weeksBack * 7);
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
    const xp = xpSeries(d, days).map((x, i) => (days[i] > today ? 0 : x));
    return { days, xp, total: xp.reduce((s, x) => s + x, 0) };
  }, [d, today, m.dow, weeksBack]);

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
                <div className="t-display num" style={{ fontSize: 38 }}><Num value={trendOf.overall * 100} format={(n) => `${Math.round(n)}%`} /></div>
                <div className="t-small muted" style={{ marginTop: 2 }}>{t('stats.overall')}</div>
              </div>
              <Trend delta={trendOf.delta} />
            </div>
            <div className="stats-period">
              <Segmented<Period>
                value={period}
                onChange={setPeriod}
                options={[
                  { id: 'week', label: t('stats.period.week') },
                  { id: 'month', label: t('stats.period.month') },
                  { id: 'year', label: t('stats.period.year') },
                ]}
              />
            </div>
            <div className="t-tiny faint" style={{ marginTop: 10 }}>{t('stats.touchHint')}</div>
            <div style={{ margin: '34px -16px 0' }}>
              <LineChart key={period} values={trendOf.points} label={trendOf.label} />
            </div>
          </Card>

          <Section title={t('stats.yourStats')}>
            <div className="tiles">
              <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.all.tasksDone} />} label={t('stats.tasksDone')} onTap={() => setView('tasks')} />
              <StatTile icon={<Fire size={26} style={{ color: 'var(--orange)' }} fill="currentColor" />} value={<Num value={m.all.habitStreak} />} label={t('stats.habitStreak')} onTap={() => setView('habits')} />
              <StatTile icon={<Clock size={26} style={{ color: 'var(--blue-hi)' }} />} value={fmtHours(m.all.focusMinutes + (d.profile.focus?.free ?? 0))} label={t('stats.focus')} onTap={() => push({ name: 'focus' })} />
              <StatTile icon={<Trophy size={26} style={{ color: 'var(--gold)' }} />} value={<Num value={m.all.goalsActive} />} label={t('stats.goalsActive')} onTap={() => setView('goals')} />
            </div>
          </Section>

          <Section title={t('stats.weekly')} action={t('common.seeAll')} onAction={() => push({ name: 'progress' })}>
            <Card>
              <div className="row between" style={{ marginBottom: 14 }}>
                <Tap className="week-step" onTap={() => setWeeksBack((w) => Math.min(12, w + 1))} disabled={weeksBack >= 12} label={t('stats.weekBack')}>
                  <CaretLeft size={16} weight="bold" />
                </Tap>
                <div className="center">
                  <div className="t-small" style={{ fontWeight: 700 }}>
                    {weeksBack === 0 ? t('stats.thisWeek') : `${fmtShortDate(dayKeyToMs(xpWeek.days[0], 12))} – ${fmtShortDate(dayKeyToMs(xpWeek.days[6], 12))}`}
                  </div>
                  <div className="t-tiny muted">{t('stats.xpTotal', { n: xpWeek.total })}</div>
                </div>
                <Tap className="week-step" onTap={() => setWeeksBack((w) => Math.max(0, w - 1))} disabled={weeksBack === 0} label={t('stats.weekNext')}>
                  <CaretRight size={16} weight="bold" />
                </Tap>
              </div>
              <BarChart
                key={weeksBack}
                values={xpWeek.xp}
                labels={xpWeek.days.map((day) => weekdayMini(new Date(dayKeyToMs(day, 12)).getDay()))}
                highlight={weeksBack === 0 ? m.dow : undefined}
                label={(i) => t('stats.xpTotal', { n: xpWeek.xp[i] })}
              />
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
            <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.ticks30} />} label={t('stats.ticks')} onTap={() => push({ name: 'habits' })} />
            <StatTile icon={<Fire size={26} style={{ color: 'var(--orange)' }} fill="currentColor" />} value={<Num value={m.bestStreak} />} label={t('stats.bestStreak')} />
          </div>
          {m.perHabit.length ? (
            <Section title={t('stats.perHabit')} action={t('common.seeAll')} onAction={() => push({ name: 'habits' })}>
              <Card className="col" style={{ gap: 16 }}>
                {m.perHabit.map(({ h, rate, streak }) => (
                  <Tap key={h.id} onTap={() => push({ name: 'habits' })} scale={0.98}>
                    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}><Emoji e={h.icon} /></span>
                      <span className="t-small grow clip" style={{ fontWeight: 600 }}>{h.title}</span>
                      {streak > 1 ? <span className="pillnote orange"><Fire size={12} weight="bold" />{streak}</span> : null}
                      <span className="t-small num" style={{ fontWeight: 700, minWidth: 38, textAlign: 'right' }}>{pct(rate)}</span>
                    </div>
                    <Bar value={rate} color={h.color} height={6} />
                  </Tap>
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
            <StatTile icon={<CheckCircle size={26} style={{ color: 'var(--green)' }} />} value={<Num value={m.finished30} />} label={t('stats.finished')} onTap={() => push({ name: 'tasks' })} />
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
              <BarChart values={m.tasksByDay} labels={m.last7Labels} highlight={6} label={(i) => String(m.tasksByDay[i])} />
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
                  <Tap key={f.id} onTap={() => push({ name: 'area', id: f.id })} scale={0.98}>
                    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}><Emoji e={f.icon} /></span>
                      <span className="t-small grow clip" style={{ fontWeight: 600 }}>{f.name}</span>
                      <span className="t-small num" style={{ fontWeight: 700 }}>{pct(ratio)}</span>
                    </div>
                    <Bar value={ratio} color={f.color} height={6} />
                  </Tap>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
